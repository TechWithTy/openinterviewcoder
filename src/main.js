require("dotenv").config();
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  desktopCapturer,
  Menu,
  Tray,
} = require("electron");
const path = require("path");
const {
  ensureScreenRecordingPermission,
  captureFullScreen,
  getRecentScreenshots,
} = require("./screenshot");
const { initializeLLMService } = require("./llm-service");
const config = require("./config");

const isDev = process.argv.includes("--debug") || process.argv.includes("--inspect");


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

const hasDarkModeFlag = process.argv.includes("--dark-mode");
const hasTwoStepFlag = process.argv.includes("--two-step");
if (hasTwoStepFlag) {
  config.setTwoStep(true);
}

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
  }
});

// IPC handlers for settings
ipcMain.handle("get-settings", () => {
  return {
    openaiKey: config.getOpenAIKey(),
    prompt: config.getPrompt(),
    model: config.getModel(),
    twoStep: config.getTwoStep(),
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
  if (settings.twoStep !== undefined) {
    config.setTwoStep(settings.twoStep);
  }
  // Reinitialize LLM service with new API key
  await initializeLLMService();
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
    invisibleWindow.minimize();
  }
});

ipcMain.handle("hide-window", () => {
  if (invisibleWindow) {
    invisibleWindow.hide();
  }
});

let invisibleWindow;
let settingsWindow = null;
let tray = null;

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
            process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: (_, window) => {
            if (window) {
              window.webContents.toggleDevTools();
            }
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

  // Always ignore mouse events to prevent interaction with screen sharing
  invisibleWindow.setIgnoreMouseEvents(true);
  invisibleWindow.webContents.isIgnoringMouseEvents = true;

  invisibleWindow.loadFile("index.html");

  invisibleWindow.webContents.on('did-finish-load', () => {
    if (hasDarkModeFlag) {
      invisibleWindow.webContents.send("toggle-dark-mode");
    }
  });

  // DevTools can be toggled manually with shortcuts defined in createMenuTemplate




  // Prevent the window from being closed with mouse
  invisibleWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      invisibleWindow.hide();
    }
    return false;
  });

  // Set the menu for the invisible window
  const menu = Menu.buildFromTemplate(createMenuTemplate());
  Menu.setApplicationMenu(menu);

  // Show window initially
  invisibleWindow.showInactive();
}

function createSettingsWindow() {
  if (settingsWindow) {
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
      preload: path.join(__dirname, "preload.js"),
    },
  });

  settingsWindow.loadFile("settings.html");

  // DevTools can be toggled manually


  settingsWindow.once("ready-to-show", () => {
    settingsWindow.show();
  });

  // Handle window close
  settingsWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      settingsWindow.hide();
    }
    return false;
  });
}

// Register global shortcuts
function registerShortcuts() {
  // Screenshot shortcut (Command/Ctrl + Shift + S)
  globalShortcut.register("CommandOrControl+Shift+S", async () => {
    try {
      // Hide window before taking screenshot
      if (invisibleWindow && invisibleWindow.isVisible()) {
        invisibleWindow.hide();
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
        if (invisibleWindow) {
          invisibleWindow.showInactive();
        }
      }, 200);
    } catch (error) {
      console.error("Screenshot failed:", error);
      if (invisibleWindow) {
        invisibleWindow.showInactive();
      }
    }
  });

  // Toggle visibility shortcut (Command/Ctrl + Shift + H)
  globalShortcut.register("CommandOrControl+Shift+H", () => {
    if (invisibleWindow.isVisible()) {
      invisibleWindow.hide();
    } else {
      invisibleWindow.showInactive();
    }
  });

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
  }
}

// When app is ready
app.whenReady().then(async () => {
  // Load API key from config before initializing services
  const apiKey = config.getOpenAIKey();
  if (apiKey) {
    process.env.OPENAI_API_KEY = apiKey;
  }

  createInvisibleWindow();
  registerShortcuts();
  await initializeLLMService();

  // Create tray icon for Windows
  if (process.platform === "win32") {
    tray = new Tray(path.join(__dirname, "../assets/OCTO.png"));
    const contextMenu = Menu.buildFromTemplate([
      { label: "Show", click: () => invisibleWindow.show() },
      { label: "Hide", click: () => invisibleWindow.hide() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]);
    tray.setToolTip("Open Interview Coder");
    tray.setContextMenu(contextMenu);
  }

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createInvisibleWindow();
    }
  });
});

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Clean up on app quit
app.on("before-quit", () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
});
