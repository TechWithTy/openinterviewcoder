const Store = require("electron-store");

const store = new Store({
  defaults: {
    openai: {
      apiKey: "",
      prompt: "Analyze this screenshot and provide insights.",
      model: "gpt-4o-mini",
      autoDetectInput: true,
      autoDetectOutput: true,
      transcriptionPauseMs: 2500,
      inputDeviceId: "default",
      outputDeviceId: "default",
      azure: {
        speechKey: "",
        region: ""
      }
    },
  },
});

module.exports = {
  getOpenAIKey: () => process.env.OPEN_API_KEY || process.env.OPENAI_API_KEY || store.get("openai.apiKey") || "",
  setOpenAIKey: (key) => store.set("openai.apiKey", key),
  hasOpenAIKey: () => !!store.get("openai.apiKey"),
  getPrompt: () => store.get("openai.prompt") || "Analyze this screenshot and provide insights.",
  setPrompt: (prompt) => store.set("openai.prompt", prompt),
  getModel: () => store.get("openai.model") || "gpt-4o-mini",
  setModel: (model) => store.set("openai.model", model),
  getTwoStep: () => store.get("openai.twoStep") || false,
  setTwoStep: (twoStep) => store.set("openai.twoStep", twoStep),
  getAutoDetectInput: () => store.get("openai.autoDetectInput") ?? true,
  setAutoDetectInput: (val) => store.set("openai.autoDetectInput", val),
  getAutoDetectOutput: () => store.get("openai.autoDetectOutput") ?? true,
  setAutoDetectOutput: (val) => store.set("openai.autoDetectOutput", val),
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
  getAzureSpeechKey: () => process.env.WHISPER_API_KEY_1 || store.get("openai.azure.speechKey") || "",
  setAzureSpeechKey: (key) => store.set("openai.azure.speechKey", key),
  getAzureSpeechRegion: () => process.env.WHISPER_API_KEY_LOCATION || store.get("openai.azure.region") || "",
  setAzureSpeechRegion: (region) => store.set("openai.azure.region", region),
};
