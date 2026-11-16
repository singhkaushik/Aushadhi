// Starts the standalone Next.js server (`next start` does not work with
// `output: "standalone"`). The server.js entry may sit at the standalone
// root or nested under renderer/ depending on the trace root.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const standalone = path.join(process.cwd(), "renderer", ".next", "standalone");
const candidates = [path.join(standalone, "server.js"), path.join(standalone, "renderer", "server.js")];
const entry = candidates.find((p) => fs.existsSync(p));
if (!entry) {
  console.error("Standalone server not found. Run `npm run build` first.");
  process.exit(1);
}

const port = process.env.PORT || "3000";
// Bind loopback only: without HOSTNAME the standalone server listens on every
// interface, exposing the ERP (and its default admin login) to the whole LAN.
// Set HOSTNAME explicitly to share on the network deliberately.
const hostname = process.env.HOSTNAME || "127.0.0.1";
// Point the server at the project-root data/ folder. Without this the bundled
// next.config resolves DB_PATH relative to .next/standalone — user data would
// live inside the build output and be destroyed by the next `next build`.
const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "pharma.db");
console.log(`Starting ERP server on http://${hostname}:${port} ...`);
const child = spawn(process.execPath, [entry], {
  cwd: path.dirname(entry),
  stdio: "inherit",
  env: { ...process.env, PORT: port, HOSTNAME: hostname, DB_PATH: dbPath },
});
child.on("exit", (code) => process.exit(code ?? 0));
