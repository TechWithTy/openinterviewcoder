const axios = require("axios");
const { ipcMain } = require("electron");
const fs = require("fs");
const config = require("./config");

const DEFAULT_ANALYSIS_PROMPT = "Analyze this screenshot and provide insights.";
const MERMAID_GUIDANCE = `

--- Diagram Guidance ---
When a diagram would materially clarify architecture, sequence, state, relationships, a workflow, or a timeline, include one concise Mermaid diagram in a fenced \`\`\`mermaid block. Choose the most suitable Mermaid chart type (for example flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, journey, gitGraph, or mindmap). Do not add a diagram when concise prose or code is clearer, and never invent facts solely to fill a diagram.

Mermaid must be valid for Mermaid 9.4. Use only simple, supported syntax: ASCII node IDs, short plain-text labels, and standard arrows. For an architecture diagram, prefer this safe shape:
\`\`\`mermaid
flowchart LR
  Client[Client] --> API[API service]
  API --> DB[(Database)]
\`\`\`
Do not use Markdown, code fences, HTML, template placeholders, unsupported diagram types, or unverified facts inside the Mermaid definition.`;
const SYSTEM_DESIGN_MERMAID_REQUIREMENT = `

--- System Design Diagram Requirement ---
For every system-design response that proposes, revises, explains, or deepens a design, you MUST include exactly one valid Mermaid diagram in a fenced \`\`\`mermaid block. Use flowchart for high-level architecture, sequenceDiagram for request or event flow, erDiagram for data relationships, and stateDiagram-v2 for state transitions. The only exception is a response limited exclusively to clarifying questions. The diagram must match the stated design and be concise.`;
const HIRING_MANAGER_MERMAID_REQUIREMENT = `

--- Technical Interview Diagram Requirement ---
For a Hiring Manager response about a technical system, architecture, production ownership, incident, API, data flow, deployment, reliability, or scalability, you MUST include exactly one concise valid Mermaid diagram in a fenced \`\`\`mermaid block. Use the diagram to show the system or flow being described. Do not add one for a purely behavioral, motivation, retention, or career-transition question.`;
const CODE_IMPLEMENTATION_REQUIREMENT = `

--- Code-First Implementation Requirement ---
This is an implementation request. Code is required: never replace it with a diagram, generic plan, or documentation recommendation.

For a live-editor request, return the smallest runnable vertical slice first, using the live-coding response format. Include exact code rather than pseudocode, ellipses, omitted functions, or placeholders. Ask no more than three clarifying questions, and only when an answer would materially change the behavior, contract, or data model; otherwise state the assumption briefly and begin coding. Include meaningful edge cases and a focused test or validation command when the interviewer requests testing or when it fits the current slice. Only provide a complete multi-file solution when the interviewer explicitly requests it. Include exactly one concise, valid Mermaid 9.4 diagram after the code to explain the current architecture or request flow; the diagram must support the code and never replace it.`;
const LIVE_CODING_SYSTEM_PROMPT = `You are a real-time software-engineering interview copilot in LIVE CODING MODE.

LIVE CODING MODE overrides every generic response format. When asked to build, implement, modify, debug, create an endpoint, use a framework, or work in an editor, output ONLY:
## SAY THIS
1-3 brief sentences the candidate can say.
## APPROACH
2-4 concise bullets covering the stated requirements, assumptions, first vertical slice, and the key tradeoff. This is an interview-ready decision summary, not hidden chain-of-thought.
## TYPE THIS
The exact next code to type in a fenced code block for the requested language.
## WHY
1-3 short bullets.
## EDGE CASES
Only the meaningful cases covered by this step.
## RUN THIS
The next command only when applicable.
## EXPECT
The expected result.
## DIAGRAM
Exactly one concise valid Mermaid 9.4 flowchart in a fenced \`\`\`mermaid block, placed after the code. Use only ASCII node IDs and labels made from letters, numbers, and spaces. Do not use punctuation, parentheses, ampersands, quotes, slashes, HTML, or Markdown inside labels.
## CLARIFICATIONS TO ASK NEXT
Up to three material questions to ask after the first working slice. If none are needed, state the assumptions used for this slice instead.
## LIKELY FOLLOW UPS
Two or three concise likely interviewer questions, each with the next implementation or reasoning direction.

Start by making a reasonable, explicitly stated assumption and giving the concise approach summary before code; do not wait for clarification unless it is impossible to produce a correct first slice safely. Preserve the exact public contract named by the interviewer: do not rename requested functions, methods, fields, paths, or operations, and do not specialize a general data structure into an unrelated domain such as images. Add code comments only for non-obvious choices, invariants, concurrency boundaries, or framework behavior; do not clutter the code with narration. If tests are requested, TYPE THIS must include at least one actual Go \`func Test...\` in a clearly labeled \`_test.go\` code block. A \`main\` function, sleep, curl command, or manual demonstration never substitutes for the requested test. When background cleanup or timers are used, make lifecycle ownership explicit with Stop or Close and avoid one long-lived goroutine per entry unless the interviewer specifically chooses that tradeoff. Stop after the smallest useful vertical implementation step unless the interviewer explicitly requests the complete solution. If a test is requested, include one focused test in this step when practical; otherwise make the next command validate the behavior and explicitly state the next test to add. Always include the concise Mermaid diagram after the implementation, then clarifications and likely follow-ups. Do NOT output Quick Summary, Key Points, Suggested Actions, Technical Notes, generic architecture overviews, study/documentation recommendations, humor, jokes, novelty text, or long introductions.

Explicit interviewer instructions are non-negotiable. Obey constraints in this order: explicit interviewer instructions; explicit framework/library; explicit language; functional requirements; testing; production quality; job preferences; general best practices. Never replace a requested framework with another implementation. Gin, Echo, Fiber, Chi, and other Go libraries are allowed when explicitly requested or when a framework choice is appropriate to the stated task; state the reason for the choice briefly. Preserve the interviewer-provided domain names, endpoint paths, fields, and constraints exactly; never invent a different domain, field, API, sample value, or humorous behavior. If the transcript does not establish a stable implementation task or framework name, ask the candidate to repeat the one missing detail rather than writing unrelated code. For a framework request, import it and use its idiomatic routing, typed models, validation, and generated documentation/schema features where applicable. If a framework name is incomplete or uncertain after transcription, ask one concise clarification question instead of guessing or substituting a framework.`;
const PRACTICAL_GO_TECHNICAL_SCREEN_REQUIREMENT = `

--- Practical Go Technical Screen Focus ---
This is a 60-minute practical backend live-coding screen in Go, not a LeetCode or full system-design interview. The interviewer is validating hands-on Go depth through how the candidate works.
- Start with the smallest useful vertical slice and make the code runnable before expanding it.
- Make idiomatic Go visible: clear package and function boundaries, straightforward control flow, explicit errors, useful request validation, realistic HTTP behavior when applicable, and small interfaces only when a seam is genuinely useful.
- Call out the meaningful happy path, invalid input, missing resource, duplicate/idempotency, concurrent-access, and dependency-failure cases only when they apply. Implement or validate the highest-risk cases rather than merely listing them.
- For mutable in-memory state, make the ownership and synchronization explicit; use a mutex or another simple correct primitive, and use race-aware testing when concurrency matters.
- Add a focused Go test or validation step early. Prefer table-driven tests, httptest, and go test -race when relevant; do not invent a test framework requirement.
- Explain the immediate tradeoff in one concise sentence: what you chose, why it is sufficient now, and what you would change at production scale.
- Ask at most three high-value clarification questions only when the answer changes API behavior, persistence, consistency, or an edge case. Otherwise state the assumption and continue coding.
Your output must demonstrate practical implementation, testing/validation, edge-case judgment, and concise verbal reasoning.`;
const HUMA_V2_VERIFIED_PATTERNS = `

--- Verified Huma v2 Patterns ---
For Huma v2, use documented patterns only:
- Register operations with huma.Register(api, huma.Operation{Method: http.MethodPost, Path: "/alerts", ...}, func(ctx context.Context, input *Input) (*Output, error) { ... }) or convenience helpers such as huma.Post(api, "/alerts", func(ctx context.Context, input *Input) (*Output, error) { ... }).
- Inputs and outputs are typed structs; use their Body fields and validation tags so Huma generates OpenAPI and JSON Schema.
- For framework tests, prefer router, api := humatest.New(t), register the same routes, then use api.Get/Post/etc. and inspect the returned httptest.ResponseRecorder.
- Do NOT invent huma.New, chained api.POST().Doc().Produces(), huma.ReadJSON, huma.PathValue, api.Handler(), or api.ListenAndServe() APIs.
`;

