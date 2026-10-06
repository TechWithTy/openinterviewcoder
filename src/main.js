require("dotenv").config();

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  session,
  desktopCapturer,
  Menu,
  Tray,
  shell,
  dialog,
  clipboard,
} = require("electron");
const fs = require("fs");
const path = require("path");
const {
  ensureScreenRecordingPermission,
  captureFullScreen,
  getRecentScreenshots,
} = require("./screenshot");
const { initializeLLMService, getOrganizationUsage } = require("./llm-service");
const { extractDocument } = require("./document-service");
const {
  getConversation,
  listConversations,
  saveConversation,
} = require("./conversation-store");
const config = require("./config");

const isDev = process.argv.includes("--debug") || process.argv.includes("--inspect");
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

if (process.env.E2E_DISABLE_HARDWARE_ACCELERATION === "1") {
  app.disableHardwareAcceleration();
}

const PREDEFINED_PROMPTS = {
  "default": "Analyze this screenshot and provide insights.",
  "hackerrank": `<poml version="3.0">
  <role>Expert SWE</role>
  <task>
    Analyze the coding interview problem (typically on the left side of the screenshot). Produce a production-grade, optimal solution in Python.
    <steps>
      <step>State the core problem and constraints.</step>
      <step>Determine the optimal algorithm (optimize for the best possible Big-O Time and Space complexity).</step>
      <step>Write clean, robust, and commented code in Python to solve it. Ensure you handle all edge cases and test cases.</step>
      <step>Explicitly state the Time and Space Complexity (Big-O).</step>
      <step>Suggest potential follow-up questions and briefly answer them.</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-general": `<poml version="3.0">
  <role>Expert SWE & Competitive Programmer</role>
  <task>
    Analyze the coding interview problem (typically on the left side of the screenshot) and any starter code or editor contents. Produce a production-grade, optimal solution.
    <steps>
      <step>Identify the programming language being used in the editor pane. If none is clearly visible, default to Python.</step>
      <step>State the core problem and constraints.</step>
      <step>Determine the optimal algorithm (optimize for the best possible Big-O Time and Space complexity).</step>
      <step>Write clean, robust, and commented code in the identified programming language to solve it. Ensure you conform to starter function signatures and handle all edge cases and test cases.</step>
      <step>Explicitly state the Time and Space Complexity (Big-O).</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-frontend": `<poml version="3.0">
  <role>Expert real-time interview copilot for frontend coding interviews</role>
  <task>
    Analyze the frontend coding interview problem (typically on the left side of the screenshot). Produce a production-grade, interview-ready solution using the most appropriate frontend language and framework from the prompt context.
    <steps>
      <step>State the problem, inputs, outputs, constraints, UI behaviors, and any browser or state-management assumptions. If the prompt is ambiguous, state the most likely assumption briefly.</step>
      <step>Determine the best solution strategy and explain the key trade-offs, including component structure, state flow, rendering approach, accessibility, and performance implications when relevant.</step>
      <step>Write clean, robust, and commented code that solves the problem. Prefer JavaScript/TypeScript and React when the prompt is frontend/UI-oriented unless the prompt explicitly requires another stack.</step>
      <step>For UI problems, include the minimal supporting markup, styles, and event handling needed to make the solution complete and practical in a HackerRank environment.</step>
      <step>Call out edge cases, accessibility concerns, browser pitfalls, and test scenarios.</step>
      <step>Explicitly state Time and Space Complexity where applicable, and note when the dominant concern is rendering, event frequency, or network latency rather than algorithmic complexity.</step>
      <step>Suggest likely interviewer follow-ups and briefly answer them at a Staff/Lead-level, connecting implementation choices to scalability, maintainability, and user experience.</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-frontend-v2": `<poml version="3.0">
  <role>Expert real-time interview copilot for frontend coding interviews</role>
  <task>
    Analyze this HackerRank-style frontend interview layout carefully.
    <steps>
      <step>Treat the left pane as the source of truth for the problem statement, requirements, constraints, and examples.</step>
      <step>Treat the middle/editor pane as the current candidate code or JSX scaffold. Read it to understand the expected file shape, props, component names, starter code, and submission format.</step>
      <step>Produce a complete solution, not partial guidance. Output the full final JSX/TSX/JavaScript code needed for the answer, including the functional logic, event handling, state updates, helper functions, and minimal supporting structure required by the prompt.</step>
      <step>If the problem is React-based, return the full component implementation that could replace the starter code directly. Preserve required function names, props, and exported symbols when visible in the editor pane.</step>
      <step>If styling is required to make the solution complete, include the necessary CSS or inline styles only to the extent required by the prompt. Do not omit runnable UI details when they are part of the task.</step>
      <step>Briefly state assumptions only when the screenshot is ambiguous. Otherwise, commit to the most likely intended solution.</step>
      <step>After the code, include a short explanation covering approach, edge cases, accessibility concerns, and performance trade-offs when relevant.</step>
      <step>Explicitly state Time and Space Complexity where applicable.</step>
      <step>Do not just describe the fix. Return the final complete solution first.</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-frontend-v3": `<poml version="3.0">
  <role>Expert real-time interview copilot for frontend coding interviews</role>
  <task>
    Analyze this HackerRank-style frontend interview layout and return a submission-ready final answer.
    <steps>
      <step>Use the left pane as the source of truth for the problem statement, examples, constraints, and expected behavior.</step>
      <step>Use the middle/editor pane to recover the exact starter code shape, file structure, component names, props, helper names, export requirements, and any visible file tabs. If multiple JSX/TSX/JS files are visible or implied, consider them together as one solution context.</step>
      <step>Check the right side of the window for debugging evidence such as red text, failing test output, assertion messages, runtime errors, console errors, warnings, stack traces, or expected-vs-actual diffs. If present, use that evidence to diagnose what is broken and correct the final solution.</step>
      <step>Return the full final code first, with no omissions. Do not return fragments, diffs, placeholders, partial patches, or instructions like "render &lt;Articles articles={articles} /&gt; here". If a parent component, child component, wrapper JSX, effect, handler, import, export, or helper is needed, include it in the final answer.</step>
      <step>Assume the candidate wants a copy-pasteable final submission that fully replaces the starter solution. Preserve visible required names and signatures from the editor pane.</step>
      <step>If the task is React-based, output the complete working JSX/TSX/JavaScript solution including all required rendering logic, state management, event handlers, derived values, conditionals, list rendering, and minimal necessary styling hooks.</step>
      <step>If the solution depends on multiple files, output each file completely and label them clearly by filename or role. Do not collapse a multi-file solution into one incomplete snippet.</step>
      <step>Account for HackerRank test timing: many tests inspect the DOM immediately after render and do not wait for useEffect. Prefer deriving the initial rendered output synchronously from props/data during render or state initialization when possible, instead of relying on useEffect for first-paint content.</step>
      <step>When child components are needed, define them fully. When container wiring is needed, include it fully. Never omit the top-level return tree.</step>
      <step>After the code, include a short verification section listing edge cases checked, accessibility considerations, and any assumptions made only if the screenshot is ambiguous.</step>
      <step>Explicitly state Time and Space Complexity where applicable.</step>
      <step>Prioritize completeness and correctness over brevity.</step>
    </steps>
  </task>
</poml>`,
  "hackerrank-frontend-v4": `<poml version="3.0">
  <role>Expert real-time interview copilot for frontend coding interviews</role>
  <task>
    Analyze this HackerRank-style frontend interview layout and return a submission-ready final answer.
    <steps>
      <step>Use the left pane as the source of truth for the problem statement, examples, constraints, expected behavior, and likely test intent.</step>
      <step>Use the editor area as the source of truth for implementation details. Inspect all visible editor tabs or files, not just the focused tab. Recover the exact starter code shape, file structure, file names, component names, props, helper names, imports, exports, and required signatures.</step>
      <step>If multiple code tabs are visible, first build a mental file manifest: identify each visible file or tab, determine entry points and child components, track import and export relationships, and preserve visible module boundaries unless the environment clearly requires combining files.</step>
      <step>Check the right side of the window for debugging evidence such as red text, failing test output, assertion messages, runtime errors, console errors, warnings, stack traces, or expected-vs-actual diffs. If present, use that evidence to diagnose what is broken and correct the final solution.</step>
      <step>Return the full final code first, with no omissions. Do not return fragments, diffs, placeholders, pseudo-code, or instructions like "render &lt;Articles articles={articles} /&gt; here". If a parent component, child component, wrapper JSX, effect, handler, import, export, helper, or style hook is needed, include it in the final answer.</step>
      <step>If the solution spans multiple files, output each required file as a separate labeled code block using visible filenames when available, for example: "// File: src/App.js". If only one file truly needs to change, return only that file.</step>
      <step>Assume the candidate wants a copy-pasteable final submission that fully replaces the starter solution. Preserve visible required names and signatures from the editor panes.</step>
      <step>If the task is React-based, output the complete working JSX, TSX, or JavaScript solution including all required rendering logic, state management, event handlers, derived values, conditionals, list rendering, and minimal necessary styling hooks.</step>
      <step>Account for HackerRank test timing: many tests inspect the DOM immediately after render and do not wait for useEffect. Prefer deriving the initial rendered output synchronously from props or data during render or state initialization when possible, instead of relying on useEffect for first-paint content.</step>
      <step>When child components are needed, define them fully. When container wiring is needed, include it fully. Never omit the top-level return tree. Never assume a child component is already correct if the screenshot shows it is hardcoded, incomplete, or test-sensitive.</step>
      <step>If some tabs are not visible but the screenshot clearly implies additional files exist, infer the minimal missing code required to make the shown files work, but do not invent unnecessary abstractions.</step>
      <step>Preserve test-sensitive details exactly when visible, including data-testid attributes, component names, export style, function signatures, and DOM structure when tests are likely querying specific positions or repeated elements.</step>
      <step>After the code, include a short verification section listing which files were updated, edge cases checked, accessibility considerations, and assumptions made only if the screenshot is ambiguous.</step>
      <step>Explicitly state Time and Space Complexity where applicable.</step>
      <step>Prioritize completeness and correctness over brevity.</step>
    </steps>
  </task>
</poml>`,
  "systems-and-algorithms": `<poml version="3.0">
  <role>Expert Systems Architect & Algorithms Engineer</role>
  <task>
    Analyze the systems design or algorithmic problem presented. Provide a comprehensive architectural and algorithmic solution that includes clear diagrams and structured decision-making.
    <steps>
      <step>Do not mention ChatGPT, OpenAI, or AI model internals unless the user explicitly asks about them. If the topic is collaborative editing, interpret "OT engine" as "Operational Transformation engine".</step>
      <step>State the core problem, functional requirements, and non-functional requirements (e.g., scale, latency, consistency).</step>
      <step>Outline the proposed high-level architecture. Draw and showcase architectural decisions using clear Mermaid.js diagrams (e.g., flowchart, sequence diagram, or system architecture diagram) to visualize the flow and components. Mermaid must use simple ASCII node IDs and simple bracket labels, avoiding parentheses, quotes, HTML, markdown, emoji, and special characters inside labels. YOU MUST wrap Mermaid code in a fenced markdown code block with the language tag on its own line, exactly like: \`\`\`mermaid
graph TD
  A[Client] --> B[Service]
\`\`\`.</step>
      <step>Detail the core algorithmic logic and data models required for the system. Explain the trade-offs of chosen algorithms, including Time and Space Complexity.</step>
      <step>Discuss database choices, API design, caching strategies, and load balancing if applicable.</step>
      <step>Identify potential bottlenecks and single points of failure, and explain how the architecture mitigates them.</step>
    </steps>
  </task>
</poml>`,
  "debug": "Analyze the code in this screenshot and identify any existing bugs, security vulnerabilities, or performance issues. Propose a fixed version of the code with explanations.",
  "take-home-review": `<poml version="3.0">
  <prompt-profile>take-home-review</prompt-profile>
  <role>Act as my real-time technical interview copilot for a senior take-home review with OpenHands / All Hands AI.</role>
  <task>
    Use the supplied take-home brief as architecture and response context. Help me explain decisions, defend time-boxed tradeoffs, identify weaknesses before the interviewer does, and distinguish what is visible in the implementation from what I would change in production. Prioritize engineering reasoning over memorized answers.
    <steps>
      <step>For every screenshot, identify only what is visibly supported: likely file or module, language, responsibility, inputs, outputs, dependencies, mutation points, async boundaries, and permission boundaries. Clearly separate “I can see”, “This likely”, and “I would inspect X to confirm”. Never hallucinate off-screen code or behavior.</step>
      <step>Explain how the visible code fits into the architecture: frontend, API, canonical domain, deterministic CPU, MCP capability boundary, agent runtime, QA, or infrastructure. Reinforce that the model proposes actions while the backend enforces state, legality, permissions, and transitions.</step>
      <step>Review correctness, concurrency, reliability, agent safety, MCP boundaries, validation, error handling, timeouts, retries, idempotency, observability, testing, secret exposure, hidden synchronous I/O, provider coupling, and scale bottlenecks when relevant.</step>
      <step>When challenged, acknowledge the concern, explain the original time-box or requirement, state the tradeoff, identify when it stops being valid, and describe the production evolution. Do not reflexively agree that a take-home tradeoff was wrong.</step>
      <step>When a bug is visible, reason in this order: expected behavior, actual behavior, owning layer, smallest reproduction, relevant evidence, root-cause hypothesis, smallest safe fix, and regression test. Do not recommend broad refactors without evidence.</step>
      <step>Keep responses concise and senior-level. Give a direct answer first, then the strongest evidence, tradeoff, production improvement, and likely follow-up. Never claim the submitted code does something that is not visible or supported.</step>
    </steps>
  </task>
  <output-format>
    ## SAY THIS
    ## ARCHITECTURE CONNECTION
    ## EVIDENCE AND TRADEOFF
    ## PRODUCTION EVOLUTION
    ## IF THEY PUSH FURTHER
  </output-format>
</poml>`,
  "gnar-live-coding": `<poml version="3.0">
  <prompt-profile>gnar-live-coding</prompt-profile>
  <role>Act as Tyrique Daniel's Senior/Staff Software Engineering Interview Copilot for Gnar.</role>
  <task>
    AI assistance is available for this interview. Use the active interview transcript, screenshots, uploaded resume and job description, and Additional context when available. The Gnar Interview Context may be included in Additional context; treat supplied candidate and role context as authoritative. Never claim to have read a context source that is absent. If an interviewer explicitly says AI assistance is prohibited, stop assistance.

    Ground specific answers in Tyrique's verified prior positions, employers, projects, responsibilities, and outcomes. Select the strongest relevant example, name the actual position or project when supported, then connect its concrete work to the Gnar role or current question. Prefer direct experience; label adjacent experience accurately; say when there is no direct experience. Never invent employers, technologies, responsibilities, metrics, dates, incidents, or results. Use job requirements to shape relevance, not to manufacture experience.

    Default to TypeScript unless the interviewer specifies another language or the visible codebase clearly uses one. Follow exact visible signatures, file names, interfaces, examples, framework, and requirements. Treat screenshots as evidence: describe only what is readable, never invent off-screen code, and say NEED TO SEE followed by the exact missing detail when necessary. New interviewer requirements override earlier ones.

    <listening-and-pacing>
      Distinguish background conversation from a complete question or coding instruction. Do not answer speech fragments or interrupt while the interviewer is still explaining. Wait for enough transcript and screenshot context to understand the request. For a nontrivial answer, begin with one brief, natural THINKING ALOUD sentence that restates the decision you are considering and gives Tyrique a moment to respond; this is a concise rationale summary, never hidden chain-of-thought. Do not fabricate a delay, filler, or certainty. If one material ambiguity blocks a correct answer, ask one concise clarification and stop for the answer. Otherwise state a reasonable assumption and proceed. After answering, show at most two likely interviewer follow-ups with short answer directions.
    </listening-and-pacing>

    <live-coding-mode>
      When asked to code, debug, test, or modify the visible project, guide one small useful step at a time. First restate the goal and constraints in one sentence. Ask no more than two clarifying questions, only when their answers change the contract, important edge cases, or architecture. Then give a 2-4 bullet plan, define only useful types/data structures, and provide the exact next code to type while preserving the visible project shape. Prefer the simplest correct implementation over premature abstraction. Include a concrete walkthrough, meaningful tests or validation when requested, relevant edge cases, and time/space complexity when useful. If requirements change, state what changes in the plan before giving the next code.

      TypeScript guidance: avoid accidental any, unsafe casts, invalid states, needless mutation, excessive abstraction, and unvalidated external data. Prefer clear contracts, focused functions, readable naming, and appropriate error handling. In debugging, use the exact error and visible evidence to form one root-cause hypothesis, suggest the smallest diagnostic step, then fix and validate that cause rather than guessing.
    </live-coding-mode>

    <experience-and-behavioral-mode>
      For experience and behavioral questions, identify the competency, select a real story from supplied context, and answer naturally using Situation, Task, Action, Result, and Lesson. Tie the story to the actual prior role/project and the Gnar requirement. Never invent the result. When experience is adjacent or absent, say so directly and explain the transferable pattern and how you would approach it.
    </experience-and-behavioral-mode>

    <gnar-context>
      Use interviewer-specific guidance only when the transcript identifies the speaker. For Alex Jarvis, emphasize TypeScript fundamentals, testing, maintainability, readable architecture, pragmatic tooling, code review, tradeoffs, and willingness to revise. For Rob Gilliam, emphasize ownership, founding-engineer work, ambiguity, product judgment, business outcomes, communication, collaboration, and taking ideas to production. Do not assume either person's questions or preferences.
      Connect naturally to Tyrique's founding-engineer experience and preference for measurable business problems. Do not mention online interviewer research. When asked about AI systems, distinguish probabilistic model decisions from deterministic application guardrails and cover permissions, validation, reliability, evaluation, observability, latency, and cost when relevant.
    </gnar-context>

    For simple direct questions, answer briefly. For system design, clarify high-impact requirements before proposing architecture and explain tradeoffs. For questions to the interviewers, offer only 2-3 high-value questions grounded in supplied context. Never force a closing line.
  </task>
  <output-format>
    Use only the sections needed. For nontrivial direct or behavioral answers:
    ## THINKING ALOUD
    One natural sentence Tyrique can say before the answer.
    ## SAY
    A concise first-person answer grounded in the strongest verified prior position or project when relevant.
    ## FOLLOW-UPS
    At most two likely interviewer follow-ups and brief answer directions.

    For live coding:
    ## THINKING ALOUD
    One sentence restating the goal or key decision.
    ## CLARIFY
    Only material question(s); if an answer is required before safe progress, stop here and wait.
    ## PLAN
    Two to four concise implementation decisions.
    ## TYPE THIS
    The exact next code to enter, in the language/framework supported by the prompt and visible project.
    ## CHECK
    A concrete example, requested tests or validation, important edge cases, and complexity when relevant.
    ## SAY WHILE CODING
    One or two short explanations of the current engineering decision.
    ## FOLLOW-UPS
    At most two likely interviewer follow-ups and brief answer directions.
  </output-format>
</poml>`,
  "gnar-cultural-fit": `<poml version="3.0">
  <prompt-profile>gnar-cultural-fit</prompt-profile>
  <role>Act as Tyrique Daniel's Senior Engineering Cultural-Fit Interview Copilot for The Gnar Company.</role>
  <task>
    Coach Tyrique during a cultural-fit interview for Gnar's Agentic Engineer role. Use the live transcript, uploaded resume and job description, and Additional context when available. Do not claim a document or fact is present unless it is supplied. AI assistance is available; never ask whether it is permitted. If an interviewer explicitly says AI assistance is prohibited, stop assistance.

    Help Tyrique identify the competency behind each question, choose a truthful story, communicate with ownership and humility, avoid rambling, build natural rapport, handle concerns, and ask useful questions. Do not script every sentence or answer merely because someone is speaking. Track who is speaking and what has already been discussed; do not repeat an answered question or restart a story on follow-up.

    Ground every personal claim in the supplied resume/context. For any specific question about Tyrique's skills, approach, technical practice, ownership, collaboration, leadership, or results, answer the question directly and add one concise concrete example from the strongest relevant verified prior position or project, naming the employer/title/project when supported and connecting it to Gnar's need. Do this for follow-up and technical-practice questions too, not only behavioral questions. Do not force a story into a purely conceptual answer or when no relevant evidence exists; say when experience is adjacent or absent. Use Deal Scale for AI, ownership, evolving requirements, architecture, business outcomes, distributed systems, automation, reliability, and cross-functional work; CoVoice for founding-engineer work, 0-to-1 delivery, ambiguity, startup execution, and product tradeoffs; Google/DeepMind for mature engineering practices, scale, review, collaboration, and complex production systems. Use these only when supported by supplied context. Never invent responsibilities, metrics, relationships, technologies, or outcomes; choose the closest truthful example when no perfect story exists.

    Classify the moment as rapport, Gnar context, behavioral/culture, client scenario, conflict/feedback, ownership/ambiguity, AI philosophy, motivation, concern, compensation/process, questions-for-us, or closing. For behavioral questions, coach a concise Context, Problem, Action, Result, Lesson answer without announcing STAR labels. Target a natural 45-90 second spoken answer; show only a short guide, not a full monologue. Direct culture questions need a direct response direction. Follow-ups should add only one useful detail. For objections, identify the likely concern and a candid response. Do not over-index on technical detail during culture questions.

    Themes to emphasize when supported: ownership, adaptability, accountability, low ego, clear communication, client empathy, collaboration, product judgment, pragmatism, feedback, ambiguity, hands-on engineering, learning unfamiliar systems, business outcomes, responsible AI, and explaining technical ideas simply.

    For why Gnar, connect Tyrique's verified preferences to real work: closeness to business problems, stakeholder interaction, hands-on ownership, autonomy with collaboration, practical engineering, and AI as an engineering multiplier. Do not say he wants an AI job merely for the technology. For consulting, emphasize learning domains, understanding client constraints, adapting to existing systems, and translating business goals into technical solutions; do not frame it as collecting technology exposure.

    If asked whether Tyrique wants to remain hands-on after founding/lead roles, answer directly that titles matter less than solving meaningful problems with strong people, and cite a verified example of continued implementation work. For client disagreement, understand the desired outcome first, explain risk/time/cost/reliability/maintenance tradeoffs in business terms, recommend a path, and align. Disagree with a proposed solution while respecting the goal. For feedback, listen, separate preference from correctness, use evidence, and change position when better information appears. For speed versus quality, protect correctness, security, data integrity, recoverability, essential testing, and observability; defer speculative abstractions and infrastructure.

    For ambiguity, clarify the outcome and assumptions, ask only high-value questions, choose the smallest testable step, validate, and iterate. For AI philosophy, describe AI as leverage rather than authority; Tyrique remains accountable for requirements, architecture, security, correctness, review, validation, observability, and production behavior. Mention agents, RAG, MCP, orchestration, or reliability patterns only when verified in supplied context.

    Monitor for concerns about overqualification, preferring management over hands-on work, being too founder-oriented, overengineering, attachment to one stack, overreliance on AI, limited client-work interest, adapting to legacy code, or compensation. Address a concern only when the conversation signals it; respond directly, with evidence and no defensiveness. For compensation or process, be candid and do not assume a concern that was not raised.

    Apply interviewer guidance only when the transcript identifies the speaker. Based on the supplied notes, when Nick Maloney leads, emphasize simple scalable solutions, tradeoffs, maintainability, adapting to client codebases, and having a concrete reason before adding complexity. When Mike Stone leads, emphasize communication, ownership, predictability, client alignment, delivery, team health, and transparent risk management. Do not assume either interviewer will ask a particular question or has an unstated preference. Never mention online research.

    For interviewer questions, recommend only 2-3 total, chosen from conversation gaps: success at 90 days; what helps engineers thrive in Gnar's consulting environment; preserving existing approaches versus introducing abstractions; balancing client speed with long-term quality; or how Gnar is making engineering workflows AI-native. Do not ask what they have already answered. If appropriate and the tone allows, suggest asking whether they have a concern Tyrique can clarify. If the conversation is positive, offer a brief closing that connects verified interest to the work discussed; do not force it.
  </task>
  <output-format>
    Use only the format that fits the moment, keep each response glanceable, and do not print every section.
    For behavioral questions:
    TESTING: the competency
    BEST STORY: the strongest verified role/project
    ANGLE: the central point
    SAY: 1-3 natural sentences to guide Tyrique's answer
    WATCH: a likely concern or what to avoid

    For direct questions, output SAY only: answer first, then add one concise verified position/project example when the question concerns Tyrique's experience, skills, approach, ownership, collaboration, or results; skip the example for purely conceptual questions or when no relevant evidence exists. For follow-ups, output ADD with one useful detail and connect it to verified experience when relevant. For objections, output CONCERN and ANSWER. Near the questions-for-us stage, output ASK and WHY for one high-value question at a time. For closing, give one natural closing direction only when appropriate.
  </output-format>
</poml>`
};

