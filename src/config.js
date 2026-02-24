const Store = require("electron-store");

const store = new Store({
  defaults: {
    openai: {
      apiKey: "",
      prompt: "Analyze this screenshot and provide insights.",
      model: "gpt-4o-mini"
    },
  },
});

module.exports = {
  getOpenAIKey: () => store.get("openai.apiKey") || "",
  setOpenAIKey: (key) => store.set("openai.apiKey", key),
  hasOpenAIKey: () => !!store.get("openai.apiKey"),
  getPrompt: () => store.get("openai.prompt") || "Analyze this screenshot and provide insights.",
  setPrompt: (prompt) => store.set("openai.prompt", prompt),
  getModel: () => store.get("openai.model") || "gpt-4o-mini",
  setModel: (model) => store.set("openai.model", model),
};
