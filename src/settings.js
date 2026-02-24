// Settings management
document.addEventListener("DOMContentLoaded", async () => {
  // Get all form elements
  const openaiKeyInput = document.getElementById("openaiKey");
  const promptInput = document.getElementById("analysisPrompt");
  const modelSelect = document.getElementById("modelSelect");
  const saveButton = document.getElementById("saveButton");
  const predefinedPromptsSelect = document.getElementById("predefinedPrompts");

  // Verify all elements exist
  if (!openaiKeyInput || !saveButton || !promptInput || !predefinedPromptsSelect || !modelSelect) {
    console.error("Required DOM elements not found");
    return;
  }

  // Predefined prompt templates
  const PREDEFINED_PROMPTS = {
    "default": "Analyze this screenshot and provide insights.",
    "hackerrank": `<poml version="3.0">
  <role>Expert SWE</role>
  <task>
    Analyze the coding interview problem (typically on the left side of the screenshot). Produce a production-grade, optimal solution in Python.
    <steps>
      <step>State the core problem and constraints.</step>
      <step>Determine the optimal algorithm (optimize for Big-O time/space complexity).</step>
      <step>Write clean, robust, and commented code in Python to solve it.</step>
      <step>Explicitly state the Time and Space Complexity (Big-O).</step>
      <step>Suggest potential follow-up questions and briefly answer them.</step>
    </steps>
  </task>
</poml>`,
    "debug": "Analyze the code in this screenshot and identify any existing bugs, security vulnerabilities, or performance issues. Propose a fixed version of the code with explanations."
  };

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

  // Load current settings
  try {
    const settings = await window.electronAPI.getSettings();

    // Apply settings to form elements
    if (settings && settings.openaiKey) {
      openaiKeyInput.value = settings.openaiKey;
    }
    if (settings && settings.prompt) {
      promptInput.value = settings.prompt;
    }
    if (settings && settings.model) {
      modelSelect.value = settings.model;
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }

  // Handle save button click
  saveButton.addEventListener("click", async () => {
    const settings = {
      openaiKey: openaiKeyInput.value.trim(),
      prompt: promptInput.value.trim(),
      model: modelSelect.value,
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
