// Settings management
document.addEventListener("DOMContentLoaded", async () => {
  const openaiKeyInput = document.getElementById("openaiKey");
  const promptInput = document.getElementById("analysisPrompt");
  const modelSelect = document.getElementById("modelSelect");
  const saveButton = document.getElementById("saveButton");
  const predefinedPromptsSelect = document.getElementById("predefinedPrompts");
  const previewSelectedTemplateButton = document.getElementById(
    "previewSelectedTemplateButton"
  );
  const previewDebugTemplateButton = document.getElementById(
    "previewDebugTemplateButton"
  );
  const twoStepCheck = document.getElementById("twoStepCheck");
  const renderAssistantHtmlCheck = document.getElementById("renderAssistantHtmlCheck");

  const autoDetectInputCheck = document.getElementById("autoDetectInputCheck");
  const inputDeviceContainer = document.getElementById("inputDeviceContainer");
  const inputDeviceSelect = document.getElementById("inputDeviceSelect");

  const autoDetectOutputCheck = document.getElementById("autoDetectOutputCheck");
  const outputDeviceContainer = document.getElementById("outputDeviceContainer");
  const outputDeviceSelect = document.getElementById("outputDeviceSelect");
  const transcriptionPauseMsInput = document.getElementById("transcriptionPauseMs");

  // Verify all elements exist
  if (
    !openaiKeyInput ||
    !saveButton ||
    !promptInput ||
    !predefinedPromptsSelect ||
    !previewSelectedTemplateButton ||
    !previewDebugTemplateButton ||
    !modelSelect ||
    !twoStepCheck ||
    !renderAssistantHtmlCheck ||
    !autoDetectInputCheck ||
    !inputDeviceSelect ||
    !transcriptionPauseMsInput
  ) {
    console.error("Required DOM elements not found");
    return;
  }

  // Load devices list
  async function loadDevices() {
    try {
      // Prompt for permission if needed
      await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(err => {
        console.warn("Could not get initial permission for device enumeration", err);
      });
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audioInputs = devices.filter(d => d.kind === "audioinput");
      inputDeviceSelect.innerHTML = "";
      audioInputs.forEach(device => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Microphone ${inputDeviceSelect.length + 1}`;
        inputDeviceSelect.appendChild(option);
      });

      const audioOutputs = devices.filter(d => d.kind === "audiooutput");
      outputDeviceSelect.innerHTML = "";
      audioOutputs.forEach(device => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Speaker ${outputDeviceSelect.length + 1}`;
        outputDeviceSelect.appendChild(option);
      });

    } catch (err) {
      console.error("Error loading devices:", err);
    }
  }

  await loadDevices();

  // Toggle dropdown visibility based on auto-detect
  function toggleDeviceSelectors() {
    inputDeviceContainer.style.display = autoDetectInputCheck.checked ? 'none' : 'flex';
    outputDeviceContainer.style.display = autoDetectOutputCheck.checked ? 'none' : 'flex';
  }

  autoDetectInputCheck.addEventListener('change', toggleDeviceSelectors);
  autoDetectOutputCheck.addEventListener('change', toggleDeviceSelectors);

  // Predefined prompt templates
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
    "debug": "Analyze the code in this screenshot and identify any existing bugs, security vulnerabilities, or performance issues. Propose a fixed version of the code with explanations."
  };

  const EXAMPLE_OUTPUTS = {
    default: {
      prompt: "Summarize the screenshot and call out the highest-signal implementation risks.",
      content: `Problem summary
- Candidate is reviewing a React list rendering bug and a failing empty state.

Key observations
- The list items use array index keys.
- The filter logic runs twice with duplicate state.
- The empty state flashes because loading and data-ready are conflated.

Suggested fix
- Use stable item ids as React keys.
- Derive filtered results during render from source data + query.
- Split loading, loaded, and empty states.

Risk to watch
- If the API can return duplicate ids, normalize before rendering.`,
    },
    hackerrank: {
      prompt: "Solve this coding challenge in Python and return the final answer.",
      content: `Core problem
- Compute the first non-repeating character index in a string.

Optimal approach
- Count character frequency, then scan once more to find the first index with frequency 1.

\`\`\`python
from collections import Counter

def firstUniqChar(s):
    counts = Counter(s)
    for index, ch in enumerate(s):
        if counts[ch] == 1:
            return index
    return -1
\`\`\`

Time: O(n)
Space: O(1) for bounded alphabet / O(n) in general`,
    },
    "hackerrank-general": {
      prompt: "Read the editor language and produce a full submission-ready answer.",
      content: `Core problem
- Detect the dominant language from the editor and return a full submission-ready answer.

\`\`\`javascript
function longestStreak(nums) {
  if (!nums.length) return 0;
  let best = 1;
  let current = 1;

  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i] === nums[i - 1] + 1) current += 1;
    else current = 1;
    if (current > best) best = current;
  }

  return best;
}
\`\`\`

Time: O(n)
Space: O(1)`,
    },
    "hackerrank-frontend": {
      prompt: "Return the complete frontend solution for this UI problem.",
      content: `Approach
- Use a controlled input, derived filtered state, and accessible button labels.

\`\`\`jsx
export default function SearchableList({ items }) {
  const [query, setQuery] = useState("");
  const filteredItems = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <section>
      <label htmlFor="search">Search</label>
      <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>
        {filteredItems.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
    </section>
  );
}
\`\`\`

Notes
- Keeps first paint deterministic.
- Uses stable ids instead of array index keys.`,
    },
    "hackerrank-frontend-v2": {
      prompt: "Return the full copy-pasteable React solution, not just the fix.",
      content: `\`\`\`jsx
export default function Articles({ articles }) {
  const visibleArticles = articles.filter((article) => article.points > 0);

  return (
    <main>
      {visibleArticles.length === 0 ? (
        <p>No scored articles available.</p>
      ) : (
        <ul>
          {visibleArticles.map((article) => (
            <li key={article.id}>{article.title}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
\`\`\`

Why this works
- Returns the full copy-pasteable component.
- Derives visible output synchronously during render.`,
    },
    "hackerrank-frontend-v3": {
      prompt: "Use all visible panes and return a submission-ready multi-file answer.",
      content: `// File: src/App.jsx
\`\`\`jsx
import ResultsList from "./ResultsList";

export default function App({ users }) {
  const sortedUsers = [...users].sort((a, b) => b.score - a.score);
  return <ResultsList users={sortedUsers} />;
}
\`\`\`

// File: src/ResultsList.jsx
\`\`\`jsx
export default function ResultsList({ users }) {
  return (
    <ul aria-label="Ranked users">
      {users.map((user) => (
        <li key={user.id}>{user.name}: {user.score}</li>
      ))}
    </ul>
  );
}
\`\`\`

Verification
- Preserves visible file boundaries.
- Uses stable keys.
- Avoids useEffect for initial render.`,
    },
    "hackerrank-frontend-v4": {
      prompt: "Inspect every visible code tab and return the corrected final code first.",
      content: `// File: src/App.tsx
\`\`\`tsx
import { useState } from "react";
import TaskList from "./TaskList";

export default function App({ initialTasks }) {
  const [tasks, setTasks] = useState(initialTasks);

  function toggleTask(taskId) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, done: !task.done } : task
      )
    );
  }

  return <TaskList tasks={tasks} onToggleTask={toggleTask} />;
}
\`\`\`

Verification
- Updated files: src/App.tsx
- Initial UI is derived synchronously from props.
- Preserves event handler signatures and stable ids.

Wide-line preview
\`\`\`tsx
const debugSnapshot = "task-001:queued|task-002:done|task-003:queued|task-004:queued|task-005:done|task-006:queued|task-007:done|task-008:queued|task-009:done|task-010:queued|task-011:queued|task-012:done|task-013:queued|task-014:done|task-015:queued|task-016:done|task-017:queued|task-018:queued|task-019:done|task-020:queued";
\`\`\``,
    },
    debug: {
      prompt: "Review this code and list the most important bugs or regressions first.",
      content: `Findings
1. ` + `src/hooks/useSearch.js:18` + ` recreates a debounced callback on every render, so pending calls are lost.
2. ` + `src/App.jsx:42` + ` mutates the original array before sorting, which can break memoized parents.
3. ` + `src/api/client.js:9` + ` logs bearer tokens to the console in development.

Fixed version
\`\`\`js
const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));
const requestAuditTrail = "GET:/api/search?q=react-hooks-debounce-and-cancellation&page=1&sort=updated_at_desc&include=owner,labels,review_state,latest_commit,status_checks,review_threads,ci_annotations,artifact_urls,dependency_graph_summary,security_findings";
\`\`\`

Residual risk
- Search requests still need cancellation if the API is slow.`
    }
  };

  async function previewTemplateExample(templateKey) {
    const example = EXAMPLE_OUTPUTS[templateKey];
    if (!example) {
      alert("No example output is available for the current selection yet.");
      return;
    }

    await window.electronAPI.previewExampleOutput({
      templateKey,
      prompt: example.prompt,
      content: example.content,
    });
  }

  // Handle template selection
  predefinedPromptsSelect.addEventListener("change", (e) => {
    const selected = e.target.value;
    if (selected !== "custom" && PREDEFINED_PROMPTS[selected]) {
      promptInput.value = PREDEFINED_PROMPTS[selected];
    }
  });

  // Switch dropdown to 'custom' if user edits the prompt manually
  promptInput.addEventListener("input", () => {
    const currentVal = promptInput.value;
    let isPredefined = false;
    for (const [key, value] of Object.entries(PREDEFINED_PROMPTS)) {
      if (currentVal === value) {
        predefinedPromptsSelect.value = key;
        isPredefined = true;
        break;
      }
    }
    if (!isPredefined) {
      predefinedPromptsSelect.value = "custom";
    }
  });

  previewSelectedTemplateButton.addEventListener("click", async () => {
    const selected = predefinedPromptsSelect.value;
    if (selected === "custom") {
      alert("Select a predefined template first, or add a custom preview mapping in code.");
      return;
    }
    await previewTemplateExample(selected);
  });

  previewDebugTemplateButton.addEventListener("click", async () => {
    predefinedPromptsSelect.value = "debug";
    promptInput.value = PREDEFINED_PROMPTS.debug;
    await previewTemplateExample("debug");
  });

  // Load current settings
  try {
    const settings = await window.electronAPI.getSettings();

    // Apply settings to form elements
    if (settings && settings.openaiKey) {
      openaiKeyInput.value = settings.openaiKey;
    }
    if (settings && settings.prompt) {
      promptInput.value = settings.prompt;
      for (const [key, value] of Object.entries(PREDEFINED_PROMPTS)) {
        if (settings.prompt === value) {
          predefinedPromptsSelect.value = key;
          break;
        }
      }
    }
    if (settings && settings.model) {
      modelSelect.value = settings.model;
    }
    if (settings && settings.twoStep !== undefined) {
      twoStepCheck.checked = settings.twoStep;
    }
    if (settings && settings.renderAssistantHtml !== undefined) {
      renderAssistantHtmlCheck.checked = settings.renderAssistantHtml;
    }
    if (settings && settings.autoDetectInput !== undefined) {
      autoDetectInputCheck.checked = settings.autoDetectInput;
    }
    if (settings && settings.autoDetectOutput !== undefined) {
      autoDetectOutputCheck.checked = settings.autoDetectOutput;
    }
    if (settings && settings.inputDeviceId) {
      inputDeviceSelect.value = settings.inputDeviceId;
    }
    if (settings && settings.outputDeviceId) {
      outputDeviceSelect.value = settings.outputDeviceId;
    }
    transcriptionPauseMsInput.value = String(settings?.transcriptionPauseMs ?? 2500);
    if (settings && settings.azureSpeechKey) {
      document.getElementById("azureSpeechKey").value = settings.azureSpeechKey;
    }
    if (settings && settings.azureSpeechRegion) {
      document.getElementById("azureSpeechRegion").value = settings.azureSpeechRegion;
    }

    // Refresh UI state
    toggleDeviceSelectors();
  } catch (error) {
    console.error("Error loading settings:", error);
  }

  // Handle save button click
  saveButton.addEventListener("click", async () => {
    const pauseMsRaw = Number(transcriptionPauseMsInput.value);
    const transcriptionPauseMs = Number.isFinite(pauseMsRaw)
      ? Math.min(60000, Math.max(1000, Math.round(pauseMsRaw)))
      : 2500;

    const settings = {
      openaiKey: openaiKeyInput.value.trim(),
      prompt: promptInput.value.trim(),
      model: modelSelect.value,
      twoStep: twoStepCheck.checked,
      renderAssistantHtml: renderAssistantHtmlCheck.checked,
      autoDetectInput: autoDetectInputCheck.checked,
      autoDetectOutput: autoDetectOutputCheck.checked,
      transcriptionPauseMs,
      inputDeviceId: inputDeviceSelect.value,
      outputDeviceId: outputDeviceSelect.value,
      azureSpeechKey: document.getElementById("azureSpeechKey").value.trim(),
      azureSpeechRegion: document.getElementById("azureSpeechRegion").value.trim(),
    };

    try {
      await window.electronAPI.saveSettings(settings);
      // Show success message
      saveButton.textContent = "Saved!";
      setTimeout(() => {
        saveButton.textContent = "Save";
      }, 2000);
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings. Please try again.");
    }
  });
});
