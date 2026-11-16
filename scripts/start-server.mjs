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
console.log(`Starting ERP server on port ${port} ...`);
const child = spawn(process.execPath, [entry], {
  cwd: path.dirname(entry),
  stdio: "inherit",
  env: { ...process.env, PORT: port },
});
child.on("exit", (code) => process.exit(code ?? 0));
