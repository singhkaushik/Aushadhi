// Renders resources/icon.svg -> icon.png (512px) and icon.ico for electron-builder.
// Run: node scripts/gen-icons.mjs   (re-run whenever icon.svg changes)
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const pngToIco = (await import("png-to-ico")).default;

const svg = fs.readFileSync("resources/icon.svg");
const png = await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer();
fs.writeFileSync("resources/icon.png", png);
fs.writeFileSync("resources/icon.ico", await pngToIco([png]));
console.log("wrote resources/icon.png + resources/icon.ico");
