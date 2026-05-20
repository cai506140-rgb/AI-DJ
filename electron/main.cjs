const path = require("node:path");
const { app, BrowserWindow, Menu, shell } = require("electron");
const { startLocalServer } = require("./local-server.cjs");

const APP_URL = process.env.AI_DJ_DESKTOP_URL || "http://127.0.0.1:5173/";
const HEALTH_URL = process.env.AI_DJ_HEALTH_URL || "http://127.0.0.1:8787/api/state";
const EMBEDDED_URL = "http://127.0.0.1:8787/";

let mainWindow;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const embedded = app.isPackaged || process.env.AI_DJ_DESKTOP_EMBEDDED === "1";
  let targetUrl = APP_URL;
  let healthUrl = HEALTH_URL;
  if (embedded) {
    const localServer = await startLocalServer({
      port: 8787,
      staticDir: path.join(__dirname, "..", "dist"),
      tracksPath: path.join(__dirname, "..", "server", "data", "tracks.json")
    });
    targetUrl = localServer?.url || EMBEDDED_URL;
    healthUrl = `${targetUrl}api/state`;
  }
  mainWindow = createWindow();
  await loadWhenReady(mainWindow, targetUrl, healthUrl);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
    await loadWhenReady(mainWindow, app.isPackaged ? EMBEDDED_URL : APP_URL, app.isPackaged ? `${EMBEDDED_URL}api/state` : HEALTH_URL);
  }
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    title: "Local AI DJ",
    backgroundColor: "#050505",
    show: false,
    webPreferences: {
      preload: `${__dirname}/preload.cjs`,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return window;
}

async function loadWhenReady(window, targetUrl, healthUrl) {
  await window.loadURL(makeLoadingPage());

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    if (await isServerReady(healthUrl)) {
      await window.loadURL(targetUrl);
      return;
    }
    await delay(750);
  }

  await window.loadURL(makeErrorPage());
}

async function isServerReady(healthUrl) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeLoadingPage() {
  return dataPage(`
    <main>
      <div class="mark">24H LOCALCAST</div>
      <h1>Local AI DJ</h1>
      <p>正在启动本地电台服务...</p>
    </main>
  `);
}

function makeErrorPage() {
  return dataPage(`
    <main>
      <div class="mark">SERVICE OFFLINE</div>
      <h1>Local AI DJ</h1>
      <p>没有连上本地服务。请在项目目录运行 <code>npm run desktop</code>，或先运行 <code>npm run dev</code>。</p>
    </main>
  `);
}

function dataPage(body) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Local AI DJ</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            color: #f2f0e8;
            background:
              repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 7px),
              #050505;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          main {
            width: min(520px, calc(100vw - 40px));
            border: 1px solid rgba(242,240,232,.16);
            border-radius: 8px;
            padding: 32px;
            background: rgba(10,11,12,.86);
          }
          .mark {
            color: #7fd3c6;
            font-size: 12px;
            letter-spacing: .14em;
          }
          h1 {
            margin: 18px 0 12px;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 56px;
            line-height: .9;
            letter-spacing: 0;
          }
          p {
            margin: 0;
            color: rgba(242,240,232,.72);
            line-height: 1.7;
          }
          code {
            color: #7fd3c6;
          }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `)}`;
}
