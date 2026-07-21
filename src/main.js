require("dotenv").config();

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  session,
  desktopCapturer,
  Menu,
  Tray,
  shell,
} = require("electron");
const fs = require("fs");
const path = require("path");
const {
  ensureScreenRecordingPermission,
  captureFullScreen,
  getRecentScreenshots,
} = require("./screenshot");
const { initializeLLMService } = require("./llm-service");
const config = require("./config");

const isDev = process.argv.includes("--debug") || process.argv.includes("--inspect");

if (process.env.E2E_DISABLE_HARDWARE_ACCELERATION === "1") {
  app.disableHardwareAcceleration();
}

const PREDEFINED_PROMPTS = {
  "default": "Analyze this screenshot and provide insights.",
  "hackerrank": `<poml version="3.0">
  <role>Expert SWE</role>
  <task>
    Analyze the coding interview problem (typically on the left side of the screenshot). Produce a production-grade, optimal solution in Python.
    <steps>
      <step>State the core problem and constraints.</step>
      <step>Determine the optimal algorithm (optimize for the best possible Big-O Time and Space complexity).</step>
      <step>Write clean, robust, and commented code in Python to solve it. Ensure you handle all edge cases and test cases.</step>
      <step>Explicitly state the Time and Space Complexity (Big-O).</step>
      <step>Suggest potential follow-up questions and briefly answer them.</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-general": `<poml version="3.0">
  <role>Expert SWE & Competitive Programmer</role>
  <task>
    Analyze the coding interview problem (typically on the left side of the screenshot) and any starter code or editor contents. Produce a production-grade, optimal solution.
    <steps>
      <step>Identify the programming language being used in the editor pane. If none is clearly visible, default to Python.</step>
      <step>State the core problem and constraints.</step>
      <step>Determine the optimal algorithm (optimize for the best possible Big-O Time and Space complexity).</step>
      <step>Write clean, robust, and commented code in the identified programming language to solve it. Ensure you conform to starter function signatures and handle all edge cases and test cases.</step>
      <step>Explicitly state the Time and Space Complexity (Big-O).</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-frontend": `<poml version="3.0">
  <role>Expert real-time interview copilot for frontend coding interviews</role>
  <task>
    Analyze the frontend coding interview problem (typically on the left side of the screenshot). Produce a production-grade, interview-ready solution using the most appropriate frontend language and framework from the prompt context.
    <steps>
      <step>State the problem, inputs, outputs, constraints, UI behaviors, and any browser or state-management assumptions. If the prompt is ambiguous, state the most likely assumption briefly.</step>
      <step>Determine the best solution strategy and explain the key trade-offs, including component structure, state flow, rendering approach, accessibility, and performance implications when relevant.</step>
      <step>Write clean, robust, and commented code that solves the problem. Prefer JavaScript/TypeScript and React when the prompt is frontend/UI-oriented unless the prompt explicitly requires another stack.</step>
      <step>For UI problems, include the minimal supporting markup, styles, and event handling needed to make the solution complete and practical in a HackerRank environment.</step>
      <step>Call out edge cases, accessibility concerns, browser pitfalls, and test scenarios.</step>
      <step>Explicitly state Time and Space Complexity where applicable, and note when the dominant concern is rendering, event frequency, or network latency rather than algorithmic complexity.</step>
      <step>Suggest likely interviewer follow-ups and briefly answer them at a Staff/Lead-level, connecting implementation choices to scalability, maintainability, and user experience.</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-frontend-v2": `<poml version="3.0">
  <role>Expert real-time interview copilot for frontend coding interviews</role>
  <task>
    Analyze this HackerRank-style frontend interview layout carefully.
    <steps>
      <step>Treat the left pane as the source of truth for the problem statement, requirements, constraints, and examples.</step>
      <step>Treat the middle/editor pane as the current candidate code or JSX scaffold. Read it to understand the expected file shape, props, component names, starter code, and submission format.</step>
      <step>Produce a complete solution, not partial guidance. Output the full final JSX/TSX/JavaScript code needed for the answer, including the functional logic, event handling, state updates, helper functions, and minimal supporting structure required by the prompt.</step>
      <step>If the problem is React-based, return the full component implementation that could replace the starter code directly. Preserve required function names, props, and exported symbols when visible in the editor pane.</step>
      <step>If styling is required to make the solution complete, include the necessary CSS or inline styles only to the extent required by the prompt. Do not omit runnable UI details when they are part of the task.</step>
      <step>Briefly state assumptions only when the screenshot is ambiguous. Otherwise, commit to the most likely intended solution.</step>
      <step>After the code, include a short explanation covering approach, edge cases, accessibility concerns, and performance trade-offs when relevant.</step>
      <step>Explicitly state Time and Space Complexity where applicable.</step>
      <step>Do not just describe the fix. Return the final complete solution first.</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-frontend-v3": `<poml version="3.0">
  <role>Expert real-time interview copilot for frontend coding interviews</role>
  <task>
    Analyze this HackerRank-style frontend interview layout and return a submission-ready final answer.
    <steps>
      <step>Use the left pane as the source of truth for the problem statement, examples, constraints, and expected behavior.</step>
      <step>Use the middle/editor pane to recover the exact starter code shape, file structure, component names, props, helper names, export requirements, and any visible file tabs. If multiple JSX/TSX/JS files are visible or implied, consider them together as one solution context.</step>
      <step>Check the right side of the window for debugging evidence such as red text, failing test output, assertion messages, runtime errors, console errors, warnings, stack traces, or expected-vs-actual diffs. If present, use that evidence to diagnose what is broken and correct the final solution.</step>
      <step>Return the full final code first, with no omissions. Do not return fragments, diffs, placeholders, partial patches, or instructions like "render &lt;Articles articles={articles} /&gt; here". If a parent component, child component, wrapper JSX, effect, handler, import, export, or helper is needed, include it in the final answer.</step>
      <step>Assume the candidate wants a copy-pasteable final submission that fully replaces the starter solution. Preserve visible required names and signatures from the editor pane.</step>
      <step>If the task is React-based, output the complete working JSX/TSX/JavaScript solution including all required rendering logic, state management, event handlers, derived values, conditionals, list rendering, and minimal necessary styling hooks.</step>
      <step>If the solution depends on multiple files, output each file completely and label them clearly by filename or role. Do not collapse a multi-file solution into one incomplete snippet.</step>
      <step>Account for HackerRank test timing: many tests inspect the DOM immediately after render and do not wait for useEffect. Prefer deriving the initial rendered output synchronously from props/data during render or state initialization when possible, instead of relying on useEffect for first-paint content.</step>
      <step>When child components are needed, define them fully. When container wiring is needed, include it fully. Never omit the top-level return tree.</step>
      <step>After the code, include a short verification section listing edge cases checked, accessibility considerations, and any assumptions made only if the screenshot is ambiguous.</step>
      <step>Explicitly state Time and Space Complexity where applicable.</step>
      <step>Prioritize completeness and correctness over brevity.</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-frontend-v4": `<poml version="3.0">
  <role>Expert real-time interview copilot for frontend coding interviews</role>
  <task>
    Analyze this HackerRank-style frontend interview layout and return a submission-ready final answer.
    <steps>
      <step>Use the left pane as the source of truth for the problem statement, examples, constraints, expected behavior, and likely test intent.</step>
      <step>Use the editor area as the source of truth for implementation details. Inspect all visible editor tabs or files, not just the focused tab. Recover the exact starter code shape, file structure, file names, component names, props, helper names, imports, exports, and required signatures.</step>
      <step>If multiple code tabs are visible, first build a mental file manifest: identify each visible file or tab, determine entry points and child components, track import and export relationships, and preserve visible module boundaries unless the environment clearly requires combining files.</step>
      <step>Check the right side of the window for debugging evidence such as red text, failing test output, assertion messages, runtime errors, console errors, warnings, stack traces, or expected-vs-actual diffs. If present, use that evidence to diagnose what is broken and correct the final solution.</step>
      <step>Return the full final code first, with no omissions. Do not return fragments, diffs, placeholders, pseudo-code, or instructions like "render &lt;Articles articles={articles} /&gt; here". If a parent component, child component, wrapper JSX, effect, handler, import, export, helper, or style hook is needed, include it in the final answer.</step>
      <step>If the solution spans multiple files, output each required file as a separate labeled code block using visible filenames when available, for example: "// File: src/App.js". If only one file truly needs to change, return only that file.</step>
      <step>Assume the candidate wants a copy-pasteable final submission that fully replaces the starter solution. Preserve visible required names and signatures from the editor panes.</step>
      <step>If the task is React-based, output the complete working JSX, TSX, or JavaScript solution including all required rendering logic, state management, event handlers, derived values, conditionals, list rendering, and minimal necessary styling hooks.</step>
      <step>Account for HackerRank test timing: many tests inspect the DOM immediately after render and do not wait for useEffect. Prefer deriving the initial rendered output synchronously from props or data during render or state initialization when possible, instead of relying on useEffect for first-paint content.</step>
      <step>When child components are needed, define them fully. When container wiring is needed, include it fully. Never omit the top-level return tree. Never assume a child component is already correct if the screenshot shows it is hardcoded, incomplete, or test-sensitive.</step>
      <step>If some tabs are not visible but the screenshot clearly implies additional files exist, infer the minimal missing code required to make the shown files work, but do not invent unnecessary abstractions.</step>
      <step>Preserve test-sensitive details exactly when visible, including data-testid attributes, component names, export style, function signatures, and DOM structure when tests are likely querying specific positions or repeated elements.</step>
      <step>After the code, include a short verification section listing which files were updated, edge cases checked, accessibility considerations, and assumptions made only if the screenshot is ambiguous.</step>
      <step>Explicitly state Time and Space Complexity where applicable.</step>
      <step>Prioritize completeness and correctness over brevity.</step>
    </steps>
  </task>
</poml>`,
  "systems-and-algorithms": `<poml version="3.0">
  <role>Expert Systems Architect & Algorithms Engineer</role>
  <task>
    Analyze the systems design or algorithmic problem presented. Provide a comprehensive architectural and algorithmic solution that includes clear diagrams and structured decision-making.
    <steps>
      <step>Do not mention ChatGPT, OpenAI, or AI model internals unless the user explicitly asks about them. If the topic is collaborative editing, interpret "OT engine" as "Operational Transformation engine".</step>
      <step>State the core problem, functional requirements, and non-functional requirements (e.g., scale, latency, consistency).</step>
      <step>Outline the proposed high-level architecture. Draw and showcase architectural decisions using clear Mermaid.js diagrams (e.g., flowchart, sequence diagram, or system architecture diagram) to visualize the flow and components. Mermaid must use simple ASCII node IDs and simple bracket labels, avoiding parentheses, quotes, HTML, markdown, emoji, and special characters inside labels. YOU MUST wrap Mermaid code in a fenced markdown code block with the language tag on its own line, exactly like: \`\`\`mermaid
graph TD
  A[Client] --> B[Service]
\`\`\`.</step>
      <step>Detail the core algorithmic logic and data models required for the system. Explain the trade-offs of chosen algorithms, including Time and Space Complexity.</step>
      <step>Discuss database choices, API design, caching strategies, and load balancing if applicable.</step>
      <step>Identify potential bottlenecks and single points of failure, and explain how the architecture mitigates them.</step>
    </steps>
  </task>
</poml>`,
  "debug": "Analyze the code in this screenshot and identify any existing bugs, security vulnerabilities, or performance issues. Propose a fixed version of the code with explanations."
};