function isCodeImplementationRequest(prompt, configuredPrompt = "") {
  const text = String(prompt || "");
  const hasImplementationVerb = /\b(build|implement|write|create|code|coding|develop|add|modify|debug)\b/i.test(text);
  const hasBackendSignal = /\b(go|golang|huma|rest\s+api|http\s+(api|service)|endpoint|server|handler|route|test)\b/i.test(text);
  if (hasImplementationVerb && hasBackendSignal) return true;

  // Speech-to-text can drop framework names such as "Go" or "Huma". In the
  // dedicated practical Go screen, preserve live-coding mode for an explicit
  // spoken coding/API request instead of falling back to generic summaries.
  return isGoBackendCopilotV2(configuredPrompt) &&
    /\b(start|continue|begin)\s+(?:with\s+)?coding\b/i.test(text) &&
    /\b(api|endpoint|handler|test|store|request)\b/i.test(text);
}

function isGoBackendCopilotV2(configuredPrompt) {
  return /<prompt-profile>\s*go-backend-copilot-v2\s*<\/prompt-profile>/i.test(
    String(configuredPrompt || "")
  );
}

function buildLiveCodingSystemPrompt(userPrompt, configuredPrompt = config.getPrompt()) {
  const isHumaV2 = isHumaV2Request(userPrompt);
  return `${LIVE_CODING_SYSTEM_PROMPT}${
    isGoBackendCopilotV2(configuredPrompt) ? PRACTICAL_GO_TECHNICAL_SCREEN_REQUIREMENT : ""
  }${isHumaV2 ? HUMA_V2_VERIFIED_PATTERNS : ""}`;
}