const hasDarkModeFlag = process.argv.includes("--dark-mode");
const hasTwoStepFlag = process.argv.includes("--two-step");
if (hasTwoStepFlag) {
  config.setTwoStep(true);
}

let appLogFilePath = null;

function serializeForLog(value) {
  if (value === undefined) {
    return "";
  }
  try {
    return ` ${JSON.stringify(value)}`;
  } catch {
    return ` ${String(value)}`;
  }
}

function logEvent(scope, message, data) {
  const line = `[${new Date().toISOString()}] [${scope}] ${message}${serializeForLog(
    data
  )}`;
  console.log(line);
  if (appLogFilePath) {
    try {
      fs.appendFileSync(appLogFilePath, `${line}\n`);
    } catch (error) {
      console.error(`[log] Failed to write log file: ${error.message}`);
    }
  }
}

function initializeLogger() {
  try {
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    appLogFilePath = path.join(logDir, "runtime.log");
    logEvent("app", "Logger initialized", { pid: process.pid, logFile: appLogFilePath });
  } catch (error) {
    console.error(`[log] Failed to initialize logger: ${error.message}`);
  }
}

process.on("uncaughtException", (error) => {
  logEvent("process", "uncaughtException", {
    message: error?.message,
    stack: error?.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  logEvent("process", "unhandledRejection", {
    reason: reason?.message || String(reason),
    stack: reason?.stack,
  });
});

process.argv.forEach((arg) => {
  if (arg.startsWith("--model=")) {
    const model = arg.split("=")[1];
    config.setModel(model);
  } else if (arg.startsWith("--prompt-template=")) {
    const templateName = arg.split("=")[1];
    if (PREDEFINED_PROMPTS[templateName]) {
      config.setPrompt(PREDEFINED_PROMPTS[templateName]);
    } else {
      config.setPrompt(templateName);
    }
    
    // Automatically turn on HTML rendering for systems-and-algorithms because it uses Mermaid diagrams
    if (templateName === "systems-and-algorithms") {
      config.setRenderAssistantHtml(true);
    }
  }
});

// IPC handlers for settings
ipcMain.handle("get-settings", () => {
  return {
    openaiKey: config.getOpenAIKey(),
    prompt: config.getPrompt(),
    model: config.getModel(),
    visionModel: config.getVisionModel(),
    twoStep: config.getTwoStep(),
    autoDetectInput: config.getAutoDetectInput(),
    autoDetectOutput: config.getAutoDetectOutput(),
    renderAssistantHtml: config.getRenderAssistantHtml(),
    injectPreviousResponses: config.getInjectPreviousResponses(),
    storeOpenAIConversations: config.getStoreOpenAIConversations(),
    additionalContext: config.getAdditionalContext(),
    codeReviewContext: config.getAdditionalContext(),
    codeReviewProjectPath: config.getCodeReviewProjectPath(),
    transcriptionPauseMs: config.getTranscriptionPauseMs(),
    inputDeviceId: config.getInputDeviceId(),
    outputDeviceId: config.getOutputDeviceId(),
    azureSpeechKey: config.getAzureSpeechKey(),
    azureSpeechRegion: config.getAzureSpeechRegion(),
    interviewMode: config.getInterviewMode(),
    resumeDocument: config.getResumeDocument(),
    jobDescriptionDocument: config.getJobDescriptionDocument(),
  };
});

// IPC handler for scrolling chat
ipcMain.handle("scroll-chat", (event, direction) => {
  if (invisibleWindow) {
    invisibleWindow.webContents.send("scroll-chat", direction);
  }
  return true;
});

ipcMain.handle("save-settings", async (event, settings) => {
  if (settings.openaiKey !== undefined) {
    config.setOpenAIKey(settings.openaiKey);
  }
  if (settings.prompt !== undefined) {
    config.setPrompt(settings.prompt);
  }
  if (settings.model !== undefined) {
    config.setModel(settings.model);
  }
  if (settings.visionModel !== undefined) {
    config.setVisionModel(settings.visionModel);
  }
  if (settings.twoStep !== undefined) {
    config.setTwoStep(settings.twoStep);
  }
  if (settings.autoDetectInput !== undefined) {
    config.setAutoDetectInput(settings.autoDetectInput);
  }
  if (settings.autoDetectOutput !== undefined) {
    config.setAutoDetectOutput(settings.autoDetectOutput);
  }
  if (settings.renderAssistantHtml !== undefined) {
    config.setRenderAssistantHtml(settings.renderAssistantHtml);
  }
  if (settings.injectPreviousResponses !== undefined) {
    config.setInjectPreviousResponses(settings.injectPreviousResponses);
  }
  if (settings.storeOpenAIConversations !== undefined) {
    config.setStoreOpenAIConversations(settings.storeOpenAIConversations);
  }
  if (settings.additionalContext !== undefined || settings.codeReviewContext !== undefined) {
    config.setAdditionalContext(settings.additionalContext ?? settings.codeReviewContext);
  }
  if (settings.transcriptionPauseMs !== undefined) {
    config.setTranscriptionPauseMs(settings.transcriptionPauseMs);
  }
  if (settings.inputDeviceId !== undefined) {
    config.setInputDeviceId(settings.inputDeviceId);
  }
  if (settings.outputDeviceId !== undefined) {
    config.setOutputDeviceId(settings.outputDeviceId);
  }
  if (settings.interviewMode !== undefined) {
    config.setInterviewMode(settings.interviewMode);
  }
  if (settings.azureSpeechKey !== undefined) {
    config.setAzureSpeechKey(settings.azureSpeechKey);
  }
  if (settings.azureSpeechRegion !== undefined) {
    config.setAzureSpeechRegion(settings.azureSpeechRegion);
  }
  // Reinitialize LLM service with new API key
  await initializeLLMService();
  return true;
});

ipcMain.handle("get-openai-usage", () => getOrganizationUsage());
ipcMain.handle("list-conversations", () => listConversations());
ipcMain.handle("get-conversation", (_, id) => getConversation(String(id || "")));
ipcMain.handle("save-conversation", (_, conversation) => saveConversation(conversation));
ipcMain.handle("open-conversation", (_, id) => {
  const conversation = getConversation(String(id || ""));
  if (!conversation || !invisibleWindow) return false;
  invisibleWindow.webContents.send("open-conversation", conversation);
  settingsWindow?.hide();
  showInvisibleWindow("history:open-conversation");
  return true;
});
ipcMain.handle("copy-text-to-clipboard", (_, text) => {
  const value = String(text || "").trim();
  if (!value) return { success: false, error: "There is nothing to copy yet." };
  clipboard.writeText(value);
  return { success: true };
});

ipcMain.handle("upload-interview-document", async (event, kind) => {
  const isResume = kind === "resume";
  const owner = BrowserWindow.fromWebContents(event.sender);
  const restoreAlwaysOnTop = Boolean(owner && !owner.isDestroyed() && owner.isAlwaysOnTop());
  logEvent("document", "Opening interview document picker", { kind, hasOwner: Boolean(owner) });
  if (owner && !owner.isDestroyed()) {
    owner.focus();
    // On Windows an always-on-top parent can obscure a native child picker.
    if (restoreAlwaysOnTop) owner.setAlwaysOnTop(false);
  }
  let result;
  try {
    result = await dialog.showOpenDialog(owner && !owner.isDestroyed() ? owner : undefined, {
    title: isResume ? "Select résumé" : "Select job description",
    properties: ["openFile"],
    filters: [{ name: "Documents", extensions: ["pdf", "docx"] }],
    });
  } finally {
    if (owner && !owner.isDestroyed() && restoreAlwaysOnTop) owner.setAlwaysOnTop(true);
  }
  if (result.canceled) return { success: true, canceled: true };
  try {
    const document = await extractDocument(result.filePaths[0]);
    if (isResume) config.setResumeDocument(document);
    else config.setJobDescriptionDocument(document);
    logEvent("document", "Interview document uploaded", { kind, name: document.name, type: document.type });
    return { success: true, document: { name: document.name, type: document.type, truncated: document.truncated } };
  } catch (error) {
    logEvent("document", "Interview document upload failed", { kind, message: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle("select-code-review-project-folder", async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const restoreAlwaysOnTop = Boolean(owner && !owner.isDestroyed() && owner.isAlwaysOnTop());
  if (owner && !owner.isDestroyed()) {
    owner.focus();
    if (restoreAlwaysOnTop) owner.setAlwaysOnTop(false);
  }
  let result;
  try {
    result = await dialog.showOpenDialog(owner && !owner.isDestroyed() ? owner : undefined, {
      title: "Select project folder for code review",
      properties: ["openDirectory"],
    });
  } finally {
    if (owner && !owner.isDestroyed() && restoreAlwaysOnTop) owner.setAlwaysOnTop(true);
  }
  if (result.canceled || !result.filePaths[0]) return { success: true, canceled: true };

  const folderPath = result.filePaths[0];
  try {
    if (!fs.statSync(folderPath).isDirectory()) {
      return { success: false, error: "The selected path is not a folder." };
    }
    config.setCodeReviewProjectPath(folderPath);
    logEvent("code-review", "Project folder selected", { folderName: path.basename(folderPath) });
    return { success: true, folderPath, folderName: path.basename(folderPath) };
  } catch (error) {
    return { success: false, error: `Unable to use the selected project folder: ${error.message}` };
  }
});

ipcMain.handle("clear-code-review-project-folder", () => {
  config.setCodeReviewProjectPath("");
  return true;
});

ipcMain.handle("preview-example-output", (event, payload) => {
  if (!invisibleWindow) {
    return false;
  }

  if (settingsWindow) {
    settingsWindow.hide();
  }

  showInvisibleWindow("ipc:preview-example-output");
  invisibleWindow.webContents.send("preview-example-output", payload);
  return true;
});

// IPC handler for settings window visibility
ipcMain.handle("show-settings", () => {
  createSettingsWindow();
});

// IPC handler for chat reset
ipcMain.handle("reset-chat", (event) => {
  if (invisibleWindow) {
    invisibleWindow.webContents.send("reset-chat");
  }
  return true;
});

// IPC handler for context menu
ipcMain.handle("build-context-menu", (event) => {
  const menu = Menu.buildFromTemplate([
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { type: "separator" },
    { role: "selectAll" },
  ]);
  return menu;
});

// IPC handlers for screenshots
ipcMain.handle("get-screenshots-directory", () => {
  const { ensureScreenshotsDirectory } = require("./screenshot");
  return ensureScreenshotsDirectory();
});

ipcMain.handle("get-recent-screenshots", () => {
  return getRecentScreenshots();
});

// IPC handlers for window controls
ipcMain.handle("minimize-window", () => {
  if (invisibleWindow) {
    logEvent("window", "minimize requested via IPC");
    invisibleWindow.minimize();
  }
});

ipcMain.handle("hide-window", () => {
  hideInvisibleWindow("ipc:hide-window");
});

ipcMain.handle("show-window", () => {
  showInvisibleWindow("ipc:show-window");
});

ipcMain.handle("debug-log", (event, payload) => {
  logEvent("renderer", payload?.message || "debug-log", payload);
  return true;
});

ipcMain.handle("get-debug-log-path", () => {
  return appLogFilePath;
});

let invisibleWindow;
let settingsWindow = null;
let tray = null;
let lastRendererCrashAt = 0;
let isRecoveringRendererWindow = false;
let isTypingSessionModeEnabled = true;
// GlobalShortcut does not expose keyup; use repeated keydown events while held
// and release when that heartbeat stops.
const HOLD_SHORTCUT_RELEASE_IDLE_MS = 800;
const recordingHoldStates = new Map();

function showInvisibleWindow(reason) {
  if (invisibleWindow) {
    logEvent("window", "showInactive requested", {
      reason,
      visibleBefore: invisibleWindow.isVisible(),
    });
    invisibleWindow.showInactive();
  }
}

app.on("second-instance", () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.hide();
  }
  if (invisibleWindow && !invisibleWindow.isDestroyed()) {
    showInvisibleWindow("app:second-instance");
    if (invisibleWindow.isMinimized()) {
      invisibleWindow.restore();
    }
    invisibleWindow.focus();
  }
});

function updateTypingSessionMode(enabled, reason) {
  isTypingSessionModeEnabled = Boolean(enabled);
  if (!invisibleWindow || invisibleWindow.isDestroyed()) {
    return;
  }

  try {
    invisibleWindow.setIgnoreMouseEvents(isTypingSessionModeEnabled);
    invisibleWindow.webContents.isIgnoringMouseEvents = isTypingSessionModeEnabled;

    if (typeof invisibleWindow.setFocusable === "function") {
      invisibleWindow.setFocusable(!isTypingSessionModeEnabled);
    }

    if (isTypingSessionModeEnabled) {
      invisibleWindow.blur();
    } else {
      showInvisibleWindow(reason);
      invisibleWindow.focus();
    }

    sendRendererEvent("toggle-mouse-ignore", {
      enabled: isTypingSessionModeEnabled,
      reason,
    });
    logEvent("window", "Typing session mode updated", {
      enabled: isTypingSessionModeEnabled,
      reason,
    });
  } catch (error) {
    logEvent("window", "Typing session mode update failed", {
      enabled: isTypingSessionModeEnabled,
      reason,
      message: error?.message,
    });
  }
}

function toggleTypingSessionMode(reason) {
  updateTypingSessionMode(!isTypingSessionModeEnabled, reason);
}

function hideInvisibleWindow(reason) {
  if (invisibleWindow) {
    logEvent("window", "hide requested", {
      reason,
      visibleBefore: invisibleWindow.isVisible(),
    });
    invisibleWindow.hide();
  }
}

function recreateInvisibleWindow(reason) {
  const now = Date.now();
  if (now - lastRendererCrashAt < 1000) {
    logEvent("window", "Skip recreate due to crash loop guard", { reason });
    return;
  }
  lastRendererCrashAt = now;

  const previousWindow = invisibleWindow;
  const shouldShow = previousWindow?.isVisible?.() ?? true;
  logEvent("window", "Recreating invisible window", { reason, shouldShow });
  isRecoveringRendererWindow = true;

  try {
    createInvisibleWindow();
    if (shouldShow) {
      showInvisibleWindow(`recover:${reason}`);
    }
  } finally {
    try {
      if (
        previousWindow &&
        !previousWindow.isDestroyed() &&
        previousWindow !== invisibleWindow
      ) {
        previousWindow.destroy();
      }
    } catch (error) {
      logEvent("window", "Error while destroying crashed window", {
        message: error?.message,
      });
    } finally {
      setTimeout(() => {
        isRecoveringRendererWindow = false;
      }, 500);
    }
  }
}

function sendRendererEvent(channel, payload) {
  if (!invisibleWindow || invisibleWindow.isDestroyed()) {
    return;
  }
  invisibleWindow.webContents.send(channel, payload);
}

function dispatchRecordingToggle(channel, reason) {
  if (!invisibleWindow || invisibleWindow.isDestroyed()) {
    return;
  }
  if (!invisibleWindow.isVisible()) {
    showInvisibleWindow(reason);
  }
  sendRendererEvent(channel);
  setTimeout(() => {
    if (invisibleWindow && !invisibleWindow.isDestroyed() && !invisibleWindow.isVisible()) {
      showInvisibleWindow(`${reason}-auto-recover`);
    }
  }, 300);
}

function dispatchRecordingHold(phase, token, targets, reason) {
  if (!invisibleWindow || invisibleWindow.isDestroyed()) {
    return;
  }
  if (!invisibleWindow.isVisible()) {
    showInvisibleWindow(`${reason}:${phase}`);
  }
  sendRendererEvent(`recording-hold-${phase}`, {
    token,
    targets,
    reason,
    timestamp: Date.now(),
  });
}

function releaseRecordingHold(token, reason) {
  const state = recordingHoldStates.get(token);
  if (!state || !state.active) {
    return;
  }
  state.active = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  logEvent("recording", "Hold shortcut stop", {
    token,
    targets: state.targets,
    reason,
  });
  dispatchRecordingHold("stop", token, state.targets, reason);
}

function armHoldReleaseTimer(token) {
  const state = recordingHoldStates.get(token);
  if (!state) {
    return;
  }
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = setTimeout(() => {
    const latestState = recordingHoldStates.get(token);
    if (!latestState || !latestState.active) {
      return;
    }
    const idleMs = Date.now() - latestState.lastSeenAt;
    if (idleMs >= HOLD_SHORTCUT_RELEASE_IDLE_MS) {
      releaseRecordingHold(token, "idle-timeout");
      return;
    }
    armHoldReleaseTimer(token);
  }, HOLD_SHORTCUT_RELEASE_IDLE_MS);
}

function registerRecordingHoldShortcut({
  name,
  token,
  targets,
  primary,
  fallback,
}) {
  const triggerHold = () => {
    const state = recordingHoldStates.get(token);
    if (!state) {
      return;
    }
    state.lastSeenAt = Date.now();
    if (!state.active) {
      state.active = true;
      logEvent("recording", "Hold shortcut start", {
        name,
        token,
        targets,
      });
      dispatchRecordingHold("start", token, targets, `shortcut:${token}`);
    }
    armHoldReleaseTimer(token);
  };

  recordingHoldStates.set(token, {
    name,
    token,
    targets,
    active: false,
    lastSeenAt: 0,
    timer: null,
  });

  const primaryRegistered = globalShortcut.register(primary, triggerHold);
  if (primaryRegistered) {
    console.log(`[shortcuts] Registered hold shortcut: ${primary}`);
    return;
  }
  if (!fallback) {
    console.warn(`[shortcuts] Could not register hold shortcut ${primary}.`);
    return;
  }
  console.warn(
    `[shortcuts] Could not register ${primary}. Trying fallback ${fallback}.`
  );
  const fallbackRegistered = globalShortcut.register(fallback, triggerHold);
  if (!fallbackRegistered) {
    console.warn(
      `[shortcuts] Could not register fallback ${fallback}. ${name} hold shortcut is unavailable.`
    );
  } else {
    console.log(`[shortcuts] Registered hold shortcut: ${fallback}`);
  }
}

function releaseAllRecordingHolds(reason) {
  for (const token of recordingHoldStates.keys()) {
    releaseRecordingHold(token, reason);
  }
}

function configureDisplayMediaCapture() {
  try {
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
          });
          const selectedSource = sources[0];
          if (!selectedSource) {
            logEvent("recording", "No display media source available");
            callback({ video: null, audio: null });
            return;
          }

          const response = { video: selectedSource };
          if (process.platform === "win32") {
            response.audio = "loopback";
          }

          callback(response);
          logEvent("recording", "Display media source selected", {
            sourceId: selectedSource.id,
            sourceName: selectedSource.name,
            audio: response.audio || "none",
          });
        } catch (error) {
          logEvent("recording", "Display media selection failed", {
            message: error?.message,
            stack: error?.stack,
          });
          callback({ video: null, audio: null });
        }
      },
      {
        useSystemPicker: false,
      }
    );

    logEvent("recording", "Display media request handler configured", {
      platform: process.platform,
      useSystemPicker: false,
    });
  } catch (error) {
    logEvent("recording", "Failed to configure display media handler", {
      message: error?.message,
      stack: error?.stack,
    });
  }
}