const hasDarkModeFlag = process.argv.includes("--dark-mode");
const hasTwoStepFlag = process.argv.includes("--two-step");
if (hasTwoStepFlag) {
  config.setTwoStep(true);
}

let appLogFilePath = null;

function serializeForLog(value) {
  if (value === undefined) {
    return "";
  }
  try {
    return ` ${JSON.stringify(value)}`;
  } catch {
    return ` ${String(value)}`;
  }
}

function logEvent(scope, message, data) {
  const line = `[${new Date().toISOString()}] [${scope}] ${message}${serializeForLog(
    data
  )}`;
  console.log(line);
  if (appLogFilePath) {
    try {
      fs.appendFileSync(appLogFilePath, `${line}\n`);
    } catch (error) {
      console.error(`[log] Failed to write log file: ${error.message}`);
    }
  }
}

function initializeLogger() {
  try {
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    appLogFilePath = path.join(logDir, "runtime.log");
    logEvent("app", "Logger initialized", { pid: process.pid, logFile: appLogFilePath });
  } catch (error) {
    console.error(`[log] Failed to initialize logger: ${error.message}`);
  }
}

process.on("uncaughtException", (error) => {
  logEvent("process", "uncaughtException", {
    message: error?.message,
    stack: error?.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  logEvent("process", "unhandledRejection", {
    reason: reason?.message || String(reason),
    stack: reason?.stack,
  });
});

process.argv.forEach((arg) => {
  if (arg.startsWith("--model=")) {
    const model = arg.split("=")[1];
    config.setModel(model);
  } else if (arg.startsWith("--prompt-template=")) {
    const templateName = arg.split("=")[1];
    if (PREDEFINED_PROMPTS[templateName]) {
      config.setPrompt(PREDEFINED_PROMPTS[templateName]);
    } else {
      config.setPrompt(templateName);
    }
    
    // Automatically turn on HTML rendering for systems-and-algorithms because it uses Mermaid diagrams
    if (templateName === "systems-and-algorithms") {
      config.setRenderAssistantHtml(true);
    }
  }
});

// IPC handlers for settings
ipcMain.handle("get-settings", () => {
  return {
    openaiKey: config.getOpenAIKey(),
    prompt: config.getPrompt(),
    model: config.getModel(),
    twoStep: config.getTwoStep(),
    autoDetectInput: config.getAutoDetectInput(),
    autoDetectOutput: config.getAutoDetectOutput(),
    renderAssistantHtml: config.getRenderAssistantHtml(),
    transcriptionPauseMs: config.getTranscriptionPauseMs(),
    inputDeviceId: config.getInputDeviceId(),
    outputDeviceId: config.getOutputDeviceId(),
    azureSpeechKey: config.getAzureSpeechKey(),
    azureSpeechRegion: config.getAzureSpeechRegion(),
  };
});

// IPC handler for scrolling chat
ipcMain.handle("scroll-chat", (event, direction) => {
  if (invisibleWindow) {
    invisibleWindow.webContents.send("scroll-chat", direction);
  }
  return true;
});

ipcMain.handle("save-settings", async (event, settings) => {
  if (settings.openaiKey !== undefined) {
    config.setOpenAIKey(settings.openaiKey);
  }
  if (settings.prompt !== undefined) {
    config.setPrompt(settings.prompt);
  }
  if (settings.model !== undefined) {
    config.setModel(settings.model);
  }
  if (settings.twoStep !== undefined) {
    config.setTwoStep(settings.twoStep);
  }
  if (settings.autoDetectInput !== undefined) {
    config.setAutoDetectInput(settings.autoDetectInput);
  }
  if (settings.autoDetectOutput !== undefined) {
    config.setAutoDetectOutput(settings.autoDetectOutput);
  }
  if (settings.renderAssistantHtml !== undefined) {
    config.setRenderAssistantHtml(settings.renderAssistantHtml);
  }
  if (settings.transcriptionPauseMs !== undefined) {
    config.setTranscriptionPauseMs(settings.transcriptionPauseMs);
  }
  if (settings.inputDeviceId !== undefined) {
    config.setInputDeviceId(settings.inputDeviceId);
  }
  if (settings.outputDeviceId !== undefined) {
    config.setOutputDeviceId(settings.outputDeviceId);
  }
  if (settings.azureSpeechKey !== undefined) {
    config.setAzureSpeechKey(settings.azureSpeechKey);
  }
  if (settings.azureSpeechRegion !== undefined) {
    config.setAzureSpeechRegion(settings.azureSpeechRegion);
  }
  // Reinitialize LLM service with new API key
  await initializeLLMService();
  return true;
});

// IPC handler for settings window visibility
ipcMain.handle("show-settings", () => {
  createSettingsWindow();
});

// IPC handler for chat reset
ipcMain.handle("reset-chat", (event) => {
  if (invisibleWindow) {
    invisibleWindow.webContents.send("reset-chat");
  }
  return true;
});

// IPC handler for context menu
ipcMain.handle("build-context-menu", (event) => {
  const menu = Menu.buildFromTemplate([
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { type: "separator" },
    { role: "selectAll" },
  ]);
  return menu;
});

// IPC handlers for screenshots
ipcMain.handle("get-screenshots-directory", () => {
  const { ensureScreenshotsDirectory } = require("./screenshot");
  return ensureScreenshotsDirectory();
});

ipcMain.handle("get-recent-screenshots", () => {
  return getRecentScreenshots();
});

// IPC handlers for window controls
ipcMain.handle("minimize-window", () => {
  if (invisibleWindow) {
    logEvent("window", "minimize requested via IPC");
    invisibleWindow.minimize();
  }
});

ipcMain.handle("hide-window", () => {
  hideInvisibleWindow("ipc:hide-window");
});

ipcMain.handle("show-window", () => {
  showInvisibleWindow("ipc:show-window");
});

ipcMain.handle("debug-log", (event, payload) => {
  logEvent("renderer", payload?.message || "debug-log", payload);
  return true;
});

ipcMain.handle("get-debug-log-path", () => {
  return appLogFilePath;
});

let invisibleWindow;
let settingsWindow = null;
let tray = null;
let lastRendererCrashAt = 0;
let isRecoveringRendererWindow = false;
let isTypingSessionModeEnabled = true;
// GlobalShortcut does not expose keyup; use repeated keydown events while held
// and release when that heartbeat stops.
const HOLD_SHORTCUT_RELEASE_IDLE_MS = 800;
const recordingHoldStates = new Map();

function showInvisibleWindow(reason) {
  if (invisibleWindow) {
    logEvent("window", "showInactive requested", {
      reason,
      visibleBefore: invisibleWindow.isVisible(),
    });
    invisibleWindow.showInactive();
  }
}

function updateTypingSessionMode(enabled, reason) {
  isTypingSessionModeEnabled = Boolean(enabled);
  if (!invisibleWindow || invisibleWindow.isDestroyed()) {
    return;
  }

  try {
    invisibleWindow.setIgnoreMouseEvents(isTypingSessionModeEnabled);
    invisibleWindow.webContents.isIgnoringMouseEvents = isTypingSessionModeEnabled;

    if (typeof invisibleWindow.setFocusable === "function") {
      invisibleWindow.setFocusable(!isTypingSessionModeEnabled);
    }

    if (isTypingSessionModeEnabled) {
      invisibleWindow.blur();
    } else {
      showInvisibleWindow(reason);
      invisibleWindow.focus();
    }

    sendRendererEvent("toggle-mouse-ignore", {
      enabled: isTypingSessionModeEnabled,
      reason,
    });
    logEvent("window", "Typing session mode updated", {
      enabled: isTypingSessionModeEnabled,
      reason,
    });
  } catch (error) {
    logEvent("window", "Typing session mode update failed", {
      enabled: isTypingSessionModeEnabled,
      reason,
      message: error?.message,
    });
  }
}

function toggleTypingSessionMode(reason) {
  updateTypingSessionMode(!isTypingSessionModeEnabled, reason);
}

function hideInvisibleWindow(reason) {
  if (invisibleWindow) {
    logEvent("window", "hide requested", {
      reason,
      visibleBefore: invisibleWindow.isVisible(),
    });
    invisibleWindow.hide();
  }
}

function recreateInvisibleWindow(reason) {
  const now = Date.now();
  if (now - lastRendererCrashAt < 1000) {
    logEvent("window", "Skip recreate due to crash loop guard", { reason });
    return;
  }
  lastRendererCrashAt = now;

  const previousWindow = invisibleWindow;
  const shouldShow = previousWindow?.isVisible?.() ?? true;
  logEvent("window", "Recreating invisible window", { reason, shouldShow });
  isRecoveringRendererWindow = true;

  try {
    createInvisibleWindow();
    if (shouldShow) {
      showInvisibleWindow(`recover:${reason}`);
    }
  } finally {
    try {
      if (
        previousWindow &&
        !previousWindow.isDestroyed() &&
        previousWindow !== invisibleWindow
      ) {
        previousWindow.destroy();
      }
    } catch (error) {
      logEvent("window", "Error while destroying crashed window", {
        message: error?.message,
      });
    } finally {
      setTimeout(() => {
        isRecoveringRendererWindow = false;
      }, 500);
    }
  }
}

function sendRendererEvent(channel, payload) {
  if (!invisibleWindow || invisibleWindow.isDestroyed()) {
    return;
  }
  invisibleWindow.webContents.send(channel, payload);
}

function dispatchRecordingToggle(channel, reason) {
  if (!invisibleWindow || invisibleWindow.isDestroyed()) {
    return;
  }
  if (!invisibleWindow.isVisible()) {
    showInvisibleWindow(reason);
  }
  sendRendererEvent(channel);
  setTimeout(() => {
    if (invisibleWindow && !invisibleWindow.isDestroyed() && !invisibleWindow.isVisible()) {
      showInvisibleWindow(`${reason}-auto-recover`);
    }
  }, 300);
}

function dispatchRecordingHold(phase, token, targets, reason) {
  if (!invisibleWindow || invisibleWindow.isDestroyed()) {
    return;
  }
  if (!invisibleWindow.isVisible()) {
    showInvisibleWindow(`${reason}:${phase}`);
  }
  sendRendererEvent(`recording-hold-${phase}`, {
    token,
    targets,
    reason,
    timestamp: Date.now(),
  });
}

function releaseRecordingHold(token, reason) {
  const state = recordingHoldStates.get(token);
  if (!state || !state.active) {
    return;
  }
  state.active = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  logEvent("recording", "Hold shortcut stop", {
    token,
    targets: state.targets,
    reason,
  });
  dispatchRecordingHold("stop", token, state.targets, reason);
}

function armHoldReleaseTimer(token) {
  const state = recordingHoldStates.get(token);
  if (!state) {
    return;
  }
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = setTimeout(() => {
    const latestState = recordingHoldStates.get(token);
    if (!latestState || !latestState.active) {
      return;
    }
    const idleMs = Date.now() - latestState.lastSeenAt;
    if (idleMs >= HOLD_SHORTCUT_RELEASE_IDLE_MS) {
      releaseRecordingHold(token, "idle-timeout");
      return;
    }
    armHoldReleaseTimer(token);
  }, HOLD_SHORTCUT_RELEASE_IDLE_MS);
}

function registerRecordingHoldShortcut({
  name,
  token,
  targets,
  primary,
  fallback,
}) {
  const triggerHold = () => {
    const state = recordingHoldStates.get(token);
    if (!state) {
      return;
    }
    state.lastSeenAt = Date.now();
    if (!state.active) {
      state.active = true;
      logEvent("recording", "Hold shortcut start", {
        name,
        token,
        targets,
      });
      dispatchRecordingHold("start", token, targets, `shortcut:${token}`);
    }
    armHoldReleaseTimer(token);
  };

  recordingHoldStates.set(token, {
    name,
    token,
    targets,
    active: false,
    lastSeenAt: 0,
    timer: null,
  });

  const primaryRegistered = globalShortcut.register(primary, triggerHold);
  if (primaryRegistered) {
    return;
  }
  if (!fallback) {
    console.warn(`[shortcuts] Could not register hold shortcut ${primary}.`);
    return;
  }
  console.warn(
    `[shortcuts] Could not register ${primary}. Trying fallback ${fallback}.`
  );
  const fallbackRegistered = globalShortcut.register(fallback, triggerHold);
  if (!fallbackRegistered) {
    console.warn(
      `[shortcuts] Could not register fallback ${fallback}. ${name} hold shortcut is unavailable.`
    );
  } else {
    console.log(`[shortcuts] Registered hold shortcut: ${fallback}`);
  }
}

function releaseAllRecordingHolds(reason) {
  for (const token of recordingHoldStates.keys()) {
    releaseRecordingHold(token, reason);
  }
}

function configureDisplayMediaCapture() {
  try {
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
          });
          const selectedSource = sources[0];
          if (!selectedSource) {
            logEvent("recording", "No display media source available");
            callback({ video: null, audio: null });
            return;
          }

          const response = { video: selectedSource };
          if (process.platform === "win32") {
            response.audio = "loopback";
          }

          callback(response);
          logEvent("recording", "Display media source selected", {
            sourceId: selectedSource.id,
            sourceName: selectedSource.name,
            audio: response.audio || "none",
          });
        } catch (error) {
          logEvent("recording", "Display media selection failed", {
            message: error?.message,
            stack: error?.stack,
          });
          callback({ video: null, audio: null });
        }
      },
      {
        useSystemPicker: false,
      }
    );

    logEvent("recording", "Display media request handler configured", {
      platform: process.platform,
      useSystemPicker: false,
    });
  } catch (error) {
    logEvent("recording", "Failed to configure display media handler", {
      message: error?.message,
      stack: error?.stack,
    });
  }
}

