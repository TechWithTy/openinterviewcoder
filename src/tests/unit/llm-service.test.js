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

  test("prioritizes a practical Go coding slice over Mermaid for implementation requests", () => {
    const prompt = __test__.buildTaskPrompt(
      "Build a small production-style REST API in Go using Huma with focused tests.",
      "<prompt-profile>go-backend-copilot-v2</prompt-profile><role>Act as my Real-Time Go Backend Interview Copilot.</role>"
    );

    expect(__test__.isCodeImplementationRequest("Build a REST API in Go using Huma.")).toBeTruthy();
    expect(prompt).toContain("Code-First Implementation Requirement");
    expect(prompt).toContain("smallest runnable vertical slice");
    expect(prompt).toContain("never replace it with a diagram");
    expect(prompt).not.toContain("Technical Interview Diagram Requirement");
    expect(prompt).not.toContain("Diagram Guidance");
    expect(prompt).toContain("Verified Huma v2 Patterns");
    expect(prompt).toContain("huma.Register");
    expect(prompt).toContain("humatest.New(t)");
    expect(prompt).toContain("Practical Go Technical Screen Focus");
    expect(prompt).toContain("60-minute practical backend live-coding screen");
    expect(prompt).toContain("Ask at most three high-value clarification questions");
    expect(prompt).toContain("focused Go test or validation step early");
  });

  test("uses a live-coding system prompt that requires code, edge cases, and validation", () => {
    const systemPrompt = __test__.buildLiveCodingSystemPrompt(
      "Build an in-memory alerts API in Go. Include a focused test and make the store concurrency-safe.",
      "<prompt-profile>go-backend-copilot-v2</prompt-profile>"
    );

    expect(systemPrompt).toContain("## SAY THIS");
    expect(systemPrompt).toContain("## APPROACH");
    expect(systemPrompt).toContain("## CLARIFICATIONS TO ASK NEXT");
    expect(systemPrompt).toContain("## TYPE THIS");
    expect(systemPrompt).toContain("## EDGE CASES");
    expect(systemPrompt).toContain("## RUN THIS");
    expect(systemPrompt).toContain("## DIAGRAM");
    expect(systemPrompt).toContain("## LIKELY FOLLOW UPS");
    expect(systemPrompt).toContain("smallest useful vertical implementation step");
    expect(systemPrompt).toContain("If a test is requested, include one focused test");
    expect(systemPrompt).toContain("practical backend live-coding screen in Go");
    expect(systemPrompt).toContain("concurrent-access");
    expect(systemPrompt).toContain("go test -race");
    expect(systemPrompt).toContain("Do NOT output Quick Summary");
    expect(systemPrompt).toContain("Do NOT output Quick Summary, Key Points");
    expect(systemPrompt).toContain("Exactly one concise valid Mermaid 9.4 flowchart");
    expect(systemPrompt).toContain("ASCII node IDs");
    expect(systemPrompt).toContain("Do not use punctuation, parentheses, ampersands");
    expect(systemPrompt).toContain("Gin, Echo, Fiber, Chi, and other Go libraries are allowed");
    expect(systemPrompt).toContain("never invent a different domain, field, API, sample value, or humorous behavior");
    expect(systemPrompt).toContain("ask the candidate to repeat the one missing detail rather than writing unrelated code");
    expect(systemPrompt).toContain("ask one concise clarification question instead of guessing");
    expect(systemPrompt).toContain("Start by making a reasonable, explicitly stated assumption and giving the concise approach summary before code");
    expect(systemPrompt).toContain("interview-ready decision summary, not hidden chain-of-thought");
    expect(systemPrompt).toContain("comments only for non-obvious choices");
    expect(systemPrompt).toContain("Preserve the exact public contract named by the interviewer");
    expect(systemPrompt).toContain("actual Go `func Test...` in a clearly labeled `_test.go` code block");
    expect(systemPrompt).toContain("manual demonstration never substitutes for the requested test");
  });

  test("keeps the manager feedback out of unrelated prompts", () => {
    const systemPrompt = __test__.buildLiveCodingSystemPrompt(
      "Build a REST API in Go.",
      "<role>Act as a generic Go coding helper.</role>"
    );

    expect(systemPrompt).not.toContain("Practical Go Technical Screen Focus");
    expect(__test__.isGoBackendCopilotV2("<prompt-profile>go-backend-copilot-v2</prompt-profile>")).toBeTruthy();
    expect(__test__.isGoBackendCopilotV2("<role>generic</role>")).toBeFalsy();
  });

  test("keeps spoken practical API requests in live-coding mode when transcription loses Go or Huma", () => {
    const goV2Prompt = "<prompt-profile>go-backend-copilot-v2</prompt-profile>";
    const transcribedRequest = "Let's start coding the alerts API endpoint and test it.";
    const wrappedTranscript = __test__.buildTranscriptionPrompt("Input", transcribedRequest);
    const taskPrompt = __test__.buildTaskPrompt(wrappedTranscript, goV2Prompt);

    expect(__test__.isCodeImplementationRequest(wrappedTranscript, goV2Prompt)).toBeTruthy();
    expect(taskPrompt).toContain("Code-First Implementation Requirement");
    expect(taskPrompt).not.toContain("Diagram Guidance");
    expect(taskPrompt).toContain("Practical Go Technical Screen Focus");
  });

  test("normalizes common speech-to-text variants of Huma v2 before selecting framework guidance", () => {
    const goV2Prompt = "<prompt-profile>go-backend-copilot-v2</prompt-profile>";
    const corrected = __test__.normalizeTechnicalTranscription("Build this with human version two.");
    const taskPrompt = __test__.buildTaskPrompt(corrected, goV2Prompt);

    expect(corrected).toContain("Huma v2");
    expect(__test__.isHumaV2Request("Use hummer v 2")).toBeTruthy();
    expect(taskPrompt).toContain("Verified Huma v2 Patterns");
  });

  test("ignores low-signal spoken acknowledgements instead of generating a generic summary", () => {
    expect(__test__.isLowSignalTranscription("Yes")).toBeTruthy();
    expect(__test__.isLowSignalTranscription("Sounds good.")).toBeTruthy();
    expect(__test__.isLowSignalTranscription("Build the alerts API")).toBeFalsy();
  });

  test("detects coding drafts that change the requested Go contract or omit tests", () => {
    const request = "Build a queue in package subscriptions with Enqueue(task string) error, Dequeue() (string, error), and Close(). Do not use HTTP. Include tests.";
    const invalidDraft = "package crypto\nfunc Task(task string) error { return nil }\nfunc Close() {}";
    const violations = __test__.getLiveCodingOutputViolations(invalidDraft, request);

    expect(violations).toContain("missing required public Go API Enqueue");
    expect(violations).toContain("missing required public Go API Dequeue");
    expect(violations).toContain("missing requested Go test file and func Test");
    expect(violations).toContain("missing required Go package declaration package subscriptions");
  });

  test("detects renamed Go types, signatures, files, and concurrent tests", () => {
    const request = "In `processor.go`, implement `type SubscriptionEvent`, `NewProcessor() *Processor`, `Process(event SubscriptionEvent) error`, and `Events(subscriptionID string) []SubscriptionEvent`. In `processor_test.go`, add a concurrent processing test.";
    const invalidDraft = "// subscriptions/subscriptions.go\npackage subscriptions\ntype Subscription struct{}\nfunc NewProcessor(types []string) *Processor { return nil }\nfunc (p *Processor) Process(event Subscription) error { return nil }\nfunc TestProcessorDuplicate(t *testing.T) {}";
    const violations = __test__.getLiveCodingOutputViolations(invalidDraft, request);

    expect(violations).toContain("missing required Go type SubscriptionEvent");
    expect(violations).toContain("missing required Go signature NewProcessor() *Processor");
    expect(violations).toContain("missing required Go signature Process(event SubscriptionEvent) error");
    expect(violations).toContain("missing required Go signature Events(subscriptionID string) []SubscriptionEvent");
    expect(violations).toContain("missing required Go file processor.go");
    expect(violations).toContain("missing required Go file processor_test.go");
    expect(violations).toContain("missing requested concurrent-processing Go test");
  });

  test("corrects a close misspelling of a required public Go API", () => {
    const request = "Implement `NewProcessor() *Processor` and `Process(event Event) error`.";
    const draft = "func NewProceassor() *Processor { return nil }\nfunc Process(event Event) error { return nil }";

    expect(__test__.correctNearMissedRequiredGoSymbols(draft, request))
      .toContain("func NewProcessor() *Processor");
  });

  test("corrects the NewProcessor typo even when transcription omitted the contract", () => {
    const draft = "processor := NewProceassor()";

    expect(__test__.correctNearMissedRequiredGoSymbols(draft, "Process subscription events."))
      .toBe("processor := NewProcessor()");
  });
});