// Create shared menu template
function createMenuTemplate() {
  return [
    {
      label: process.platform === "darwin" ? app.name : "File",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: process.platform === "darwin" ? "Preferences..." : "Settings...",
          accelerator: "CommandOrControl+,",
          click: () => createSettingsWindow(),
        },
        {
          label: "Open Runtime Log",
          click: () => {
            if (appLogFilePath) {
              logEvent("app", "Opening runtime log", { path: appLogFilePath });
              shell.openPath(appLogFilePath);
            }
          },
        },
        { type: "separator" },
        ...(process.platform === "darwin"
          ? [
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
            ]
          : []),
        { role: "quit" },
      ],
    },

    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Developer Tools",
          accelerator:
            process.platform === "darwin" ? "Alt+Command+J" : "F12",
          click: (_, window) => {
            if (window) {
              window.webContents.toggleDevTools();
            }
          },
        },
        {
          label: "Toggle Typing Session Mode",
          accelerator: "CommandOrControl+Alt+Shift+T",
          click: () => {
            toggleTypingSessionMode("menu:typing-session-mode");
          },
        },
      ],
    },
    {
      label: "Recording",
      submenu: [
        {
          label: "Test Start/Stop Recording Input",
          accelerator: "CmdOrCtrl+Alt+Shift+I",
          click: () => {
            logEvent("recording", "Menu toggle input requested");
            dispatchRecordingToggle("test-recording-input", "menu:recording-input");
          },
        },
        {
          label: "Test Start/Stop Recording Output",
          accelerator: "CmdOrCtrl+Alt+Shift+O",
          click: () => {
            logEvent("recording", "Menu toggle output requested");
            dispatchRecordingToggle("test-recording-output", "menu:recording-output");
          },
        },
        {
          label: "Test Start/Stop Recording Both",
          accelerator: "CmdOrCtrl+Alt+Shift+B",
          click: () => {
            logEvent("recording", "Menu toggle both requested");
            dispatchRecordingToggle("test-recording-both", "menu:recording-both");
          },
        },
      ],
    },
  ];
}