// Create shared menu template
function createMenuTemplate() {
  return [
    {
      label: process.platform === "darwin" ? app.name : "File",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: process.platform === "darwin" ? "Preferences..." : "Settings...",
          accelerator: "CommandOrControl+,",
          click: () => createSettingsWindow(),
        },
        {
          label: "Open Runtime Log",
          click: () => {
            if (appLogFilePath) {
              logEvent("app", "Opening runtime log", { path: appLogFilePath });
              shell.openPath(appLogFilePath);
            }
          },
        },
        { type: "separator" },
        ...(process.platform === "darwin"
          ? [
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
            ]
          : []),
        { role: "quit" },
      ],
    },

    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Developer Tools",
          accelerator:
            process.platform === "darwin" ? "Alt+Command+J" : "F12",
          click: (_, window) => {
            if (window) {
              window.webContents.toggleDevTools();
            }
          },
        },
        {
          label: "Toggle Typing Session Mode",
          accelerator: "CommandOrControl+Alt+Shift+T",
          click: () => {
            toggleTypingSessionMode("menu:typing-session-mode");
          },
        },
      ],
    },
    {
      label: "Recording",
      submenu: [
        {
          label: "Test Start/Stop Recording Input",
          accelerator: "CmdOrCtrl+Alt+Shift+I",
          click: () => {
            logEvent("recording", "Menu toggle input requested");
            dispatchRecordingToggle("test-recording-input", "menu:recording-input");
          },
        },
        {
          label: "Test Start/Stop Recording Output",
          accelerator: "CmdOrCtrl+Alt+Shift+O",
          click: () => {
            logEvent("recording", "Menu toggle output requested");
            dispatchRecordingToggle("test-recording-output", "menu:recording-output");
          },
        },
        {
          label: "Test Start/Stop Recording Both",
          accelerator: "CmdOrCtrl+Alt+Shift+B",
          click: () => {
            logEvent("recording", "Menu toggle both requested");
            dispatchRecordingToggle("test-recording-both", "menu:recording-both");
          },
        },
      ],
    },
  ];
}

