// DOM Elements
const chatHistory = document.getElementById("chat-history");
const typingIndicator = document.getElementById("typing-indicator");

// Chat state
let messages = [];
let isHelpOverlayOpen = false;
let transcriptionPauseMs = 2500;
const transcriptionProcessing = {
  Input: {
    buffer: "",
    timer: null,
    inFlight: false,
  },
  Output: {
    buffer: "",
    timer: null,
    inFlight: false,
  },
};
const liveTranscription = {
  Input: {
    messageEl: null,
    transcriptSpan: null,
    cursorSpan: null,
    text: "",
    lastChunk: "",
  },
  Output: {
    messageEl: null,
    transcriptSpan: null,
    cursorSpan: null,
    text: "",
    lastChunk: "",
  },
};

function getElectronAPI() {
  return window.__TEST_ELECTRON_API__ || window.electronAPI;
}

function debugLog(message, data = {}) {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.debugLog) {
    return;
  }
  electronAPI
    .debugLog({
      message,
      data,
      timestamp: Date.now(),
      url: window.location.href,
      visibilityState: document.visibilityState,
    })
    .catch(() => {});
}

function getErrorDetails(error) {
  const fallback =
    typeof error === "string"
      ? error
      : error?.toString?.() || "Unknown error";
  const message = error?.message || fallback;
  return {
    message,
    name: error?.name,
    stack: error?.stack,
    fallback,
  };
}

function normalizeTranscriptionPauseMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 2500;
  }
  return Math.min(60000, Math.max(1000, Math.round(parsed)));
}

function getTranscriptionBucket(source) {
  return transcriptionProcessing[source] || transcriptionProcessing.Output;
}

function scheduleTranscriptionFlush(source) {
  const bucket = getTranscriptionBucket(source);
  if (bucket.timer) {
    clearTimeout(bucket.timer);
  }
  bucket.timer = setTimeout(() => {
    flushTranscriptionBuffer(source);
  }, transcriptionPauseMs);
}

async function flushTranscriptionBuffer(source) {
  const bucket = getTranscriptionBucket(source);
  if (bucket.timer) {
    clearTimeout(bucket.timer);
    bucket.timer = null;
  }
  if (bucket.inFlight) {
    return;
  }

  const payload = bucket.buffer.trim();
  if (!payload) {
    return;
  }

  bucket.buffer = "";
  bucket.inFlight = true;
  try {
    debugLog("Processing buffered transcription", {
      source,
      pauseMs: transcriptionPauseMs,
      length: payload.length,
    });
    await getElectronAPI().processTranscription(
      `Source: ${source}, Text: ${payload}`
    );
  } catch (err) {
    console.error("Failed to process transcription with AI:", err);
    debugLog("Buffered transcription processing failed", {
      source,
      message: err?.message,
    });
  } finally {
    bucket.inFlight = false;
    if (bucket.buffer.trim()) {
      scheduleTranscriptionFlush(source);
    }
  }
}

function getLiveTranscriptionState(source) {
  return liveTranscription[source] || liveTranscription.Output;
}

function ensureLiveTranscriptionMessage(source) {
  const state = getLiveTranscriptionState(source);
  if (state.messageEl && state.messageEl.isConnected) {
    return state;
  }

  const messageEl = document.createElement("div");
  messageEl.className = "message assistant transcription live";

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "message-content markdown-body";

  const paragraph = document.createElement("p");
  const label = document.createElement("strong");
  label.textContent = `[${source}]`;
  paragraph.appendChild(label);
  paragraph.appendChild(document.createTextNode(": "));

  const transcriptSpan = document.createElement("span");
  transcriptSpan.className = "transcription-live-text";
  paragraph.appendChild(transcriptSpan);

  const cursorSpan = document.createElement("span");
  cursorSpan.className = "transcription-live-cursor";
  cursorSpan.textContent = " ...";
  paragraph.appendChild(cursorSpan);

  contentWrapper.appendChild(paragraph);
  messageEl.appendChild(contentWrapper);
  chatHistory.appendChild(messageEl);

  state.messageEl = messageEl;
  state.transcriptSpan = transcriptSpan;
  state.cursorSpan = cursorSpan;
  return state;
}

