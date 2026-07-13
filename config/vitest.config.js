import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");

export default {
  root: repoRoot,
  test: {
    globals: true,
    environment: "node",
    // Serialize test files — prevents concurrent DB mutations (e.g. backfill
    // deleteMany) from racing against tests that hold long-lived DB fixtures.
    maxWorkers: 1,
    minWorkers: 1,
    include: [
      "lib/**/__tests__/**/*.test.ts",
      "app/api/**/__tests__/**/*.test.ts",
      "scripts/**/__tests__/**/*.test.ts",
      "components/**/__tests__/**/*.test.ts",
      "components/**/__tests__/**/*.test.tsx",
      "app/billing/**/__tests__/**/*.test.tsx",
      "app/capture/**/__tests__/**/*.test.tsx",
      "app/dashboard/**/__tests__/**/*.test.tsx",
      "app/__tests__/**/*.test.tsx",
      "data/content/videos/__tests__/**/*.test.ts",
    ],
    exclude: [
      "docs/archive/playwright-e2e/**",
      "e2e/**",
      "node_modules/**",
      ".next/**",
      // Requires live DB connection — run in CI with DB provisioned
      "lib/rag/__tests__/prisma-iicrc-chunk.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@/content": resolve(repoRoot, "data/content"),
      "@": repoRoot,
    },
  },
};
