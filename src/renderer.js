// DOM Elements
const chatHistory = document.getElementById("chat-history");
const typingIndicator = document.getElementById("typing-indicator");

// Chat state
let messages = [];
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

  // Handle response updates
  electronAPI.onStreamUpdate(updateMessage);

  // Handle chat scrolling from shortcuts
  electronAPI.onScrollChat((direction) => {
    const chatContainer = document.querySelector(".chat-container");
    if (chatContainer) {
      if (direction === "up") {
        chatContainer.scrollTop -= 300; // Scroll up by 300px
      } else if (direction === "down") {
        chatContainer.scrollTop += 300; // Scroll down by 300px
      }
    }
  });

  window.addEventListener('wheel', (event) => {
    if (event.altKey) {
      // Prevent default to prevent double scrolling side-effects
      event.preventDefault();
      const chatContainer = document.querySelector(".chat-container");
      if (chatContainer) {
        chatContainer.scrollTop += event.deltaY * 5; // Scroll faster
      }
    }
  }, { passive: false });

  // Handle recording tests
  electronAPI.onTestRecordingInput(toggleInputRecording);
  electronAPI.onTestRecordingOutput(toggleOutputRecording);
}

// Recording states
let inputRecorder = null;
let outputRecorder = null;

async function toggleInputRecording() {
  const electronAPI = getElectronAPI();
  debugLog("Input recording toggle requested", { active: Boolean(inputRecorder) });
  if (inputRecorder) {
    electronAPI.stopTranscription("input");
    inputRecorder = null;
    debugLog("Input transcription stop requested");
    await flushTranscriptionBuffer("Input");
    finalizeLiveTranscription("Input");
    addAssistantInfoMessage("Stopped transcription for input.");
    return;
  }

  try {
    await electronAPI.showWindow();
    const settings = await electronAPI.getSettings();
    transcriptionPauseMs = normalizeTranscriptionPauseMs(settings?.transcriptionPauseMs);
    let constraints = { audio: true };
    
    if (!settings.autoDetectInput && settings.inputDeviceId && settings.inputDeviceId !== "default") {
      constraints.audio = { deviceId: { exact: settings.inputDeviceId } };
    }

    debugLog("Starting input transcription", { constraints });
    await electronAPI.startTranscription(
      constraints,
      { pauseMs: transcriptionPauseMs },
      "input",
      (text, isFinal) => {
      if (isFinal) {
        debugLog("Input transcript received", { length: text?.length || 0 });
        addTranscriptionToChat("Input", text);
      }
      }
    );
    await electronAPI.showWindow();
    inputRecorder = true;
    debugLog("Input transcription started");
    addAssistantInfoMessage("Started transcription for input. Use menu again to stop.");
  } catch (err) {
    const errorDetails = getErrorDetails(err);
    debugLog("Input transcription failed", {
      ...errorDetails,
    });
    addErrorMessage("Failed to start input transcription: " + errorDetails.message);
  }
}

async function toggleOutputRecording() {
  const electronAPI = getElectronAPI();
  debugLog("Output recording toggle requested", { active: Boolean(outputRecorder) });
  if (outputRecorder) {
    electronAPI.stopTranscription("output");
    outputRecorder = null;
    debugLog("Output transcription stop requested");
    await flushTranscriptionBuffer("Output");
    finalizeLiveTranscription("Output");
    addAssistantInfoMessage("Stopped transcription for output.");
    return;
  }

  try {
    await electronAPI.showWindow();
    const settings = await electronAPI.getSettings();
    transcriptionPauseMs = normalizeTranscriptionPauseMs(settings?.transcriptionPauseMs);
    let constraints = { audio: true };
    
    if (!settings.autoDetectOutput && settings.outputDeviceId && settings.outputDeviceId !== "default") {
      constraints.audio = { deviceId: { exact: settings.outputDeviceId } };
    }

    debugLog("Starting output transcription", { constraints });
    await electronAPI.startTranscription(
      constraints,
      { pauseMs: transcriptionPauseMs, outputCaptureMode: "system" },
      "output",
      (text, isFinal) => {
      if (isFinal) {
        debugLog("Output transcript received", { length: text?.length || 0 });
        addTranscriptionToChat("Output", text);
      }
      }
    );
    await electronAPI.showWindow();
    outputRecorder = true;
    debugLog("Output transcription started");
    addAssistantInfoMessage("Started transcription for output. Use menu again to stop.");
  } catch (err) {
    const errorDetails = getErrorDetails(err);
    debugLog("Output transcription failed", {
      ...errorDetails,
    });
    addErrorMessage("Failed to start output transcription: " + errorDetails.message);
  }
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

  // Toggle help with '?'
  if (event.key === "?" && !event.ctrlKey && !event.metaKey) {
    const nullState = document.getElementById("null-state");
    if (nullState) {
      const isHidden = nullState.style.display === "none";
      nullState.style.display = isHidden ? "flex" : "none";
      // If showing, bring to front if it's an overlay (it's not yet, but let's make it look like one)
      if (isHidden) {
        nullState.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
        nullState.style.position = "absolute";
        nullState.style.top = "0";
        nullState.style.left = "0";
        nullState.style.width = "100%";
        nullState.style.height = "100%";
        nullState.style.zIndex = "100";
      } else {
        // Reset to original style if needed, but updateNullStateVisibility will handle it normally
        updateNullStateVisibility();
      }
    }
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
    nullState.style.display = messages.length === 0 ? "flex" : "none";
  }
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