function appendLiveTranscription(source, text) {
  const normalized = (text || "").trim();
  if (!normalized) {
    return;
  }

  const state = ensureLiveTranscriptionMessage(source);
  if (normalized === state.lastChunk) {
    return;
  }

  state.lastChunk = normalized;
  state.text = state.text ? `${state.text} ${normalized}` : normalized;
  if (state.transcriptSpan) {
    state.transcriptSpan.textContent = state.text;
  }
  if (state.cursorSpan) {
    state.cursorSpan.style.display = "inline";
  }
  scrollToBottom();
}

function finalizeLiveTranscription(source) {
  const state = getLiveTranscriptionState(source);
  if (state.cursorSpan) {
    state.cursorSpan.style.display = "none";
  }
  if (state.messageEl) {
    state.messageEl.classList.remove("live");
  }
  state.messageEl = null;
  state.transcriptSpan = null;
  state.cursorSpan = null;
  state.text = "";
  state.lastChunk = "";
}

// Initialize marked with options
if (typeof marked === "undefined") {
  console.error("marked library not loaded");
} else {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
}

// Initialize the UI
document.addEventListener("DOMContentLoaded", async () => {
  debugLog("Renderer DOMContentLoaded");
  try {
    const settings = await getElectronAPI().getSettings();
    transcriptionPauseMs = normalizeTranscriptionPauseMs(settings?.transcriptionPauseMs);
  } catch {
    transcriptionPauseMs = 2500;
  }
  setupEventListeners();
});

// Set up event listeners
function setupEventListeners() {
  debugLog("Setting up renderer event listeners");
  const electronAPI = getElectronAPI();

  window.addEventListener("error", (event) => {
    debugLog("Renderer window.error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    debugLog("Renderer unhandledrejection", {
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
    });
  });

  document.addEventListener("visibilitychange", () => {
    debugLog("Renderer visibilitychange", {
      visibilityState: document.visibilityState,
    });
    if (document.visibilityState === "visible") {
      resetHomePanelScroll({ forceChatTop: false });
    }
  });

  window.addEventListener("focus", () => {
    resetHomePanelScroll({ forceChatTop: false });
  });

  // Window position update
  electronAPI.onWindowPositionChanged((position) => {
    debugLog("Window position changed", { position });
    document.body.setAttribute("data-position", position);
  });

  // Handle keyboard shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);

  // Handle new screenshots
  electronAPI.onScreenshotCaptured(addScreenshotToChat);

  // Handle chat reset
  electronAPI.onResetChat(resetChat);

  // Handle dark mode toggle
  electronAPI.onToggleDarkMode(() => {
    document.body.classList.toggle("dark-mode");
  });
  electronAPI.onToggleHelp?.(() => {
    toggleHelpOverlay();
  });

  // Handle response updates
  electronAPI.onStreamUpdate(updateMessage);

  // Handle chat scrolling from shortcuts
  electronAPI.onScrollChat((direction) => {
    scrollActiveContainer(direction);
  });

  window.addEventListener('wheel', (event) => {
    if (event.altKey) {
      // Prevent default to prevent double scrolling side-effects
      event.preventDefault();
      scrollByDelta(event.deltaY * 5); // Scroll faster
    }
  }, { passive: false });

  // Handle recording tests
  electronAPI.onTestRecordingInput(toggleInputRecording);
  electronAPI.onTestRecordingOutput(toggleOutputRecording);
  electronAPI.onTestRecordingBoth?.(toggleBothRecordings);
  electronAPI.onRecordingHoldStart?.(handleRecordingHoldStart);
  electronAPI.onRecordingHoldStop?.(handleRecordingHoldStop);
}

// Recording states
let inputRecorder = null;
let outputRecorder = null;
const recordingControl = {
  input: {
    manualEnabled: false,
    holdTokens: new Set(),
    opQueue: Promise.resolve(),
  },
  output: {
    manualEnabled: false,
    holdTokens: new Set(),
    opQueue: Promise.resolve(),
  },
};

function getSourceLabel(type) {
  return type === "input" ? "Input" : "Output";
}

function isRecorderActive(type) {
  return type === "input" ? Boolean(inputRecorder) : Boolean(outputRecorder);
}

function setRecorderActive(type, active) {
  if (type === "input") {
    inputRecorder = active ? true : null;
    return;
  }
  outputRecorder = active ? true : null;
}

function isRecordingDesired(type) {
  const control = recordingControl[type];
  return Boolean(control.manualEnabled || control.holdTokens.size > 0);
}

function queueRecordingOperation(type, operation) {
  const control = recordingControl[type];
  control.opQueue = control.opQueue.then(operation, operation);
  return control.opQueue;
}

