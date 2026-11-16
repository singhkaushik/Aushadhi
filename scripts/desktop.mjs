// Launches `nextron dev`. ELECTRON_RUN_AS_NODE is removed because it may leak in
// from an Electron-based parent process (editors, terminals) and would make the
// Electron binary run as plain Node instead of opening the app window.
import { spawn } from "node:child_process";

delete process.env.ELECTRON_RUN_AS_NODE;

const child = spawn("npx", ["nextron", "--startup-delay", "20000", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});
child.on("close", (code) => process.exit(code ?? 0));
