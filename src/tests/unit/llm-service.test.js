const { test, expect } = require("@playwright/test");
const { __test__ } = require("../../llm-service");

test.describe("LLM prompt composition", () => {
  test("wraps typed requests with the active prompt template", () => {
    const prompt = __test__.buildTaskPrompt(
      "Explain Google Docs collaboration with a Mermaid diagram.",
      "SYSTEMS TEMPLATE: always include Mermaid."
    );

    expect(prompt).toContain("SYSTEMS TEMPLATE: always include Mermaid.");
    expect(prompt).toContain("--- User Request ---");
    expect(prompt).toContain("Explain Google Docs collaboration");
  });

  test("uses typed requests directly when only the default prompt is active", () => {
    const prompt = __test__.buildTaskPrompt(
      "Explain a websocket flow.",
      __test__.DEFAULT_ANALYSIS_PROMPT
    );

    expect(prompt).toBe("Explain a websocket flow.");
  });

  test("builds direct-answer transcription prompts with technical correction rules", () => {
    const prompt = __test__.buildTranscriptionPrompt(
      "Input",
      "Explain Google Docs and show client websocket server and ChatGPT engine"
    );

    expect(prompt).toContain("user's direct request");
    expect(prompt).toContain("Operational Transformation engine");
    expect(prompt).toContain("Do not mention ChatGPT");
    expect(prompt).not.toContain("Please summarize");
  });
});