async function startRecording(type, reason) {
  const electronAPI = getElectronAPI();
  const sourceLabel = getSourceLabel(type);
  try {
    await electronAPI.showWindow();
    const settings = await electronAPI.getSettings();
    transcriptionPauseMs = normalizeTranscriptionPauseMs(settings?.transcriptionPauseMs);
    let constraints = { audio: true };

    if (
      type === "input" &&
      !settings.autoDetectInput &&
      settings.inputDeviceId &&
      settings.inputDeviceId !== "default"
    ) {
      constraints.audio = { deviceId: { exact: settings.inputDeviceId } };
    }

    if (
      type === "output" &&
      !settings.autoDetectOutput &&
      settings.outputDeviceId &&
      settings.outputDeviceId !== "default"
    ) {
      constraints.audio = { deviceId: { exact: settings.outputDeviceId } };
    }

    debugLog(`Starting ${type} transcription`, { constraints, reason });
    const startConfig =
      type === "output"
        ? { pauseMs: transcriptionPauseMs, outputCaptureMode: "system" }
        : { pauseMs: transcriptionPauseMs };
    await electronAPI.startTranscription(
      constraints,
      startConfig,
      type,
      (text, isFinal) => {
        if (isFinal) {
          debugLog(`${sourceLabel} transcript received`, { length: text?.length || 0 });
          addTranscriptionToChat(sourceLabel, text);
        }
      }
    );
    await electronAPI.showWindow();
    setRecorderActive(type, true);
    debugLog(`${type} transcription started`, { reason });
    addAssistantInfoMessage(`Started transcription for ${type}. Use menu again to stop.`);
  } catch (err) {
    const errorDetails = getErrorDetails(err);
    debugLog(`${sourceLabel} transcription failed`, {
      reason,
      ...errorDetails,
    });
    addErrorMessage(`Failed to start ${type} transcription: ${errorDetails.message}`);
    recordingControl[type].manualEnabled = false;
    recordingControl[type].holdTokens.clear();
    setRecorderActive(type, false);
  }
}

async function stopRecording(type, reason) {
  if (!isRecorderActive(type)) {
    return;
  }
  const electronAPI = getElectronAPI();
  const sourceLabel = getSourceLabel(type);
  electronAPI.stopTranscription(type);
  setRecorderActive(type, false);
  debugLog(`${type} transcription stop requested`, { reason });
  await flushTranscriptionBuffer(sourceLabel);
  finalizeLiveTranscription(sourceLabel);
  addAssistantInfoMessage(`Stopped transcription for ${type}.`);
}

async function reconcileRecordingState(type, reason) {
  await queueRecordingOperation(type, async () => {
    while (true) {
      const desired = isRecordingDesired(type);
      const active = isRecorderActive(type);
      if (desired === active) {
        return;
      }
      if (desired) {
        await startRecording(type, reason);
      } else {
        await stopRecording(type, reason);
      }
    }
  });
}

async function toggleManualRecording(type) {
  recordingControl[type].manualEnabled = !recordingControl[type].manualEnabled;
  debugLog(`${type} recording toggle requested`, {
    manualEnabled: recordingControl[type].manualEnabled,
    holdTokens: [...recordingControl[type].holdTokens],
  });
  await reconcileRecordingState(type, "manual-toggle");
}

async function toggleInputRecording() {
  await toggleManualRecording("input");
}

async function toggleOutputRecording() {
  await toggleManualRecording("output");
}

async function toggleBothRecordings() {
  const nextValue = !(
    recordingControl.input.manualEnabled && recordingControl.output.manualEnabled
  );
  recordingControl.input.manualEnabled = nextValue;
  recordingControl.output.manualEnabled = nextValue;
  debugLog("Both recording toggle requested", { manualEnabled: nextValue });
  await Promise.all([
    reconcileRecordingState("input", "manual-toggle-both"),
    reconcileRecordingState("output", "manual-toggle-both"),
  ]);
}

function normalizeHoldTargets(targets) {
  if (!Array.isArray(targets)) {
    return ["input", "output"];
  }
  return targets.filter((target) => target === "input" || target === "output");
}