function isHumaV2Request(prompt) {
  const text = String(prompt || "");
  return /\bhuma\b/i.test(text) ||
    /\b(?:human|humer|hummer)\s*(?:version\s*|v\s*)?(?:2|two)\b/i.test(text);
}

function normalizeTechnicalTranscription(text) {
  return String(text || "").replace(
    /\b(?:huma|human|humer|hummer)\s*(?:version\s*|v\s*)?(?:2|two)\b/gi,
    "Huma v2"
  );
}

function isLowSignalTranscription(text) {
  return /^(?:yes|yeah|yep|ok|okay|sounds good|got it|sure|thanks|thank you|lets move on)[.! ]*$/i.test(
    String(text || "").trim()
  );
}

function getDirectRequestText(prompt) {
  const transcriptMatch = String(prompt || "").match(
    /Transcript:\s*"([\s\S]*?)"\s*\n\s*Instructions:/i
  );
  return transcriptMatch ? transcriptMatch[1] : String(prompt || "");
}

function extractRequiredGoSymbols(prompt) {
  const request = getDirectRequestText(prompt);
  const symbols = new Set();
  const signatures = request.match(/\b[A-Z][A-Za-z0-9_]*\s*\(/g) || [];
  signatures.forEach((signature) => symbols.add(signature.replace(/\s*\($/, "")));
  return [...symbols];
}

function getLiveCodingOutputViolations(content, prompt) {
  const response = String(content || "");
  const request = getDirectRequestText(prompt);
  const violations = [];
  const requiredSymbols = extractRequiredGoSymbols(request);

  requiredSymbols.forEach((symbol) => {
    if (!new RegExp(`\\b${symbol}\\s*\\(`).test(response)) {
      violations.push(`missing required public Go API ${symbol}`);
    }
  });
  if (/\b(test|tests|testing)\b/i.test(request) &&
      (!/func\s+Test[A-Za-z0-9_]*/.test(response) || !/_test\.go/.test(response))) {
    violations.push("missing requested Go test file and func Test");
  }
  if (/\bdo not use http\b/i.test(request) && /(?:net\/http|gin-gonic|\bgin\.)/.test(response)) {
    violations.push("used HTTP or a framework despite the no-HTTP requirement");
  }
  if (isHumaV2Request(request) &&
      (!/github\.com\/danielgtaylor\/huma\/v2/.test(response) || !/huma\.(?:Register|Post|Get)\s*\(/.test(response))) {
    violations.push("did not use the requested Huma v2 API");
  }
  if (/\b(?:humor|humorous|joke|laugh)\b/i.test(response)) {
    violations.push("included prohibited humor");
  }
  return violations;
}

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are an invisible AI assistant that analyzes screenshots during meetings and presentations.

Key Responsibilities:
1. Analyze visual content quickly and efficiently
2. Provide concise, actionable insights
3. Identify key information, patterns, and potential issues
4. Suggest relevant follow-up questions or actions

Guidelines:
- Keep responses brief and scannable (max 200 words)
- Use bullet points and clear formatting
- Highlight important terms using **bold**
- Focus on actionable insights
- If code is shown, provide quick technical insights
- For data/charts, emphasize key trends and anomalies
- During presentations, note key takeaways and action items

Format your responses in sections:
• Quick Summary (2-3 sentences)
• Key Points (3-5 bullets)
• Suggested Actions (if applicable)
• Technical Notes (if code/data is present)`;

let isInitialized = false;

async function getOrganizationUsage() {
  const adminKey = config.getOpenAIAdminKey();
  if (!adminKey) return { success: false, error: "OpenAI admin key is not configured." };
  const startTime = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const now = new Date();
  const monthStartTime = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const headers = {
    Authorization: `Bearer ${adminKey}`,
    "Content-Type": "application/json",
  };
  try {
    const [completionResponse, audioResponse, costResponse, spendLimitResponse, monthCostResponse] = await Promise.all([
      fetch(`https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&bucket_width=1d&limit=31`, { headers }),
      fetch(`https://api.openai.com/v1/organization/usage/audio_transcriptions?start_time=${startTime}&bucket_width=1d&limit=31`, { headers }),
      fetch(`https://api.openai.com/v1/organization/costs?start_time=${startTime}&limit=31`, { headers }),
      fetch("https://api.openai.com/v1/organization/spend_limit", { headers }),
      fetch(`https://api.openai.com/v1/organization/costs?start_time=${monthStartTime}&limit=31`, { headers }),
    ]);
    const readResponse = async (response, label) => {
      if (response.ok) return { data: await response.json(), error: "" };
      const body = await response.text();
      let message = "";
      try {
        message = JSON.parse(body)?.error?.message || "";
      } catch (_) {
        message = body;
      }
      if (response.status === 401) {
        return {
          data: null,
          error: "OpenAI rejected OPEN_API_ADMIN_KEY. Create a valid read-only Organization Admin key (sk-admin-...) and replace the current value, then restart the app.",
        };
      }
      if (response.status === 403) {
        return {
          data: null,
          error: `${label}: OPEN_API_ADMIN_KEY is recognized but is not authorized for this organization resource.`,
        };
      }
      if (response.status === 404 && label === "Spend-limit request failed") {
        return {
          data: null,
          error: "No organization hard spend limit is configured in OpenAI.",
        };
      }
      return { data: null, error: `${label} (${response.status}): ${message || "Unknown API error"}` };
    };
    const [completion, audioUsage, costsUsage, spendLimit, monthCosts] = await Promise.all([
      readResponse(completionResponse, "AI usage request failed"),
      readResponse(audioResponse, "Transcription usage request failed"),
      readResponse(costResponse, "Costs request failed"),
      readResponse(spendLimitResponse, "Spend-limit request failed"),
      readResponse(monthCostResponse, "Current-month costs request failed"),
    ]);
    const sumResults = (payload, fields) => (payload.data || []).reduce(
      (total, bucket) => total + (bucket.results || []).reduce(
        (bucketTotal, result) => bucketTotal + fields.reduce((value, field) => value + (Number(result[field]) || 0), 0),
        0
      ),
      0
    );
    const sumCosts = (payload) => (payload?.data || []).reduce(
      (total, bucket) => total + (bucket.results || []).reduce(
        (bucketTotal, result) => bucketTotal + (Number(result.amount?.value) || 0), 0),
      0
    );
    const hardLimitUsd = spendLimit.data ? Number(spendLimit.data.threshold_amount) / 100 : null;
    const currentMonthCostsUsd = monthCosts.data ? sumCosts(monthCosts.data) : null;
    const remainingMonthlySpendUsd = hardLimitUsd !== null && currentMonthCostsUsd !== null
      ? Math.max(0, hardLimitUsd - currentMonthCostsUsd)
      : null;
    const errors = [...new Set([completion.error, audioUsage.error, costsUsage.error, monthCosts.error].filter(Boolean))];
    return {
      success: completion.data !== null || audioUsage.data !== null || costsUsage.data !== null,
      aiTokensUsed: completion.data ? sumResults(completion.data, ["input_tokens", "output_tokens"]) : null,
      transcriptionSecondsUsed: audioUsage.data ? sumResults(audioUsage.data, ["seconds", "audio_seconds", "num_seconds"]) : null,
      costsUsd: costsUsage.data ? sumCosts(costsUsage.data) : null,
      currentMonthCostsUsd,
      hardLimitUsd,
      remainingMonthlySpendUsd,
      hardLimitEnforced: spendLimit.data?.enforcement?.status === "enforcing",
      spendLimitError: spendLimit.error,
      source: "OpenAI organization usage (last 30 days)",
      error: errors.join(" | "),
    };
  } catch (error) {
    return { success: false, error: `OpenAI usage request failed: ${error.message}` };
  }
}

