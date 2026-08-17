const Store = require("electron-store");

const AVAILABLE_MODELS = new Set([
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5-2026-04-23",
  "gpt-5.4-2026-03-05",
  "gpt-5.2-2025-12-11",
  "gpt-5.1-2025-11-13",
  "gpt-5.1-codex",
  "gpt-5-codex",
  "gpt-5-chat-latest",
  "gpt-5-2025-08-07",
  "gpt-4.1-2025-04-14",
  "gpt-4o-2024-05-13",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-11-20",
  "o3-2025-04-16",
  "o1-preview-2024-09-12",
  "o1-2024-12-17",
  "gpt-5.4-mini-2026-03-17",
  "gpt-5.4-nano-2026-03-17",
  "gpt-5.1-codex-mini",
  "gpt-5-mini-2025-08-07",
  "gpt-5-nano-2025-08-07",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1-nano-2025-04-14",
  "gpt-4o-mini-2024-07-18",
  "o4-mini-2025-04-16",
  "o1-mini-2024-09-12",
  "codex-mini-latest",
]);

const VISION_MODELS = new Set([
  "gpt-5.6-sol", "gpt-5.5-2026-04-23", "gpt-5.4-2026-03-05",
  "gpt-5.2-2025-12-11", "gpt-5.1-2025-11-13", "gpt-5-2025-08-07",
  "gpt-5-chat-latest", "gpt-4.1-2025-04-14", "gpt-4o-2024-05-13",
  "gpt-4o-2024-08-06", "gpt-4o-2024-11-20", "o3-2025-04-16",
  "o1-2024-12-17", "gpt-5.6-terra", "gpt-5.6-luna",
  "gpt-5.4-mini-2026-03-17", "gpt-5.4-nano-2026-03-17",
  "gpt-5-mini-2025-08-07", "gpt-5-nano-2025-08-07",
  "gpt-4.1-mini-2025-04-14", "gpt-4.1-nano-2025-04-14",
  "gpt-4o-mini-2024-07-18", "o4-mini-2025-04-16",
]);

const store = new Store({
  defaults: {
    openai: {
      apiKey: "",
      prompt: "Analyze this screenshot and provide insights.",
      model: "gpt-5.6-terra",
      visionModel: "gpt-5.6-luna",
      autoDetectInput: true,
      autoDetectOutput: true,
      renderAssistantHtml: false,
      injectPreviousResponses: false,
      transcriptionPauseMs: 2500,
      inputDeviceId: "default",
      outputDeviceId: "default",
      interviewMode: false,
      interview: {
        resumeName: "",
        resumeText: "",
        jobDescriptionName: "",
        jobDescriptionText: "",
      },
      azure: {
        speechKey: "",
        region: ""
      }
    },
  },
});

module.exports = {
  getOpenAIKey: () => process.env.OPEN_API_KEY || process.env.OPENAI_API_KEY || process.env.WHISPER_API_KEY_1 || store.get("openai.apiKey") || "",
  getOpenAIAdminKey: () => process.env.OPEN_API_ADMIN_KEY || process.env.OPENAI_ADMIN_KEY || "",
  setOpenAIKey: (key) => store.set("openai.apiKey", key),
  hasOpenAIKey: () => !!store.get("openai.apiKey"),
  getPrompt: () => store.get("openai.prompt") || "Analyze this screenshot and provide insights.",
  setPrompt: (prompt) => store.set("openai.prompt", prompt),
  getModel: () => {
    const model = store.get("openai.model");
    return AVAILABLE_MODELS.has(model) ? model : "gpt-5.6-terra";
  },
  setModel: (model) => store.set("openai.model", model),
  getVisionModel: () => {
    const model = store.get("openai.visionModel");
    return VISION_MODELS.has(model)
      ? model
      : "gpt-5.6-luna";
  },
  setVisionModel: (model) => store.set("openai.visionModel", model),
  getTwoStep: () => store.get("openai.twoStep") || false,
  setTwoStep: (twoStep) => store.set("openai.twoStep", twoStep),
  getAutoDetectInput: () => store.get("openai.autoDetectInput") ?? true,
  setAutoDetectInput: (val) => store.set("openai.autoDetectInput", val),
  getAutoDetectOutput: () => store.get("openai.autoDetectOutput") ?? true,
  setAutoDetectOutput: (val) => store.set("openai.autoDetectOutput", val),
  getRenderAssistantHtml: () => store.get("openai.renderAssistantHtml") ?? false,
  setRenderAssistantHtml: (val) => store.set("openai.renderAssistantHtml", Boolean(val)),
  getInjectPreviousResponses: () => store.get("openai.injectPreviousResponses") ?? false,
  setInjectPreviousResponses: (val) => store.set("openai.injectPreviousResponses", Boolean(val)),
  getTranscriptionPauseMs: () => {
    const value = Number(store.get("openai.transcriptionPauseMs"));
    if (!Number.isFinite(value)) return 2500;
    return Math.min(60000, Math.max(1000, Math.round(value)));
  },
  setTranscriptionPauseMs: (ms) => {
    const value = Number(ms);
    const normalized = Number.isFinite(value) ? Math.min(60000, Math.max(1000, Math.round(value))) : 2500;
    store.set("openai.transcriptionPauseMs", normalized);
  },
  getInputDeviceId: () => store.get("openai.inputDeviceId") || "default",
  setInputDeviceId: (id) => store.set("openai.inputDeviceId", id),
  getOutputDeviceId: () => store.get("openai.outputDeviceId") || "default",
  setOutputDeviceId: (id) => store.set("openai.outputDeviceId", id),
  getInterviewMode: () => store.get("openai.interviewMode") ?? false,
  setInterviewMode: (enabled) => store.set("openai.interviewMode", Boolean(enabled)),
  getResumeDocument: () => ({
    name: store.get("openai.interview.resumeName") || "",
    text: store.get("openai.interview.resumeText") || "",
  }),
  setResumeDocument: ({ name, text }) => {
    store.set("openai.interview.resumeName", name || "");
    store.set("openai.interview.resumeText", text || "");
  },
  getJobDescriptionDocument: () => ({
    name: store.get("openai.interview.jobDescriptionName") || "",
    text: store.get("openai.interview.jobDescriptionText") || "",
  }),
  setJobDescriptionDocument: ({ name, text }) => {
    store.set("openai.interview.jobDescriptionName", name || "");
    store.set("openai.interview.jobDescriptionText", text || "");
  },
  getAzureSpeechKey: () => process.env.WHISPER_API_KEY_1 || store.get("openai.azure.speechKey") || "",
  setAzureSpeechKey: (key) => store.set("openai.azure.speechKey", key),
  getAzureSpeechRegion: () => process.env.WHISPER_API_KEY_LOCATION || store.get("openai.azure.region") || "",
  setAzureSpeechRegion: (region) => store.set("openai.azure.region", region),
};
