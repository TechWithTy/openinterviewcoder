const path = require("path");
const { _electron: electron, test, expect } = require("@playwright/test");

const APP_ROOT = path.resolve(__dirname, "../../../");
const ELECTRON_BINARY = path.join(
  APP_ROOT,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron"
);

async function launchApp() {
  const electronApp = await electron.launch({
    executablePath: ELECTRON_BINARY,
    args: [APP_ROOT],
    env: {
      ...process.env,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-e2e-placeholder-key",
    },
  });
  const window = await electronApp.firstWindow();
  await window.waitForSelector("#chat-history");
  await window.waitForFunction(() => Boolean(window.electronAPI));
  await window.waitForFunction(() => Boolean(window.__rendererTestHooks));
  return { electronApp, window };
}

async function installRendererMocks(window, options = {}) {
  await window.evaluate((opts) => {
    if (!window.marked || typeof window.marked.parse !== "function") {
      window.marked = {
        parse: (value) => String(value ?? ""),
      };
    }

    const defaultSettings = {
      autoDetectInput: true,
      autoDetectOutput: true,
      transcriptionPauseMs: 1000,
      inputDeviceId: "default",
      outputDeviceId: "default",
    };

    const state = {
      startCalls: [],
      stopCalls: [],
      processCalls: [],
      showWindowCalls: 0,
      callbacks: {
        input: null,
        output: null,
      },
    };

    window.__e2eState = state;

    window.__pushTranscript = (type, text) => {
      const cb = state.callbacks[type];
      if (!cb) {
        return false;
      }
      cb(text, true, type);
      return true;
    };

    window.__rendererTestHooks.setElectronAPIMock({
      debugLog: async () => true,
      getSettings: async () => ({
        ...defaultSettings,
        ...(opts.settings || {}),
      }),
      showWindow: async () => {
        state.showWindowCalls += 1;
        return true;
      },
      processTranscription: async (text) => {
        state.processCalls.push(text);
        return { success: true };
      },
      stopTranscription: (type) => {
        state.stopCalls.push(type);
        return true;
      },
      startTranscription: async (constraints, config, type, callback) => {
        state.startCalls.push({ constraints, config, type });
        state.callbacks[type] = callback;

        if (opts.failStartForType && opts.failStartForType === type) {
          throw new Error(opts.failMessage || `Mocked ${type} start failure`);
        }

        const seededChunks = (opts.seededChunksByType || {})[type] || [];
        for (const chunk of seededChunks) {
          callback(chunk, true, type);
        }

        return true;
      },
      hideWindow: () => true,
    });
  }, options);
}

async function getRendererMockState(window) {
  return window.evaluate(() => ({
    startCalls: window.__e2eState.startCalls,
    stopCalls: window.__e2eState.stopCalls,
    processCalls: window.__e2eState.processCalls,
    showWindowCalls: window.__e2eState.showWindowCalls,
  }));
}