function buildTaskPrompt(userPrompt, configuredPrompt = config.getPrompt()) {
  const normalizedUserPrompt = String(userPrompt || "").trim();
  const normalizedConfiguredPrompt = String(configuredPrompt || "").trim();

  const basePrompt = !normalizedUserPrompt
    ? normalizedConfiguredPrompt || DEFAULT_ANALYSIS_PROMPT
    : !normalizedConfiguredPrompt || normalizedConfiguredPrompt === DEFAULT_ANALYSIS_PROMPT
      ? normalizedUserPrompt
      : `${normalizedConfiguredPrompt}

--- User Request ---
${normalizedUserPrompt}`;
  // Uploaded interview documents are useful context for every selected prompt,
  // including coding, system design, and hiring-manager modes.
  const interviewContext = buildInterviewDocumentContext();
  const isSystemDesignPrompt = /Real-Time System Design Interview Copilot/i.test(
    normalizedConfiguredPrompt
  );
  const isHiringManagerPrompt = /Real-Time Software Engineering Interview Copilot|GoodRx Backend Software Engineer interview|Real-Time Go Backend Interview Copilot/i.test(
    normalizedConfiguredPrompt
  );
  const requiresCode = isCodeImplementationRequest(normalizedUserPrompt, normalizedConfiguredPrompt);
  const requiresHumaV2 = requiresCode && isHumaV2Request(normalizedUserPrompt);
  const isGoV2 = isGoBackendCopilotV2(normalizedConfiguredPrompt);
  return `${basePrompt}${interviewContext}${requiresCode ? "" : MERMAID_GUIDANCE}${
    !requiresCode && isSystemDesignPrompt ? SYSTEM_DESIGN_MERMAID_REQUIREMENT : ""
  }${!requiresCode && isHiringManagerPrompt ? HIRING_MANAGER_MERMAID_REQUIREMENT : ""}${
    requiresCode ? CODE_IMPLEMENTATION_REQUIREMENT : ""
  }${isGoV2 && requiresCode ? PRACTICAL_GO_TECHNICAL_SCREEN_REQUIREMENT : ""}${
    requiresHumaV2 ? HUMA_V2_VERIFIED_PATTERNS : ""
  }`;
}