function createInvisibleWindow() {
  invisibleWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Set window type to utility on macOS
  if (process.platform === "darwin") {
    invisibleWindow.setAlwaysOnTop(true, "utility", 1);
    // Hide window buttons but keep functionality
    invisibleWindow.setWindowButtonVisibility(false);
  }

  // Set content protection to prevent screen capture
  invisibleWindow.setContentProtection(true);

  invisibleWindow.loadFile("index.html");

  invisibleWindow.webContents.on('did-finish-load', () => {
    logEvent("window", "did-finish-load", {
      url: invisibleWindow.webContents.getURL(),
    });
  });

  invisibleWindow.webContents.on("did-fail-load", (_, errorCode, errorDescription) => {
    logEvent("window", "did-fail-load", { errorCode, errorDescription });
  });

  invisibleWindow.webContents.on("render-process-gone", (_, details) => {
    logEvent("window", "render-process-gone", details);
    if (!app.isQuitting) {
      setTimeout(() => recreateInvisibleWindow("render-process-gone"), 150);
    }
  });

  invisibleWindow.webContents.on(
    "console-message",
    (_, level, message, line, sourceId) => {
      const important =
        level <= 2 ||
        /error|transcription|recording|hide|show|exception/i.test(message);
      if (important) {
        logEvent("renderer-console", message, { level, line, sourceId });
      }
    }
  );

  // DevTools can be toggled manually with shortcuts defined in createMenuTemplate




  // Prevent the window from being closed with mouse
  invisibleWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      hideInvisibleWindow("window:close-intercept");
    }
    return false;
  });

  invisibleWindow.on("show", () => {
    logEvent("window", "show event");
  });

  invisibleWindow.on("hide", () => {
    logEvent("window", "hide event");
  });

  invisibleWindow.on("focus", () => {
    logEvent("window", "focus event");
  });

  invisibleWindow.on("blur", () => {
    logEvent("window", "blur event");
  });

  // Set the menu for the invisible window
  const menu = Menu.buildFromTemplate(createMenuTemplate());
  Menu.setApplicationMenu(menu);
  updateTypingSessionMode(isTypingSessionModeEnabled, "window:init");

  // Show window initially
  showInvisibleWindow("startup");
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    return;
  }

  settingsWindow = new BrowserWindow({
    resizable: true,
    minimizable: true,
    maximizable: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  settingsWindow.loadFile("settings.html");

  // DevTools can be toggled manually


  settingsWindow.once("ready-to-show", () => {
    settingsWindow.show();
  });

  // Handle window close
  settingsWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      settingsWindow.hide();
    }
    return false;
  });
}