test.describe("Electron transcription flow", () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    const launched = await launchApp();
    electronApp = launched.electronApp;
    window = launched.window;
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test("renders the primary UI shell", async () => {
    await expect(window).toHaveTitle("Invisible Assistant");
    await expect(window.locator(".chat-container")).toBeVisible();
    await expect(window.locator("#chat-history")).toBeVisible();
  });

  test("handles input start, realtime transcript, pause batching, and stop", async () => {
    await installRendererMocks(window, {
      settings: { transcriptionPauseMs: 1000 },
    });

    await window.evaluate(async () => {
      if (!window.__rendererTestHooks?.toggleInputRecording) {
        throw new Error("toggleInputRecording hook is unavailable");
      }
      await window.__rendererTestHooks.toggleInputRecording();
    });

    await expect(
      window.locator(".message.assistant").filter({
        hasText: "Started transcription for input. Use menu again to stop.",
      })
    ).toBeVisible();

    const pushed = await window.evaluate(() => {
      const first = window.__pushTranscript("input", "hello");
      const second = window.__pushTranscript("input", "world");
      return first && second;
    });
    expect(pushed).toBeTruthy();

    await expect(
      window.locator(".message.assistant.transcription").filter({
        hasText: "[Input]:",
      })
    ).toContainText("hello world");

    await expect
      .poll(async () => (await getRendererMockState(window)).processCalls.length)
      .toBe(1);

    const stateAfterPause = await getRendererMockState(window);
    expect(stateAfterPause.processCalls[0]).toContain("Source: Input, Text: hello");
    expect(stateAfterPause.processCalls[0]).toContain("world");

    await window.evaluate(async () => {
      await window.__rendererTestHooks.toggleInputRecording();
    });

    await expect(
      window.locator(".message.assistant").filter({
        hasText: "Stopped transcription for input.",
      })
    ).toBeVisible();

    const finalState = await getRendererMockState(window);
    expect(finalState.stopCalls).toContain("input");
    expect(finalState.startCalls.some((call) => call.type === "input")).toBeTruthy();
  });

  test("handles output start, transcript streaming, batching, and stop", async () => {
    await installRendererMocks(window, {
      settings: { transcriptionPauseMs: 1000 },
    });

    await window.evaluate(async () => {
      if (!window.__rendererTestHooks?.toggleOutputRecording) {
        throw new Error("toggleOutputRecording hook is unavailable");
      }
      await window.__rendererTestHooks.toggleOutputRecording();
    });

    await expect(
      window.locator(".message.assistant").filter({
        hasText: "Started transcription for output. Use menu again to stop.",
      })
    ).toBeVisible();

    const pushed = await window.evaluate(() =>
      window.__pushTranscript("output", "candidate speaking now")
    );
    expect(pushed).toBeTruthy();

    await expect(
      window.locator(".message.assistant.transcription").filter({
        hasText: "[Output]:",
      })
    ).toContainText("candidate speaking now");

    await expect
      .poll(async () => (await getRendererMockState(window)).processCalls.length)
      .toBe(1);

    const stateAfterPause = await getRendererMockState(window);
    const outputStartCall = stateAfterPause.startCalls.find(
      (call) => call.type === "output"
    );
    expect(outputStartCall).toBeTruthy();
    expect(outputStartCall.config.outputCaptureMode).toBe("system");
    expect(stateAfterPause.processCalls[0]).toContain("Source: Output");

    await window.evaluate(async () => {
      await window.__rendererTestHooks.toggleOutputRecording();
    });
    await expect(
      window.locator(".message.assistant").filter({
        hasText: "Stopped transcription for output.",
      })
    ).toBeVisible();
  });

  test("supports toggling input and output together", async () => {
    await installRendererMocks(window, {
      settings: { transcriptionPauseMs: 1000 },
    });

    await window.evaluate(async () => {
      if (!window.__rendererTestHooks?.toggleBothRecordings) {
        throw new Error("toggleBothRecordings hook is unavailable");
      }
      await window.__rendererTestHooks.toggleBothRecordings();
    });

    const stateAfterStart = await getRendererMockState(window);
    const startedTypes = stateAfterStart.startCalls.map((call) => call.type);
    expect(startedTypes).toContain("input");
    expect(startedTypes).toContain("output");

    await window.evaluate(async () => {
      await window.__rendererTestHooks.toggleBothRecordings();
    });

    const stateAfterStop = await getRendererMockState(window);
    expect(stateAfterStop.stopCalls).toContain("input");
    expect(stateAfterStop.stopCalls).toContain("output");
  });

  test("keeps manual toggles working while hold start/stop is used", async () => {
    await installRendererMocks(window, {
      settings: { transcriptionPauseMs: 1000 },
    });

    await window.evaluate(async () => {
      await window.__rendererTestHooks.toggleInputRecording();
    });

    await window.evaluate(async () => {
      if (!window.__rendererTestHooks?.handleRecordingHoldStart) {
        throw new Error("handleRecordingHoldStart hook is unavailable");
      }
      await window.__rendererTestHooks.handleRecordingHoldStart({
        token: "hold-both",
        targets: ["input", "output"],
      });
    });

    const stateDuringHold = await getRendererMockState(window);
    const startedTypes = stateDuringHold.startCalls.map((call) => call.type);
    expect(startedTypes).toContain("input");
    expect(startedTypes).toContain("output");

    await window.evaluate(async () => {
      await window.__rendererTestHooks.handleRecordingHoldStop({
        token: "hold-both",
        targets: ["input", "output"],
      });
    });

    await expect
      .poll(async () => (await getRendererMockState(window)).stopCalls.includes("output"))
      .toBeTruthy();

    const stopStateAfterHold = await getRendererMockState(window);
    expect(stopStateAfterHold.stopCalls).not.toContain("input");

    await window.evaluate(async () => {
      await window.__rendererTestHooks.toggleInputRecording();
    });

    await expect
      .poll(async () => (await getRendererMockState(window)).stopCalls.includes("input"))
      .toBeTruthy();
  });

  test("shows a clear UI error when output transcription start fails", async () => {
    await installRendererMocks(window, {
      failStartForType: "output",
      failMessage: "System capture denied by OS",
    });

    await window.evaluate(async () => {
      if (!window.__rendererTestHooks?.toggleOutputRecording) {
        throw new Error("toggleOutputRecording hook is unavailable");
      }
      await window.__rendererTestHooks.toggleOutputRecording();
    });

    await expect(window.locator(".message.error")).toContainText(
      "Failed to start output transcription: System capture denied by OS"
    );
  });

  test("renders streamed assistant responses from stream-update events", async () => {
    await window.evaluate(() => {
      if (!window.__rendererTestHooks?.updateMessage) {
        throw new Error("updateMessage hook is unavailable");
      }
      window.__rendererTestHooks.updateMessage({
        messageId: "stream-1",
        content: "partial response",
        isComplete: false,
      });
    });

    await expect(window.locator('[data-message-id="stream-1"]')).toContainText(
      "partial response"
    );
    await expect(window.locator("#typing-indicator")).toHaveClass(/visible/);

    await window.evaluate(() => {
      window.__rendererTestHooks.updateMessage({
        messageId: "stream-1",
        content: "partial response complete",
        isComplete: true,
      });
    });

    await expect(window.locator('[data-message-id="stream-1"]')).toContainText(
      "partial response complete"
    );
    await expect(window.locator("#typing-indicator")).not.toHaveClass(/visible/);
  });
});
