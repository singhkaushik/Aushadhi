import path from "path";
import type { NextConfig } from "next";

// Keep the database at the project root's data/ folder regardless of the
// directory the Next server is launched from (root, renderer/, or packaged app).
// Packaged builds override this via the DB_PATH env var set by the Electron main.
if (!process.env.DB_PATH) {
  const here = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  process.env.DB_PATH = path.resolve(here, "..", "data", "pharma.db");
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(), ".."),
};

export default nextConfig;