// Register global shortcuts
function registerShortcuts() {
  // Screenshot shortcut (Command/Ctrl + Shift + S)
  globalShortcut.register("CommandOrControl+Shift+S", async () => {
    logEvent("shortcut", "Screenshot shortcut triggered");
    try {
      // Hide window before taking screenshot
      if (invisibleWindow && invisibleWindow.isVisible()) {
        hideInvisibleWindow("shortcut:screenshot");
      }

      // Wait for window to hide
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check permission and take screenshot
      const hasPermission = await ensureScreenRecordingPermission();
      if (!hasPermission) {
        console.log("Permission not granted. Skipping screenshot.");
        return;
      }

      const screenshotPath = await captureFullScreen(desktopCapturer, screen);
      if (screenshotPath) {
        console.log("Screenshot saved:", screenshotPath);
        // Notify renderer about successful capture
        if (invisibleWindow) {
          invisibleWindow.webContents.send("screenshot-captured", {
            filePath: screenshotPath,
            timestamp: Date.now(),
          });
        }
      }

      // Show window again after a brief delay
      setTimeout(() => {
        showInvisibleWindow("shortcut:screenshot-post-capture");
      }, 200);
    } catch (error) {
      console.error("Screenshot failed:", error);
      logEvent("shortcut", "Screenshot shortcut failed", {
        message: error?.message,
        stack: error?.stack,
      });
      showInvisibleWindow("shortcut:screenshot-error");
    }
  });

  // Toggle visibility shortcut (Command/Ctrl + Shift + H)
  const toggleVisibility = () => {
    logEvent("shortcut", "Visibility shortcut triggered", {
      currentlyVisible: invisibleWindow?.isVisible?.(),
    });
    if (invisibleWindow.isVisible()) {
      hideInvisibleWindow("shortcut:visibility-toggle");
    } else {
      showInvisibleWindow("shortcut:visibility-toggle");
    }
  };

  const visibilityPrimary = "CommandOrControl+Shift+H";
  const visibilityFallback = "CommandOrControl+Alt+Shift+H";
  const visibilityRegistered = globalShortcut.register(
    visibilityPrimary,
    toggleVisibility
  );
  if (!visibilityRegistered) {
    console.warn(
      `[shortcuts] Could not register ${visibilityPrimary}. Trying fallback ${visibilityFallback}.`
    );
    const visibilityFallbackRegistered = globalShortcut.register(
      visibilityFallback,
      toggleVisibility
    );
    if (!visibilityFallbackRegistered) {
      console.warn(
        `[shortcuts] Could not register fallback ${visibilityFallback}. Visibility shortcut is unavailable.`
      );
    } else {
      console.log(
        `[shortcuts] Registered visibility shortcut: ${visibilityFallback}`
      );
    }
  }

  // Test response shortcut (Command/Ctrl + Shift + T)
  globalShortcut.register("CommandOrControl+Shift+T", async () => {
    if (invisibleWindow) {
      try {
        await invisibleWindow.webContents.executeJavaScript(`
          window.electronAPI.testResponse("write python code to print 'Hello, world!'");
        `);
      } catch (error) {
        console.error("Failed to test response:", error);
      }
    }
  });

  globalShortcut.register("CommandOrControl+Alt+Shift+T", () => {
    logEvent("shortcut", "Typing session mode toggle requested", {
      enabledBefore: isTypingSessionModeEnabled,
    });
    toggleTypingSessionMode("shortcut:typing-session-mode");
  });

  // Recording shortcuts
  globalShortcut.register("CommandOrControl+Alt+Shift+I", () => {
    logEvent("recording", "Shortcut toggle input requested");
    dispatchRecordingToggle("test-recording-input", "shortcut:recording-input");
  });

  globalShortcut.register("CommandOrControl+Alt+Shift+O", () => {
    logEvent("recording", "Shortcut toggle output requested");
    dispatchRecordingToggle("test-recording-output", "shortcut:recording-output");
  });

  globalShortcut.register("CommandOrControl+Alt+Shift+B", () => {
    logEvent("recording", "Shortcut toggle both requested");
    dispatchRecordingToggle("test-recording-both", "shortcut:recording-both");
  });

  registerRecordingHoldShortcut({
    name: "Input",
    token: "shortcut-hold-input",
    targets: ["input"],
    primary: "CommandOrControl+Alt+I",
  });
  registerRecordingHoldShortcut({
    name: "Output",
    token: "shortcut-hold-output",
    targets: ["output"],
    primary: "CommandOrControl+Alt+O",
  });
  registerRecordingHoldShortcut({
    name: "Both",
    token: "shortcut-hold-both",
    targets: ["input", "output"],
    primary: "CommandOrControl+Alt+B",
  });

  // Window movement shortcuts
  const NUDGE_AMOUNT = 50;
  const screenBounds = screen.getPrimaryDisplay().workAreaSize;

  // Nudge window with arrow keys
  globalShortcut.register("CommandOrControl+Left", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x - NUDGE_AMOUNT, y);
    }
  });

  globalShortcut.register("CommandOrControl+Right", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x + NUDGE_AMOUNT, y);
    }
  });

  globalShortcut.register("CommandOrControl+Up", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x, y - NUDGE_AMOUNT);
    }
  });

  globalShortcut.register("CommandOrControl+Down", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x, y + NUDGE_AMOUNT);
    }
  });

  // Snap window to screen edges
  globalShortcut.register("CommandOrControl+Shift+Left", () => {
    if (invisibleWindow) {
      invisibleWindow.setPosition(0, 0);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Right", () => {
    if (invisibleWindow) {
      const windowBounds = invisibleWindow.getBounds();
      invisibleWindow.setPosition(screenBounds.width - windowBounds.width, 0);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Up", () => {
    if (invisibleWindow) {
      invisibleWindow.setPosition(0, 0);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Down", () => {
    if (invisibleWindow) {
      const windowBounds = invisibleWindow.getBounds();
      invisibleWindow.setPosition(0, screenBounds.height - windowBounds.height);
    }
  });

  // Reset chat shortcut (Command/Ctrl + Shift + R)
  globalShortcut.register("CommandOrControl+Shift+R", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("reset-chat");
    }
  });

  // Dark mode shortcut. Ctrl/Cmd + Shift + D may be taken by other apps,
  // so we register a fallback combination if the primary accelerator is unavailable.
  const toggleDarkMode = () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("toggle-dark-mode");
    }
  };

  const darkModePrimary = "CommandOrControl+Shift+D";
  const darkModeFallback = "CommandOrControl+Alt+Shift+D";
  const darkModeRegistered = globalShortcut.register(darkModePrimary, toggleDarkMode);
  if (!darkModeRegistered) {
    console.warn(
      `[shortcuts] Could not register ${darkModePrimary}. Trying fallback ${darkModeFallback}.`
    );
    const darkModeFallbackRegistered = globalShortcut.register(
      darkModeFallback,
      toggleDarkMode
    );
    if (!darkModeFallbackRegistered) {
      console.warn(
        `[shortcuts] Could not register fallback ${darkModeFallback}. Dark mode shortcut is unavailable.`
      );
    } else {
      console.log(`[shortcuts] Registered dark mode shortcut: ${darkModeFallback}`);
    }
  }

  const toggleHelp = () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("toggle-help");
      showInvisibleWindow("shortcut:help-toggle");
    }
  };

  const helpPrimary = "CommandOrControl+Shift+/";
  const helpFallback = "CommandOrControl+Alt+Shift+/";
  const helpRegistered = globalShortcut.register(helpPrimary, toggleHelp);
  if (!helpRegistered) {
    console.warn(
      `[shortcuts] Could not register ${helpPrimary}. Trying fallback ${helpFallback}.`
    );
    const helpFallbackRegistered = globalShortcut.register(helpFallback, toggleHelp);
    if (!helpFallbackRegistered) {
      console.warn(
        `[shortcuts] Could not register fallback ${helpFallback}. Help shortcut is unavailable.`
      );
    } else {
      console.log(`[shortcuts] Registered help shortcut: ${helpFallback}`);
    }
  }

  // Settings shortcut (Command/Ctrl + ,)
  globalShortcut.register("CommandOrControl+,", () => {
    createSettingsWindow();
  });


  // Chat scrolling shortcuts
  globalShortcut.register("Alt+Up", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("scroll-chat", "up");
    }
  });

  globalShortcut.register("Alt+Down", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("scroll-chat", "down");
    }
  });

  // For macOS, also register Option key combinations
  if (process.platform === "darwin") {
    globalShortcut.register("Option+Up", () => {
      if (invisibleWindow) {
        invisibleWindow.webContents.send("scroll-chat", "up");
      }
    });

    globalShortcut.register("Option+Down", () => {
      if (invisibleWindow) {
        invisibleWindow.webContents.send("scroll-chat", "down");
      }
    });
  }
}

