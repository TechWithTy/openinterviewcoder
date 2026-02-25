const axios = require("axios");
const { ipcMain } = require("electron");
const fs = require("fs");
const config = require("./config");

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

function mimeTypeToFilename(mimeType) {
  if (!mimeType) return "chunk.webm";
  if (mimeType.includes("ogg")) return "chunk.ogg";
  if (mimeType.includes("wav")) return "chunk.wav";
  if (mimeType.includes("mp4")) return "chunk.mp4";
  return "chunk.webm";
}

async function transcribeAudioChunk({ audioBase64, mimeType, type }) {
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
        return await makeLLMRequest(event, { 
          prompt: `The following is transcribed speech: "${text}". Please summarize it or answer any questions if relevant.`
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
  const prompt = data.prompt || config.getPrompt();
  let selectedModel = config.getModel() || "gpt-4o-mini";
  let isOModel = selectedModel.startsWith("o1") || selectedModel.startsWith("o3");
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

  if (base64Image && useTwoStep) {
    // 1. Two-Step Pipeline: Extraction using a vision model.
    try {
      const extractResponse = await axios({
        method: "post",
        url: "https://api.openai.com/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        data: {
          model: "gpt-4o-mini", // fast, cheap vision
          messages: [
            {
              role: "system",
              content: "You are a specialized OCR and layout extraction assistant. Extract all text and code from this image as accurately as possible, preserving the formatting.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Please extract all text and code." },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 2000,
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

  const finalPrompt = prompt + extractedTextContext;

  if (isOModel) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: SYSTEM_PROMPT + "\n\n" + finalPrompt }
      ]
    });
  } else {
    messages.push({
      role: "system",
      content: SYSTEM_PROMPT
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
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ];
    }
  }

  const requestData = {
    model: selectedModel,
    messages: messages,
  };

  if (isOModel) {
    requestData.max_completion_tokens = 4000;
  } else {
    requestData.max_tokens = 1000;
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

    const content = response.data.choices[0].message.content;
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
};

