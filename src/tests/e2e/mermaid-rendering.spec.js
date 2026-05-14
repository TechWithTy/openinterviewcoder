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

test.describe("Mermaid graph rendering", () => {
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

  test("renders Mermaid SVG from AI response", async () => {
    // We send a mock AI response containing a mermaid block
    // We expect the renderer to parse it, bypass the "renderAssistantHtml" setting,
    // and successfully initialize the mermaid SVG diagram in the DOM.
    const mockContent = \`
Here is your architecture diagram:

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`
\`;

    await window.evaluate((content) => {
      if (!window.__rendererTestHooks?.updateMessage) {
        throw new Error("updateMessage hook is unavailable");
      }
      // Ensure the test framework allows marked parsing by removing the mock if present
      if (window.marked && typeof window.marked.parse === "function" && window.marked.parse.toString().includes("String(value")) {
        delete window.marked; 
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
});
