// Renders resources/icon.svg -> icon.png (512px) for electron-builder.
// electron-builder converts the PNG to .ico itself; the png-to-ico output was
// malformed for makensis (NSIS "invalid icon file size"), so .ico is not kept.
// Run: node scripts/gen-icons.mjs   (re-run whenever icon.svg changes)
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const svg = fs.readFileSync("resources/icon.svg");
const png = await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer();
fs.writeFileSync("resources/icon.png", png);
console.log("wrote resources/icon.png");
