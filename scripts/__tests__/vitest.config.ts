import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["scripts/__tests__/**/*.test.ts"],
    // Refuses a non-local Postgres and checks every connection (slice 2a).
    setupFiles: [resolve(__dirname, "../../config/vitest.db-guard.ts")],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "../.."),
    },
  },
});