async function handleRecordingHoldStart(payload = {}) {
  const holdTargets = normalizeHoldTargets(payload.targets);
  const token = payload.token || "hold-default";
  const changed = [];
  for (const type of holdTargets) {
    const tokens = recordingControl[type].holdTokens;
    if (!tokens.has(token)) {
      tokens.add(token);
      changed.push(type);
    }
  }
  if (!changed.length) {
    return;
  }
  debugLog("Recording hold start requested", {
    token,
    targets: holdTargets,
  });
  await Promise.all(changed.map((type) => reconcileRecordingState(type, `hold-start:${token}`)));
}

async function handleRecordingHoldStop(payload = {}) {
  const holdTargets = normalizeHoldTargets(payload.targets);
  const token = payload.token || "hold-default";
  const changed = [];
  for (const type of holdTargets) {
    const tokens = recordingControl[type].holdTokens;
    if (tokens.has(token)) {
      tokens.delete(token);
      changed.push(type);
    }
  }
  if (!changed.length) {
    return;
  }
  debugLog("Recording hold stop requested", {
    token,
    targets: holdTargets,
  });
  await Promise.all(changed.map((type) => reconcileRecordingState(type, `hold-stop:${token}`)));
}

async function addTranscriptionToChat(source, text) {
  appendLiveTranscription(source, text);

  const bucket = getTranscriptionBucket(source);
  bucket.buffer = bucket.buffer ? `${bucket.buffer}\n${text}` : text;
  debugLog("Buffered transcript chunk", {
    source,
    chunkLength: text?.length || 0,
    bufferedLength: bucket.buffer.length,
    pauseMs: transcriptionPauseMs,
  });
  scheduleTranscriptionFlush(source);
}

// Handle keyboard shortcuts
function handleKeyboardShortcuts(event) {
  if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") {
    return;
  }

  if (event.key === "Escape") {
    getElectronAPI().hideWindow();
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "t") {
    event.preventDefault();
    handleTestResponse("write python code to print 'Hello, world!'");
  }

  const isQuestionMarkShortcut =
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    (event.key === "?" || (event.shiftKey && event.code === "Slash"));
  if (isQuestionMarkShortcut) {
    event.preventDefault();
    toggleHelpOverlay();
  }
}

// Scroll to bottom of chat
function scrollToBottom() {
  const chatContainer = document.querySelector(".chat-container");
  if (chatContainer) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
    // Double-check scroll after a short delay to handle dynamic content
    setTimeout(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 100);
  }
}

// Update message
function updateMessage(data) {
  const { messageId, content, isComplete } = data;
  console.log("updateMessage called:", {
    messageId,
    contentLength: content.length,
    isComplete,
  });

  // Find or create message element
  let messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageEl) {
    console.log("Creating new message element");
    messageEl = createMessageElement(messageId);
    chatHistory.appendChild(messageEl);
    // Show typing indicator for new messages
    typingIndicator.classList.add("visible");
    console.log("Typing indicator shown");
    updateNullStateVisibility();
  }

  // Update content
  const contentWrapper = messageEl.querySelector(".message-content");
  if (contentWrapper) {
    if (content && typeof content === "string") {
      contentWrapper.innerHTML = marked.parse(content);
    } else {
      contentWrapper.innerHTML = ""; // Clear content if it's null/undefined or not a string
    }
    messageEl.style.display = "block"; // Show when content is added
    scrollToBottom();
  }

  // Handle completion
  if (isComplete) {
    console.log("Message complete, hiding typing indicator");
    typingIndicator.classList.remove("visible");

    // Update the message in the messages array
    const messageIndex = messages.findIndex((m) => m.messageId === messageId);
    if (messageIndex !== -1) {
      messages[messageIndex].content = content;
      messages[messageIndex].status = "completed";
    }
  }
}

// Create message element
function createMessageElement(messageId) {
  const messageEl = document.createElement("div");
  messageEl.className = "message assistant";
  messageEl.setAttribute("data-message-id", messageId);
  messageEl.style.display = "none"; // Hide initially

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "message-content markdown-body";
  messageEl.appendChild(contentWrapper);

  return messageEl;
}

function addAssistantInfoMessage(text) {
  const messageEl = document.createElement("div");
  messageEl.className = "message assistant";
  messageEl.innerHTML = `<div class="message-content markdown-body"><p>${text}</p></div>`;
  chatHistory.appendChild(messageEl);
  scrollToBottom();
}

// Add error message
function addErrorMessage(message) {
  const errorEl = document.createElement("div");
  errorEl.className = "message error";
  errorEl.textContent = `Error: ${message}`;
  chatHistory.appendChild(errorEl);
  scrollToBottom();
}

