// Settings management
document.addEventListener("DOMContentLoaded", async () => {
  const openaiKeyInput = document.getElementById("openaiKey");
  const promptInput = document.getElementById("analysisPrompt");
  const modelSelect = document.getElementById("modelSelect");
  const saveButton = document.getElementById("saveButton");
  const predefinedPromptsSelect = document.getElementById("predefinedPrompts");
  const twoStepCheck = document.getElementById("twoStepCheck");

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
    !modelSelect ||
    !twoStepCheck ||
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
    if (settings && settings.twoStep !== undefined) {
      twoStepCheck.checked = settings.twoStep;
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
