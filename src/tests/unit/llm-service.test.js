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
    expect(prompt).toContain("Diagram Guidance");
    expect(prompt).toContain("```mermaid");
  });

  test("uses typed requests directly when only the default prompt is active", () => {
    const prompt = __test__.buildTaskPrompt(
      "Explain a websocket flow.",
      __test__.DEFAULT_ANALYSIS_PROMPT
    );

    expect(prompt).toContain("Explain a websocket flow.");
    expect(prompt).toContain("Diagram Guidance");
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

  test("requires a Mermaid diagram for system design responses", () => {
    const prompt = __test__.buildTaskPrompt(
      "Propose the high-level architecture for a notification system.",
      "<role>Act as my Real-Time System Design Interview Copilot.</role>"
    );

    expect(prompt).toContain("System Design Diagram Requirement");
    expect(prompt).toContain("MUST include exactly one valid Mermaid diagram");
  });

  test("requires a Mermaid diagram for technical hiring manager responses", () => {
    const prompt = __test__.buildTaskPrompt(
      "Explain the production architecture you owned.",
      "<role>Act as my Real-Time Software Engineering Interview Copilot.</role>"
    );

    expect(prompt).toContain("Technical Interview Diagram Requirement");
    expect(prompt).toContain("MUST include exactly one concise valid Mermaid diagram");
  });
});
