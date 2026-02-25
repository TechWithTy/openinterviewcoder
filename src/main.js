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

  // Always ignore mouse events to prevent interaction with screen sharing
  invisibleWindow.setIgnoreMouseEvents(true);
  invisibleWindow.webContents.isIgnoringMouseEvents = true;

  invisibleWindow.loadFile("index.html");

  invisibleWindow.webContents.on('did-finish-load', () => {
    logEvent("window", "did-finish-load", {
      url: invisibleWindow.webContents.getURL(),
    });
    if (hasDarkModeFlag) {
      invisibleWindow.webContents.send("toggle-dark-mode");
    }
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