function createInvisibleWindow() {
  invisibleWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Set window type to utility on macOS
  if (process.platform === "darwin") {
    invisibleWindow.setAlwaysOnTop(true, "utility", 1);
    // Hide window buttons but keep functionality
    invisibleWindow.setWindowButtonVisibility(false);
  }

  // Set content protection to prevent screen capture
  invisibleWindow.setContentProtection(true);

  invisibleWindow.loadFile("index.html");

  invisibleWindow.webContents.on('did-finish-load', () => {
    logEvent("window", "did-finish-load", {
      url: invisibleWindow.webContents.getURL(),
    });
  });

  invisibleWindow.webContents.on("did-fail-load", (_, errorCode, errorDescription) => {
    logEvent("window", "did-fail-load", { errorCode, errorDescription });
  });

  invisibleWindow.webContents.on("render-process-gone", (_, details) => {
    logEvent("window", "render-process-gone", details);
    if (!app.isQuitting) {
      setTimeout(() => recreateInvisibleWindow("render-process-gone"), 150);
    }
  });

  invisibleWindow.webContents.on(
    "console-message",
    (_, level, message, line, sourceId) => {
      const important =
        level <= 2 ||
        /error|transcription|recording|hide|show|exception/i.test(message);
      if (important) {
        logEvent("renderer-console", message, { level, line, sourceId });
      }
    }
  );

  // DevTools can be toggled manually with shortcuts defined in createMenuTemplate




  // Prevent the window from being closed with mouse
  invisibleWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      hideInvisibleWindow("window:close-intercept");
    }
    return false;
  });

  invisibleWindow.on("show", () => {
    logEvent("window", "show event");
  });

  invisibleWindow.on("hide", () => {
    logEvent("window", "hide event");
  });

  invisibleWindow.on("focus", () => {
    logEvent("window", "focus event");
  });

  invisibleWindow.on("blur", () => {
    logEvent("window", "blur event");
  });

  // Set the menu for the invisible window
  const menu = Menu.buildFromTemplate(createMenuTemplate());
  Menu.setApplicationMenu(menu);
  updateTypingSessionMode(isTypingSessionModeEnabled, "window:init");

  // Show window initially
  showInvisibleWindow("startup");
}