function buildInterviewDocumentContext() {
  const resume = config.getResumeDocument();
  const jobDescription = config.getJobDescriptionDocument();
  const resolvedSections = [];
  if (resume.text) {
    resolvedSections.push(`RESOLVED {{candidate_resume}} — ${resume.name || "uploaded resume"}:\n${resume.text}`);
  }
  if (jobDescription.text) {
    resolvedSections.push(`RESOLVED {{job_description}} — ${jobDescription.name || "uploaded job description"}:\n${jobDescription.text}`);
  }
  if (resolvedSections.length) {
    return `\n\n--- Resolved Interview Materials: Required Factual Context ---\nUse these documents before answering. When the question calls for personal experience and the material supports it, ground the answer in at least one specific verified employer, project, technology, responsibility, or metric from this context. Do not force a detail that is irrelevant, and never invent one.\n\n${resolvedSections.join("\n\n")}`;
  }
  const sections = [];
  if (resume.text) sections.push(`RÉSUMÉ (${resume.name || "uploaded résumé"}):\n${resume.text}`);
  if (jobDescription.text) sections.push(`JOB DESCRIPTION (${jobDescription.name || "uploaded job description"}):\n${jobDescription.text}`);
  return sections.length ? `\n\n--- Interview Materials (use as factual context) ---\n${sections.join("\n\n")}` : "";
}

function buildTranscriptionPrompt(source, text) {
  const normalizedSource = String(source || "").trim() || "Unknown";
  const normalizedText = String(text || "").trim();

  return `Treat the following transcribed speech as the user's direct request, not as content to summarize.

Source: ${normalizedSource}
Transcript: "${normalizedText}"

Instructions:
- Answer the request directly.
- Do not say "the transcript", "transcribed speech", or "source".
- Correct obvious speech-to-text errors in technical terms before answering.
- For collaborative document editors, if a phrase sounds like "ChatGPT engine", interpret it as "Operational Transformation engine" unless the user explicitly asks about ChatGPT.
- Do not mention ChatGPT, OpenAI, or AI model internals unless explicitly requested.`;
}

function shouldPrioritizeLeftPane(prompt) {
  const normalized = String(prompt || "").toLowerCase();
  return (
    normalized.includes("hackerrank") ||
    normalized.includes("left side") ||
    normalized.includes("left pane") ||
    normalized.includes("frontend coding interview")
  );
}

function shouldCaptureEditorPane(prompt) {
  const normalized = String(prompt || "").toLowerCase();
  return (
    normalized.includes("middle/editor pane") ||
    normalized.includes("current candidate code") ||
    normalized.includes("jsx scaffold") ||
    normalized.includes("full final jsx") ||
    normalized.includes("multiple jsx tabs") ||
    normalized.includes("two files")
  );
}

function shouldCaptureDebugPane(prompt) {
  const normalized = String(prompt || "").toLowerCase();
  return (
    normalized.includes("red text") ||
    normalized.includes("debugging") ||
    normalized.includes("error output") ||
    normalized.includes("right side of the window") ||
    normalized.includes("failing test")
  );
}

function buildPaneCrop(base64Image, xRatio, widthRatio) {
  try {
    const { nativeImage } = require("electron");
    const sourceImage = nativeImage.createFromBuffer(Buffer.from(base64Image, "base64"));
    if (sourceImage.isEmpty()) {
      return null;
    }

    const { width, height } = sourceImage.getSize();
    if (!width || !height) {
      return null;
    }

    const cropX = Math.max(0, Math.min(width - 1, Math.floor(width * xRatio)));
    const cropWidth = Math.max(
      1,
      Math.min(width - cropX, Math.floor(width * widthRatio))
    );
    const croppedImage = sourceImage.crop({
      x: cropX,
      y: 0,
      width: cropWidth,
      height,
    });

    return croppedImage.isEmpty() ? null : croppedImage.toPNG().toString("base64");
  } catch (error) {
    console.warn("Failed to build pane crop:", error.message);
    return null;
  }
}