// When app is ready
app.whenReady().then(async () => {
  initializeLogger();
  logEvent("app", "App ready", { argv: process.argv });

  // Load API key from config before initializing services
  const apiKey = config.getOpenAIKey();
  if (apiKey) {
    process.env.OPENAI_API_KEY = apiKey;
  }

  configureDisplayMediaCapture();
  createInvisibleWindow();
  registerShortcuts();
  await initializeLLMService();

  // Create tray icon for Windows
  if (process.platform === "win32") {
    tray = new Tray(path.join(__dirname, "../assets/OCTO.png"));
    const contextMenu = Menu.buildFromTemplate([
      { label: "Show", click: () => showInvisibleWindow("tray:show") },
      { label: "Hide", click: () => hideInvisibleWindow("tray:hide") },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]);
    tray.setToolTip("Open Interview Coder");
    tray.setContextMenu(contextMenu);
  }

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      logEvent("app", "activate with no windows; recreating invisible window");
      createInvisibleWindow();
    } else {
      showInvisibleWindow("app:activate");
    }
  });
});

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  if (isRecoveringRendererWindow) {
    logEvent("app", "window-all-closed ignored during renderer recovery");
    return;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Clean up on app quit
app.on("before-quit", () => {
  logEvent("app", "before-quit");
  app.isQuitting = true;
  releaseAllRecordingHolds("before-quit");
  globalShortcut.unregisterAll();
});