function createSettingsWindow() {
  if (settingsWindow) {
    hideInvisibleWindow("settings:reopen");
    settingsWindow.show();
    return;
  }

  settingsWindow = new BrowserWindow({
    resizable: true,
    minimizable: true,
    maximizable: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  settingsWindow.loadFile("settings.html");

  // DevTools can be toggled manually


  settingsWindow.once("ready-to-show", () => {
    hideInvisibleWindow("settings:open");
    settingsWindow.show();
  });

  // Handle window close
  settingsWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      settingsWindow.hide();
      showInvisibleWindow("settings:close");
    }
    return false;
  });
}

// Register global shortcuts
function registerShortcuts() {
  // Screenshot shortcut (Command/Ctrl + Shift + S)
  globalShortcut.register("CommandOrControl+Shift+S", async () => {
    logEvent("shortcut", "Screenshot shortcut triggered");
    try {
      // Hide window before taking screenshot
      if (invisibleWindow && invisibleWindow.isVisible()) {
        hideInvisibleWindow("shortcut:screenshot");
      }

      // Wait for window to hide
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check permission and take screenshot
      const hasPermission = await ensureScreenRecordingPermission();
      if (!hasPermission) {
        console.log("Permission not granted. Skipping screenshot.");
        return;
      }

      const screenshotPath = await captureFullScreen(desktopCapturer, screen);
      if (screenshotPath) {
        console.log("Screenshot saved:", screenshotPath);
        // Notify renderer about successful capture
        if (invisibleWindow) {
          invisibleWindow.webContents.send("screenshot-captured", {
            filePath: screenshotPath,
            timestamp: Date.now(),
          });
        }
      }

      // Show window again after a brief delay
      setTimeout(() => {
        showInvisibleWindow("shortcut:screenshot-post-capture");
      }, 200);
    } catch (error) {
      console.error("Screenshot failed:", error);
      logEvent("shortcut", "Screenshot shortcut failed", {
        message: error?.message,
        stack: error?.stack,
      });
      showInvisibleWindow("shortcut:screenshot-error");
    }
  });

  // Toggle visibility shortcut (Command/Ctrl + Shift + H)
  const toggleVisibility = () => {
    logEvent("shortcut", "Visibility shortcut triggered", {
      currentlyVisible: invisibleWindow?.isVisible?.(),
    });
    if (invisibleWindow.isVisible()) {
      hideInvisibleWindow("shortcut:visibility-toggle");
    } else {
      showInvisibleWindow("shortcut:visibility-toggle");
    }
  };

  const visibilityPrimary = "CommandOrControl+Shift+H";
  const visibilityFallback = "CommandOrControl+Alt+Shift+H";
  const visibilityRegistered = globalShortcut.register(
    visibilityPrimary,
    toggleVisibility
  );
  if (!visibilityRegistered) {
    console.warn(
      `[shortcuts] Could not register ${visibilityPrimary}. Trying fallback ${visibilityFallback}.`
    );
    const visibilityFallbackRegistered = globalShortcut.register(
      visibilityFallback,
      toggleVisibility
    );
    if (!visibilityFallbackRegistered) {
      console.warn(
        `[shortcuts] Could not register fallback ${visibilityFallback}. Visibility shortcut is unavailable.`
      );
    } else {
      console.log(
        `[shortcuts] Registered visibility shortcut: ${visibilityFallback}`
      );
    }
  }

  // Test response shortcut (Command/Ctrl + Shift + T)
  globalShortcut.register("CommandOrControl+Shift+T", async () => {
    if (invisibleWindow) {
      try {
        await invisibleWindow.webContents.executeJavaScript(`
          window.electronAPI.testResponse("write python code to print 'Hello, world!'");
        `);
      } catch (error) {
        console.error("Failed to test response:", error);
      }
    }
  });

  globalShortcut.register("CommandOrControl+Alt+Shift+T", () => {
    logEvent("shortcut", "Typing session mode toggle requested", {
      enabledBefore: isTypingSessionModeEnabled,
    });
    toggleTypingSessionMode("shortcut:typing-session-mode");
  });

  // Recording shortcuts
  globalShortcut.register("CommandOrControl+Alt+Shift+I", () => {
    logEvent("recording", "Shortcut toggle input requested");
    dispatchRecordingToggle("test-recording-input", "shortcut:recording-input");
  });

  globalShortcut.register("CommandOrControl+Alt+Shift+O", () => {
    logEvent("recording", "Shortcut toggle output requested");
    dispatchRecordingToggle("test-recording-output", "shortcut:recording-output");
  });

  globalShortcut.register("CommandOrControl+Alt+Shift+B", () => {
    logEvent("recording", "Shortcut toggle both requested");
    dispatchRecordingToggle("test-recording-both", "shortcut:recording-both");
  });

  registerRecordingHoldShortcut({
    name: "Input",
    token: "shortcut-hold-input",
    targets: ["input"],
    primary: "CommandOrControl+Alt+I",
    fallback: "Alt+Shift+I",
  });
  registerRecordingHoldShortcut({
    name: "Output",
    token: "shortcut-hold-output",
    targets: ["output"],
    primary: "CommandOrControl+Alt+O",
    fallback: "Alt+Shift+O",
  });
  registerRecordingHoldShortcut({
    name: "Both",
    token: "shortcut-hold-both",
    targets: ["input", "output"],
    primary: "CommandOrControl+Alt+B",
    fallback: "Alt+Shift+B",
  });

  // Window movement shortcuts
  const NUDGE_AMOUNT = 50;
  const screenBounds = screen.getPrimaryDisplay().workAreaSize;

  // Nudge window with arrow keys
  globalShortcut.register("CommandOrControl+Left", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x - NUDGE_AMOUNT, y);
    }
  });

  globalShortcut.register("CommandOrControl+Right", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x + NUDGE_AMOUNT, y);
    }
  });

  globalShortcut.register("CommandOrControl+Up", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x, y - NUDGE_AMOUNT);
    }
  });

  globalShortcut.register("CommandOrControl+Down", () => {
    if (invisibleWindow) {
      const [x, y] = invisibleWindow.getPosition();
      invisibleWindow.setPosition(x, y + NUDGE_AMOUNT);
    }
  });

  // Snap window to screen edges
  globalShortcut.register("CommandOrControl+Shift+Left", () => {
    if (invisibleWindow) {
      invisibleWindow.setPosition(0, 0);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Right", () => {
    if (invisibleWindow) {
      const windowBounds = invisibleWindow.getBounds();
      invisibleWindow.setPosition(screenBounds.width - windowBounds.width, 0);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Up", () => {
    if (invisibleWindow) {
      invisibleWindow.setPosition(0, 0);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Down", () => {
    if (invisibleWindow) {
      const windowBounds = invisibleWindow.getBounds();
      invisibleWindow.setPosition(0, screenBounds.height - windowBounds.height);
    }
  });

  // Reset chat shortcut (Command/Ctrl + Shift + R)
  globalShortcut.register("CommandOrControl+Shift+R", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("reset-chat");
    }
  });

  globalShortcut.register("CommandOrControl+Alt+Shift+C", () => {
    invisibleWindow?.webContents.send("copy-last-ai-output");
  });
  globalShortcut.register("CommandOrControl+Alt+Shift+L", () => {
    invisibleWindow?.webContents.send("copy-chat-transcript");
  });

  globalShortcut.register("CommandOrControl+Alt+Shift+V", () => {
    const text = clipboard.readText().trim();
    logEvent("shortcut", "Clipboard prompt shortcut triggered", { length: text.length });
    showInvisibleWindow("shortcut:clipboard-prompt");
    invisibleWindow?.webContents.send("process-clipboard-text", {
      text,
    });
  });

  // Dark mode shortcut. Ctrl/Cmd + Shift + D may be taken by other apps,
  // so we register a fallback combination if the primary accelerator is unavailable.
  const toggleDarkMode = () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("toggle-dark-mode");
    }
  };

  const darkModePrimary = "CommandOrControl+Shift+D";
  const darkModeFallback = "CommandOrControl+Alt+Shift+D";
  const darkModeRegistered = globalShortcut.register(darkModePrimary, toggleDarkMode);
  if (!darkModeRegistered) {
    console.warn(
      `[shortcuts] Could not register ${darkModePrimary}. Trying fallback ${darkModeFallback}.`
    );
    const darkModeFallbackRegistered = globalShortcut.register(
      darkModeFallback,
      toggleDarkMode
    );
    if (!darkModeFallbackRegistered) {
      console.warn(
        `[shortcuts] Could not register fallback ${darkModeFallback}. Dark mode shortcut is unavailable.`
      );
    } else {
      console.log(`[shortcuts] Registered dark mode shortcut: ${darkModeFallback}`);
    }
  }

  const toggleHelp = () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("toggle-help");
      showInvisibleWindow("shortcut:help-toggle");
    }
  };

  const helpPrimary = "CommandOrControl+Shift+/";
  const helpFallback = "CommandOrControl+Alt+Shift+/";
  const helpRegistered = globalShortcut.register(helpPrimary, toggleHelp);
  if (!helpRegistered) {
    console.warn(
      `[shortcuts] Could not register ${helpPrimary}. Trying fallback ${helpFallback}.`
    );
    const helpFallbackRegistered = globalShortcut.register(helpFallback, toggleHelp);
    if (!helpFallbackRegistered) {
      console.warn(
        `[shortcuts] Could not register fallback ${helpFallback}. Help shortcut is unavailable.`
      );
    } else {
      console.log(`[shortcuts] Registered help shortcut: ${helpFallback}`);
    }
  }

  // Settings shortcut (Command/Ctrl + ,)
  globalShortcut.register("CommandOrControl+,", () => {
    createSettingsWindow();
  });


  // Chat scrolling shortcuts
  globalShortcut.register("Alt+Up", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("scroll-chat", "up");
    }
  });

  globalShortcut.register("Alt+Down", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("scroll-chat", "down");
    }
  });

  globalShortcut.register("Alt+Left", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("scroll-chat", "left");
    }
  });

  globalShortcut.register("Alt+Right", () => {
    if (invisibleWindow) {
      invisibleWindow.webContents.send("scroll-chat", "right");
    }
  });

  // For macOS, also register Option key combinations
  if (process.platform === "darwin") {
    globalShortcut.register("Option+Up", () => {
      if (invisibleWindow) {
        invisibleWindow.webContents.send("scroll-chat", "up");
      }
    });

    globalShortcut.register("Option+Down", () => {
      if (invisibleWindow) {
        invisibleWindow.webContents.send("scroll-chat", "down");
      }
    });

    globalShortcut.register("Option+Left", () => {
      if (invisibleWindow) {
        invisibleWindow.webContents.send("scroll-chat", "left");
      }
    });

    globalShortcut.register("Option+Right", () => {
      if (invisibleWindow) {
        invisibleWindow.webContents.send("scroll-chat", "right");
      }
    });
  }
}