function mimeTypeToFilename(mimeType) {
  if (!mimeType) return "chunk.webm";
  if (mimeType.includes("ogg")) return "chunk.ogg";
  if (mimeType.includes("wav")) return "chunk.wav";
  if (mimeType.includes("mp4")) return "chunk.mp4";
  return "chunk.webm";
}

async function transcribeAudioChunk({ audioBase64, mimeType, type, durationMs }) {
  const apiKey = config.getOpenAIKey();
  if (!audioBase64) {
    throw new Error("Missing audio payload");
  }

  const FormDataCtor = typeof FormData !== "undefined" ? FormData : null;
  const BlobCtor = typeof Blob !== "undefined" ? Blob : require("buffer").Blob;
  if (!FormDataCtor || !BlobCtor) {
    throw new Error("Runtime does not support FormData/Blob for audio transcription");
  }

  const fileBuffer = Buffer.from(audioBase64, "base64");
  const form = new FormDataCtor();
  const filename = mimeTypeToFilename(mimeType);
  const blob = new BlobCtor([fileBuffer], { type: mimeType || "audio/webm" });

  form.append("file", blob, filename);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("temperature", "0");
  form.append(
    "prompt",
    type === "output"
      ? "Transcribe clear spoken words from speaker/system audio."
      : "Transcribe clear spoken words from microphone input."
  );

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Audio transcription API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return (data.text || "").trim();
}

