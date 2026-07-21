const path = require("path");
const { _electron: electron, test, expect } = require("@playwright/test");

const APP_ROOT = path.resolve(__dirname, "../../../");
const TEST_USER_DATA_DIR = path.join(APP_ROOT, "test-results", "electron-user-data-mermaid");
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
    args: [
      "--disable-gpu",
      "--disable-gpu-sandbox",
      `--user-data-dir=${TEST_USER_DATA_DIR}`,
      APP_ROOT,
    ],
    env: {
      ...process.env,
      E2E_DISABLE_HARDWARE_ACCELERATION: "1",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-e2e-placeholder-key",
    },
  });
  const window = await electronApp.firstWindow();
  await window.waitForSelector("#chat-history");
  await window.waitForFunction(() => Boolean(window.electronAPI));
  await window.waitForFunction(() => Boolean(window.__rendererTestHooks));
  return { electronApp, window };
}

test.describe("Mermaid graph rendering", () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    const launched = await launchApp();
    electronApp = launched.electronApp;
    window = launched.window;
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test("renders Mermaid SVG from AI response", async () => {
    // We send a mock AI response containing a mermaid block
    // We expect the renderer to parse it, bypass the "renderAssistantHtml" setting,
    // and successfully initialize the mermaid SVG diagram in the DOM.
    const mockContent = [
      "Here is your architecture diagram:",
      "",
      "```mermaid",
      "graph TD",
      "    A[Start] --> B[End]",
      "```",
    ].join("\n");

    await window.evaluate((content) => {
      if (!window.__rendererTestHooks?.updateMessage) {
        throw new Error("updateMessage hook is unavailable");
      }
      window.__rendererTestHooks.updateMessage({
        messageId: "stream-mermaid-1",
        content: content,
        isComplete: true,
      });
    }, mockContent);

    // Verify the message element appears
    const messageLocator = window.locator('[data-message-id="stream-mermaid-1"]');
    await expect(messageLocator).toBeVisible();

    // Verify that the markdown parser ran (it shouldn't be raw code)
    await expect(messageLocator.locator(".message-content")).not.toHaveClass(/raw-code/);

    // Verify the mermaid SVG is ultimately injected
    // Mermaid uses 'svg' inside the 'div.mermaid' container
    const svgLocator = messageLocator.locator("div.mermaid svg");
    
    // We increase timeout slightly because mermaid.init() can take a tiny fraction of a second to compute bounding boxes
    await expect(svgLocator).toBeVisible({ timeout: 5000 });
  });

  test("preserves access to wide assistant output instead of clipping it", async () => {
    const mockContent = `const wide = "${"x".repeat(600)}";`;

    await window.evaluate((content) => {
      if (!window.__rendererTestHooks?.updateMessage) {
        throw new Error("updateMessage hook is unavailable");
      }
      window.__rendererTestHooks.updateMessage({
        messageId: "stream-wide-1",
        content,
        isComplete: true,
      });
    }, mockContent);

    const contentMetrics = await window.locator('[data-message-id="stream-wide-1"] .message-content').evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      overflowX: window.getComputedStyle(node).overflowX,
      isRawCode: node.classList.contains("raw-code"),
    }));

    expect(contentMetrics.isRawCode).toBe(true);
    expect(contentMetrics.overflowX).toBe("auto");
    expect(contentMetrics.scrollWidth).toBeGreaterThan(contentMetrics.clientWidth);
  });
});