// When app is ready
app.whenReady().then(async () => {
  initializeLogger();
  logEvent("app", "App ready", { argv: process.argv });

  // Load API key from config before initializing services
  const apiKey = config.getOpenAIKey();
  if (apiKey) {
    process.env.OPENAI_API_KEY = apiKey;
  }

  configureDisplayMediaCapture();
  createInvisibleWindow();
  registerShortcuts();
  await initializeLLMService();

  // Create tray icon for Windows
  if (process.platform === "win32") {
    tray = new Tray(path.join(__dirname, "../assets/OCTO.png"));
    const contextMenu = Menu.buildFromTemplate([
      { label: "Show", click: () => showInvisibleWindow("tray:show") },
      { label: "Hide", click: () => hideInvisibleWindow("tray:hide") },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]);
    tray.setToolTip("Open Interview Coder");
    tray.setContextMenu(contextMenu);
  }

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      logEvent("app", "activate with no windows; recreating invisible window");
      createInvisibleWindow();
    } else {
      showInvisibleWindow("app:activate");
    }
  });
});

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  if (isRecoveringRendererWindow) {
    logEvent("app", "window-all-closed ignored during renderer recovery");
    return;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Clean up on app quit
app.on("before-quit", () => {
  logEvent("app", "before-quit");
  app.isQuitting = true;
  releaseAllRecordingHolds("before-quit");
  globalShortcut.unregisterAll();
});
