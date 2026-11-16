import { app, BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";
let server: ChildProcess | undefined;
let baseUrl = "";

/** True only for URLs on the embedded ERP server's origin. */
const sameOrigin = (url: string) => {
  try {
    return !!baseUrl && new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
};

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer().once("error", reject).listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

function waitFor(url: string, retries = 200): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (n: number) => {
      http
        .get(url, (res) => {
          res.resume();
          // Only count a real 200 from our app as "ready" — a foreign service on
          // a raced port that answers 4xx must not pass the health check.
          if (res.statusCode === 200) return resolve();
          if (n <= 0) return reject(new Error(`ERP server returned HTTP ${res.statusCode}`));
          setTimeout(() => attempt(n - 1), 250);
        })
        .on("error", () => {
          if (n <= 0) return reject(new Error("ERP server did not start"));
          setTimeout(() => attempt(n - 1), 250);
        });
    };
    attempt(retries);
  });
}

/** The standalone Next build can be flat or nested under renderer/ depending on the trace root. */
function serverEntry(): string {
  const base = path.join(__dirname, "server").replace("app.asar", "app.asar.unpacked");
  for (const rel of ["server.js", path.join("renderer", "server.js")]) {
    const p = path.join(base, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Standalone server not found under ${base}`);
}

async function startServer(): Promise<string> {
  const port = await freePort();
  const entry = serverEntry();
  const logFd = fs.openSync(path.join(app.getPath("userData"), "server.log"), "a");
  server = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      DB_PATH: path.join(app.getPath("userData"), "data", "pharma.db"),
    },
  });
  server.on("exit", (code) => console.error(`ERP server exited with code ${code}`));
  await waitFor(`http://127.0.0.1:${port}/login`);
  return `http://127.0.0.1:${port}`;
}

async function createWindow() {
  const iconPath = path.join(__dirname, "resources", "icon.png");
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") },
  });
  // Lock the window to the embedded ERP server. window.open stays allowed for
  // the app's own origin — print views depend on it — while external windows
  // and navigation off that origin are denied.
  const prefs = { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") };
  win.webContents.setWindowOpenHandler(({ url }) =>
    sameOrigin(url)
      ? { action: "allow" as const, overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: prefs } }
      : { action: "deny" as const },
  );
  win.webContents.on("will-navigate", (e, url) => {
    if (!sameOrigin(url)) e.preventDefault();
  });
  if (isDev) {
    const port = process.argv[2] || "8888";
    baseUrl = `http://localhost:${port}`;
    await win.loadURL(`${baseUrl}/`);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    try {
      baseUrl = await startServer();
      await win.loadURL(`${baseUrl}/`);
    } catch (err) {
      const logPath = path.join(app.getPath("userData"), "server.log");
      await win.loadURL(
        `data:text/html,<body style="font-family:sans-serif;padding:2em"><h2>ERP server failed to start</h2><pre>${String(
          err,
        )}</pre><p>See log: ${logPath}</p></body>`,
      );
    }
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  server?.kill();
  app.quit();
});
app.on("quit", () => server?.kill());