// Initialize the LLM service
// Initialize the LLM service
async function initializeLLMService() {
  if (!isInitialized) {
    ipcMain.handle("analyze-screenshot", async (event, data) => {
      try {
        validateConfig();
        return await makeLLMRequest(event, data);
      } catch (error) {
        console.error("LLM Error:", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("test-response", async (event, prompt) => {
      try {
        validateConfig();
        return await makeLLMRequest(event, { prompt });
      } catch (error) {
        console.error("LLM Test Error:", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("process-transcription", async (event, text) => {
      try {
        validateConfig();
        const match = String(text || "").match(/^Source:\s*([^,]+),\s*Text:\s*([\s\S]*)$/i);
        const source = match ? match[1].trim() : "Unknown";
        const transcript = normalizeTechnicalTranscription(
          match ? match[2].trim() : String(text || "").trim()
        );
        if (isLowSignalTranscription(transcript)) {
          return { success: true, ignored: true };
        }
        return await makeLLMRequest(event, { 
          prompt: buildTranscriptionPrompt(source, transcript)
        });
      } catch (error) {
        console.error("Transcription processing error:", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("transcribe-audio-chunk", async (event, payload) => {
      try {
        validateConfig();
        const text = await transcribeAudioChunk(payload || {});
        return { success: true, text };
      } catch (error) {
        console.error("Audio chunk transcription error:", error);
        return { success: false, error: error.message };
      }
    });

    isInitialized = true;
  }
}

function validateConfig() {
  const apiKey = config.getOpenAIKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Please set your API key in the settings."
    );
  }
  if (!apiKey.startsWith("sk-")) {
    throw new Error(
      "Invalid OpenAI API key format. API keys should start with 'sk-'"
    );
  }
}

async function makeLLMRequest(event, data) {
  const apiKey = config.getOpenAIKey();
  const prompt = buildTaskPrompt(data.prompt);
  const isLiveCodingRequest = isCodeImplementationRequest(data.prompt, config.getPrompt());
  const activeSystemPrompt = isLiveCodingRequest
    ? buildLiveCodingSystemPrompt(data.prompt)
    : SYSTEM_PROMPT;
  let selectedModel = config.getModel() || "gpt-5.6-terra";
  const visionModel = config.getVisionModel() || "gpt-5.6-luna";
  const usesMaxCompletionTokens = (model) => /^(?:gpt-5|o(?:1|3|4)(?:-|$))/.test(model);
  const isReasoningVisionModel = /^o(?:1|3|4)(?:-|$)/.test(visionModel);
  const visionUsesMaxCompletionTokens = usesMaxCompletionTokens(visionModel);
  let isOModel = /^o(?:1|3|4)(?:-|$)/.test(selectedModel);
  const selectedModelUsesMaxCompletionTokens = usesMaxCompletionTokens(selectedModel);
  const useTwoStep = config.getTwoStep();

  let base64Image = null;
  if (data.filePath) {
    if (!fs.existsSync(data.filePath)) {
      throw new Error("Screenshot file not found");
    }
    const imageBuffer = fs.readFileSync(data.filePath);
    base64Image = imageBuffer.toString("base64");
  }

  let extractedTextContext = "";
  const prioritizeLeftPane = shouldPrioritizeLeftPane(prompt);
  const captureEditorPane = shouldCaptureEditorPane(prompt);
  const captureDebugPane = shouldCaptureDebugPane(prompt);
  const leftPaneCropBase64 =
    base64Image && prioritizeLeftPane ? buildPaneCrop(base64Image, 0, 0.58) : null;
  const editorPaneCropBase64 =
    base64Image && captureEditorPane ? buildPaneCrop(base64Image, 0.38, 0.36) : null;
  const debugPaneCropBase64 =
    base64Image && captureDebugPane ? buildPaneCrop(base64Image, 0.72, 0.28) : null;

  if (base64Image && useTwoStep) {
    // 1. Two-Step Pipeline: Extraction using a vision model.
    try {
      const extractionInstructions = captureDebugPane
        ? "This is a HackerRank-style frontend coding interview screenshot. Extract three kinds of context: (1) the problem statement, requirements, examples, and constraints from the left pane, (2) the current JSX, starter code, component structure, props, function names, exports, and any visible file tabs or multi-file relationships from the middle editor pane, and (3) debugging evidence from the right pane such as red text, failing tests, stack traces, console errors, assertion messages, mismatch output, and runtime warnings. If multiple editor tabs or filenames are visible, identify each visible file and capture the code or role of each file separately. Use the full screenshot only to fill in gaps or verify layout relationships."
        : captureEditorPane
          ? "This is a HackerRank-style frontend coding interview screenshot. Extract two kinds of context: (1) the problem statement, requirements, examples, and constraints from the left pane, and (2) the current JSX, starter code, component structure, props, function names, exports, and any visible file tabs or multi-file relationships from the middle editor pane. If multiple editor tabs or filenames are visible, identify each visible file and capture the code or role of each file separately. Use the full screenshot only to fill in gaps or verify layout relationships."
        : prioritizeLeftPane
          ? "This is a coding interview screenshot. Prioritize the problem statement in the left pane or left half of the layout. If multiple panes are visible, treat the left-focused crop as the primary source of truth and use the full screenshot only for missing context."
          : "Extract all text and code from this image as accurately as possible, preserving the formatting.";

      const extractionContent = [
        {
          type: "text",
          text: captureDebugPane
            ? "Please extract the left-pane problem statement, the middle-pane JSX/editor code, and the right-pane debugging output separately. If the editor shows multiple visible tabs or filenames, list each visible file and the code or responsibility associated with it. For the right pane, capture red text, failing assertions, expected vs actual output, runtime errors, console errors, and stack traces whenever visible."
            : captureEditorPane
              ? "Please extract the left-pane problem statement and the middle-pane JSX/editor code separately. Include starter code details, required component names, props, helper functions, export shape, and any visible tab names or filenames. If multiple files appear relevant, separate them clearly."
              : prioritizeLeftPane
                ? "Please extract the coding problem from the left pane first. Prefer the left-focused crop, then use the full screenshot only to fill any gaps."
                : "Please extract all text and code.",
        },
      ];

      if (leftPaneCropBase64) {
        extractionContent.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${leftPaneCropBase64}`
          }
        });
      }

      if (editorPaneCropBase64) {
        extractionContent.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${editorPaneCropBase64}`
          }
        });
      }

      if (debugPaneCropBase64) {
        extractionContent.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${debugPaneCropBase64}`
          }
        });
      }

      extractionContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${base64Image}`
        }
      });

      const extractResponse = await axios({
        method: "post",
        url: "https://api.openai.com/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        data: {
          model: visionModel,
          messages: isReasoningVisionModel
            ? [{
                role: "user",
                content: [{
                  type: "text",
                  text: `You are a specialized OCR and layout extraction assistant. ${extractionInstructions}`,
                }, ...extractionContent],
              }]
            : [
                {
                  role: "system",
                  content: `You are a specialized OCR and layout extraction assistant. ${extractionInstructions}`,
                },
                {
                  role: "user",
                  content: extractionContent,
                },
              ],
          ...(visionUsesMaxCompletionTokens
            ? { max_completion_tokens: 2000 }
            : { max_tokens: 2000 }),
        },
      });

      if (extractResponse.data.choices && extractResponse.data.choices.length > 0) {
        extractedTextContext = "\\n\\n--- Extracted Text from Image ---\\n" + extractResponse.data.choices[0].message.content;
      }
    } catch (e) {
      console.warn("Vision extraction step failed, falling back.", e.message);
    }
  }

  let messages = [];

  const focusPrefix = captureDebugPane
    ? "\n\nImportant image-handling instruction: use the left pane for the problem statement and requirements, the middle/editor pane for the current JSX and starter code, and the right pane for debugging evidence such as red text, failing tests, assertion messages, console errors, and stack traces. If multiple editor tabs or files are visible, consider all relevant files together before producing the final answer. If the right pane shows concrete failure output, use it to diagnose and correct the final solution."
    : captureEditorPane
      ? "\n\nImportant image-handling instruction: use the left pane for the problem statement and requirements, and use the middle/editor pane for the current JSX, starter code, component shape, required exports, and any visible additional file tabs. Combine all relevant visible files before producing the final answer."
      : prioritizeLeftPane
      ? "\n\nImportant image-handling instruction: prioritize the coding problem shown in the left pane/left half of the screenshot. Ignore the center or right pane unless it is needed to complete missing context."
      : "";
  const finalPrompt = prompt + focusPrefix + extractedTextContext;

  if (isOModel) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: activeSystemPrompt + "\n\n" + finalPrompt }
      ]
    });
  } else {
    messages.push({
      role: "system",
      content: activeSystemPrompt
    });
    messages.push({
      role: "user",
      content: [
        { type: "text", text: finalPrompt }
      ]
    });
  }

  if (base64Image && !useTwoStep) {
    // If we're not using two-step, but an image is provided:
    if (leftPaneCropBase64) {
      messages[messages.length - 1].content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${leftPaneCropBase64}`
        }
      });
    }

    if (editorPaneCropBase64) {
      messages[messages.length - 1].content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${editorPaneCropBase64}`
        }
      });
    }

    if (debugPaneCropBase64) {
      messages[messages.length - 1].content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${debugPaneCropBase64}`
        }
      });
    }

    messages[messages.length - 1].content.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${base64Image}`
      }
    });

    if (isOModel) {
      console.warn(`Vision is not supported on ${selectedModel}. Falling back to gpt-4o.`);
      selectedModel = "gpt-4o";
      isOModel = false;
      
      messages = [
        {
          role: "system",
          content: activeSystemPrompt
        },
        {
          role: "user",
          content: [
            { type: "text", text: finalPrompt },
          ]
        }
      ];

      if (leftPaneCropBase64) {
        messages[1].content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${leftPaneCropBase64}`
          }
        });
      }

      if (editorPaneCropBase64) {
        messages[1].content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${editorPaneCropBase64}`
          }
        });
      }

      if (debugPaneCropBase64) {
        messages[1].content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${debugPaneCropBase64}`
          }
        });
      }

      messages[1].content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${base64Image}`
        }
      });
    }
  }

  const requestData = {
    model: selectedModel,
    messages: messages,
  };

  if (selectedModelUsesMaxCompletionTokens) {
    requestData.max_completion_tokens = 4000;
  } else {
    requestData.max_tokens = isLiveCodingRequest ? 4000 : 1000;
  }
  try {
    const response = await axios({
      method: "post",
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      data: requestData,
    });

    if (!response.data.choices || response.data.choices.length === 0) {
      throw new Error("Empty response from OpenAI");
    }

    let content = response.data.choices[0].message.content;
    const violations = isLiveCodingRequest
      ? getLiveCodingOutputViolations(content, data.prompt)
      : [];

    if (violations.length > 0) {
      const repairResponse = await axios({
        method: "post",
        url: "https://api.openai.com/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        data: {
          ...requestData,
          messages: [
            ...messages,
            { role: "assistant", content },
            {
              role: "user",
              content: `Repair the draft. It violated these hard requirements: ${violations.join("; ")}. Return the full corrected live-coding response only. Preserve the interviewer's exact requested public API and domain.`,
            },
          ],
        },
      });
      const repairedContent = repairResponse.data?.choices?.[0]?.message?.content;
      if (repairedContent) content = repairedContent;
    }
    const messageId = Date.now().toString();

    // Send the complete response back to renderer
    event.sender.send("stream-update", {
      messageId,
      content,
      isComplete: true,
      status: "completed",
    });

    return {
      success: true,
      messageId,
      content, // Add content to result for test-response
      provider: "openai",
      model: "gpt-4o-mini",
      status: "completed",
    };
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error(
          "Invalid API key. Please check your OpenAI API key in settings."
        );
      } else if (error.response.status === 429) {
        throw new Error(
          "You exceeded your current data quota. Please check your OpenAI plan and billing details to add credits."
        );
      }
      throw new Error(
        `API Error: ${error.response.data.error?.message || error.message}`
      );
    } else if (error.request) {
      throw new Error(
        "No response received from OpenAI API. Please check your internet connection."
      );
    }
    throw new Error(`Request Error: ${error.message}`);
  }
}

module.exports = {
  initializeLLMService,
  getOrganizationUsage,
  __test__: {
    buildTaskPrompt,
    buildTranscriptionPrompt,
    DEFAULT_ANALYSIS_PROMPT,
    MERMAID_GUIDANCE,
    SYSTEM_DESIGN_MERMAID_REQUIREMENT,
    HIRING_MANAGER_MERMAID_REQUIREMENT,
    CODE_IMPLEMENTATION_REQUIREMENT,
    LIVE_CODING_SYSTEM_PROMPT,
    HUMA_V2_VERIFIED_PATTERNS,
    PRACTICAL_GO_TECHNICAL_SCREEN_REQUIREMENT,
    isCodeImplementationRequest,
    isGoBackendCopilotV2,
    isHumaV2Request,
    normalizeTechnicalTranscription,
    isLowSignalTranscription,
    getDirectRequestText,
    extractRequiredGoSymbols,
    getLiveCodingOutputViolations,
    buildLiveCodingSystemPrompt,
  },
};

