const { contextBridge, ipcRenderer, shell } = require("electron");
const path = require("path");

let transcriptionService = null;
let transcriptionServiceLoadError = null;

function getTranscriptionService() {
  if (transcriptionService) {
    return transcriptionService;
  }

  if (transcriptionServiceLoadError) {
    throw transcriptionServiceLoadError;
  }

  const transcriptionServicePath = path.join(__dirname, "transcription-service.js");
  try {
    transcriptionService = require(transcriptionServicePath);
    return transcriptionService;
  } catch (error) {
    const wrappedError = new Error(
      `Transcription service failed to load from ${transcriptionServicePath}: ${error.message}`
    );
    wrappedError.cause = error;
    transcriptionServiceLoadError = wrappedError;
    throw wrappedError;
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Get settings
  getSettings: () => ipcRenderer.invoke("get-settings"),

  // Save settings
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),

  // Show settings window
  showSettings: () => ipcRenderer.invoke("show-settings"),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  hideWindow: () => ipcRenderer.invoke("hide-window"),
  showWindow: () => ipcRenderer.invoke("show-window"),

  // Context menu
  buildContextMenu: () => ipcRenderer.invoke("build-context-menu"),

  // Screenshot handling
  onScreenshotCaptured: (callback) =>
    ipcRenderer.on("screenshot-captured", (event, value) => callback(value)),
  analyzeScreenshot: (data) => ipcRenderer.invoke("analyze-screenshot", data),
  onStreamUpdate: (callback) =>
    ipcRenderer.on("stream-update", (event, value) => callback(value)),
  getScreenshotsDirectory: () =>
    ipcRenderer.invoke("get-screenshots-directory"),
  getRecentScreenshots: () => ipcRenderer.invoke("get-recent-screenshots"),

  // Test response
  testResponse: (prompt) => ipcRenderer.invoke("test-response", prompt),

  // File handling
  openFile: (path) => shell.openPath(path),

  // Chat reset
  onResetChat: (callback) =>
    ipcRenderer.on("reset-chat", (event) => callback()),

  // Window position
  onWindowPositionChanged: (callback) =>
    ipcRenderer.on("window-position-changed", (event, value) =>
      callback(value)
    ),
  updatePosition: (position) => ipcRenderer.invoke("update-position", position),

  // Scroll chat
  onScrollChat: (callback) =>
    ipcRenderer.on("scroll-chat", (event, direction) => callback(direction)),

  // Debugging
  debugLog: (payload) => ipcRenderer.invoke("debug-log", payload),
  getDebugLogPath: () => ipcRenderer.invoke("get-debug-log-path"),

  // Click-through mode
  onToggleMouseIgnore: (callback) =>
    ipcRenderer.on("toggle-mouse-ignore", (event, value) => callback(value)),

  // Recording tests
  onTestRecordingInput: (callback) =>
    ipcRenderer.on("test-recording-input", () => callback()),
  onTestRecordingOutput: (callback) =>
    ipcRenderer.on("test-recording-output", () => callback()),
  onTestRecordingBoth: (callback) =>
    ipcRenderer.on("test-recording-both", () => callback()),
  onRecordingHoldStart: (callback) =>
    ipcRenderer.on("recording-hold-start", (event, payload) => callback(payload)),
  onRecordingHoldStop: (callback) =>
    ipcRenderer.on("recording-hold-stop", (event, payload) => callback(payload)),

  // Dark mode
  onToggleDarkMode: (callback) =>
    ipcRenderer.on("toggle-dark-mode", (event) => callback()),
  onToggleHelp: (callback) =>
    ipcRenderer.on("toggle-help", () => callback()),

  // Transcription
  startTranscription: (stream, config, type, callback) => {
    const transcriptionService = getTranscriptionService();
    return transcriptionService.startTranscription(stream, config, type, callback);
  },
  stopTranscription: (type) => {
    const transcriptionService = getTranscriptionService();
    return transcriptionService.stopTranscription(type);
  },
  processTranscription: (text) => ipcRenderer.invoke("process-transcription", text),
  transcribeAudioChunk: (payload) => ipcRenderer.invoke("transcribe-audio-chunk", payload),
});

// No need for additional electron context bridge since we're handling everything through electronAPI
