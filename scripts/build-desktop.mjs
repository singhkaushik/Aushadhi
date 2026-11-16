// Builds the packaged desktop app:
//   1. next build renderer (standalone output)
//   2. webpack-compile main/ -> app/   (same as `nextron build` does for the main process)
//   3. assemble app/server/ from the standalone Next build (the real server, not a static export)
//   4. electron-builder -> dist/
// `nextron build` itself is not used because it requires `output: 'export'` (static),
// which this app's API routes / middleware / RSC cannot do.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "app");
const serverDir = path.join(appDir, "server");

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", cwd: root, ...opts });
  if (r.status) process.exit(r.status ?? 1);
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

/** Locate server.js inside the standalone output (flat or nested under renderer/). */
function findServerEntry(dir, depth = 0) {
  if (depth > 2) return null;
  const direct = path.join(dir, "server.js");
  if (fs.existsSync(direct)) return direct;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith(".")) {
      const found = findServerEntry(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

console.log("[build-desktop] cleaning");
fs.rmSync(appDir, { recursive: true, force: true });
fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });

run("npx", ["next", "build", "renderer"]);
run("node", [path.join("node_modules", "nextron", "bin", "webpack.config.cjs")]);

const standalone = path.join(root, "renderer", ".next", "standalone");
const entry = findServerEntry(standalone);
if (!entry) {
  console.error("[build-desktop] server.js not found in standalone output");
  process.exit(1);
}
console.log(`[build-desktop] standalone server: ${path.relative(root, entry)}`);

// standalone root = everything Next traced (server.js tree + node_modules)
copyDir(standalone, serverDir);
// static assets and public/ are not traced into standalone; place them beside the server's .next
const relServer = path.dirname(path.relative(standalone, entry));
const innerNext = path.join(serverDir, relServer, ".next");
copyDir(path.join(root, "renderer", ".next", "static"), path.join(innerNext, "static"));
const pub = path.join(root, "renderer", "public");
if (fs.existsSync(pub)) copyDir(pub, path.join(serverDir, relServer, "public"));

run("npx", ["electron-builder", "--win"]);
console.log("\n[build-desktop] done — see dist/");
