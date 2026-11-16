import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // App Router only — no pages/ directory exists
      "@next/next/no-html-link-for-pages": "off",
    },
    ignores: [
      "node_modules/**",
      "**/.next/**",
      "out/**",
      "build/**",
      "app/**",
      "dist/**",
      "scripts/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
