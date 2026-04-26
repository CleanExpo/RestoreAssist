import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Pilot-tester is a node-only harness with no CSS. Stop Vite from
  // walking up to the parent project's postcss.config.mjs, which
  // pulls in @tailwindcss/postcss — a dep that lives at the repo
  // root, not under pilot-tester/node_modules.
  css: { postcss: { plugins: [] } },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".."),
      "@pilot": path.resolve(__dirname, "src"),
    },
  },
});