// Add screenshot to chat
async function addScreenshotToChat(data) {
  const message = {
    type: "screenshot",
    timestamp: Date.now(),
    filePath: data.filePath,
  };

  messages.push(message);

  const messageEl = document.createElement("div");
  messageEl.className = "message user";

  const img = document.createElement("img");
  img.src = `file://${data.filePath}`;
  img.className = "screenshot-thumbnail";
  img.alt = "Screenshot";
  img.addEventListener("click", () =>
    window.electronAPI.openFile(data.filePath)
  );

  messageEl.appendChild(img);
  chatHistory.appendChild(messageEl);
  scrollToBottom();

  try {
    // Show typing indicator before analyzing screenshot
    typingIndicator.classList.add("visible");
    console.log("Showing typing indicator for screenshot analysis");

    const result = await window.electronAPI.analyzeScreenshot({
      filePath: data.filePath,
      history: messages
        .filter((m) => m.type === "assistant")
        .map((m) => ({
          role: "assistant",
          content: m.content,
        })),
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    messages.push({
      type: "assistant",
      timestamp: Date.now(),
      messageId: result.messageId,
      provider: result.provider,
      model: result.model,
      content: "",
      status: "pending",
    });
  } catch (error) {
    typingIndicator.classList.remove("visible");
    addErrorMessage(error.message);
  }
}

// Reset chat
function resetChat() {
  chatHistory.innerHTML = "";
  messages = [];
  finalizeLiveTranscription("Input");
  finalizeLiveTranscription("Output");
  for (const bucket of Object.values(transcriptionProcessing)) {
    bucket.buffer = "";
    if (bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }
  }
  updateNullStateVisibility();
}

function updateNullStateVisibility() {
  const nullState = document.getElementById("null-state");
  if (nullState) {
    const shouldShow = messages.length === 0 || isHelpOverlayOpen;
    nullState.style.display = shouldShow ? "flex" : "none";
    if (shouldShow && !isHelpOverlayOpen) {
      resetHomePanelScroll({ forceChatTop: true });
    }
  }
}

function resetHomePanelScroll(options = {}) {
  const { forceChatTop = false } = options;
  const nullState = document.getElementById("null-state");
  if (!nullState) {
    return;
  }
  const shouldResetNullState = isHelpOverlayOpen || messages.length === 0;
  if (shouldResetNullState) {
    nullState.scrollTop = 0;
    const shortcutsContainer = nullState.querySelector(".shortcuts");
    if (shortcutsContainer) {
      shortcutsContainer.scrollTop = 0;
      requestAnimationFrame(() => {
        shortcutsContainer.scrollTop = 0;
      });
    }
    requestAnimationFrame(() => {
      nullState.scrollTop = 0;
    });
  }
  if (forceChatTop || messages.length === 0) {
    const chatContainer = document.querySelector(".chat-container");
    if (chatContainer) {
      chatContainer.scrollTop = 0;
      requestAnimationFrame(() => {
        chatContainer.scrollTop = 0;
      });
    }
  }
}

function getActiveScrollContainer() {
  const nullState = document.getElementById("null-state");
  const nullStateVisible = nullState && nullState.style.display !== "none";
  if (nullStateVisible) {
    const shortcutsContainer = nullState.querySelector(".shortcuts");
    if (shortcutsContainer) {
      return shortcutsContainer;
    }
  }
  const helpOverlay = document.getElementById("null-state");
  if (isHelpOverlayOpen && helpOverlay && helpOverlay.style.display !== "none") {
    return helpOverlay;
  }
  return document.querySelector(".chat-container");
}

function getSecondaryScrollContainer(primary) {
  const chatContainer = document.querySelector(".chat-container");
  const helpOverlay = document.getElementById("null-state");
  const shortcutsContainer = helpOverlay?.querySelector(".shortcuts") || null;
  const helpVisible = helpOverlay && helpOverlay.style.display !== "none";

  if (primary === chatContainer) {
    if (helpVisible && shortcutsContainer) {
      return shortcutsContainer;
    }
    return helpVisible ? helpOverlay : null;
  }
  if (primary === helpOverlay || primary === shortcutsContainer) {
    return chatContainer;
  }
  return chatContainer;
}

function tryScrollContainer(container, delta) {
  if (!container) {
    return false;
  }
  const before = container.scrollTop;
  container.scrollTop += delta;
  return container.scrollTop !== before;
}

function scrollByDelta(delta) {
  const primary = getActiveScrollContainer();
  const didScrollPrimary = tryScrollContainer(primary, delta);
  if (didScrollPrimary) {
    return;
  }
  const secondary = getSecondaryScrollContainer(primary);
  tryScrollContainer(secondary, delta);
}

function scrollActiveContainer(direction, amount = 300) {
  const delta = direction === "up" ? -amount : amount;
  if (direction === "up") {
    scrollByDelta(delta);
  } else if (direction === "down") {
    scrollByDelta(delta);
  }
}

function applyHelpOverlayStyling(enabled) {
  const nullState = document.getElementById("null-state");
  if (!nullState) {
    return;
  }
  if (!enabled) {
    nullState.style.backgroundColor = "";
    nullState.style.position = "";
    nullState.style.top = "";
    nullState.style.left = "";
    nullState.style.width = "";
    nullState.style.height = "";
    nullState.style.zIndex = "";
    nullState.style.overflowY = "";
    nullState.style.overflowX = "";
    nullState.style.justifyContent = "";
    nullState.style.alignItems = "";
    return;
  }
  nullState.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
  nullState.style.position = "absolute";
  nullState.style.top = "0";
  nullState.style.left = "0";
  nullState.style.width = "100%";
  nullState.style.height = "100%";
  nullState.style.zIndex = "100";
  nullState.style.overflowY = "auto";
  nullState.style.overflowX = "hidden";
  nullState.style.justifyContent = "flex-start";
  nullState.style.alignItems = "center";
}

function toggleHelpOverlay(forceValue) {
  const nextValue =
    typeof forceValue === "boolean" ? forceValue : !isHelpOverlayOpen;
  isHelpOverlayOpen = nextValue;
  applyHelpOverlayStyling(isHelpOverlayOpen);
  const nullState = document.getElementById("null-state");
  if (nullState) {
    nullState.scrollTop = 0;
  }
  updateNullStateVisibility();
  resetHomePanelScroll({ forceChatTop: !isHelpOverlayOpen });
}

if (typeof window !== "undefined") {
  window.__rendererTestHooks = {
    setElectronAPIMock(mock = {}) {
      window.__TEST_ELECTRON_API__ = mock;
    },
    clearElectronAPIMock() {
      delete window.__TEST_ELECTRON_API__;
    },
    toggleInputRecording,
    toggleOutputRecording,
    toggleBothRecordings,
    handleRecordingHoldStart,
    handleRecordingHoldStop,
    toggleHelpOverlay,
    updateMessage,
  };
}

// Handle test response
async function handleTestResponse(prompt) {
  try {
    // Add user message
    const userMessage = {
      type: "user",
      timestamp: Date.now(),
      content: prompt,
    };
    messages.push(userMessage);

    const userMessageEl = document.createElement("div");
    userMessageEl.className = "message user";
    userMessageEl.textContent = prompt;
    chatHistory.appendChild(userMessageEl);

    // Show typing indicator
    typingIndicator.classList.add("visible");
    console.log("Showing typing indicator for new test response");

    // Add assistant message placeholder
    const messageId = Date.now().toString();
    const assistantMessage = {
      type: "assistant",
      timestamp: Date.now(),
      messageId,
      content: "",
      status: "pending",
    };
    messages.push(assistantMessage);

    const assistantMessageEl = createMessageElement(messageId);
    chatHistory.appendChild(assistantMessageEl);
    scrollToBottom();

    const result = await window.electronAPI.testResponse(prompt);
    if (!result.success) {
      throw new Error(result.error);
    }

    // Update the message with the response
    const contentWrapper = assistantMessageEl.querySelector(".message-content");
    if (contentWrapper) {
      if (result.content && typeof result.content === "string") {
        contentWrapper.innerHTML = marked.parse(result.content);
      } else {
        contentWrapper.innerHTML = ""; // Clear content if it's null/undefined or not a string
      }
      assistantMessageEl.classList.remove("loading");
      scrollToBottom();
    }

    // Update the message in the messages array
    assistantMessage.content = result.content;
    assistantMessage.status = "completed";

    // Hide typing indicator
    typingIndicator.classList.remove("visible");
    console.log("Test response complete, hiding typing indicator");
  } catch (error) {
    console.error("Error in handleTestResponse:", error);
    typingIndicator.classList.remove("visible");
    addErrorMessage(error.message);
  }
}
