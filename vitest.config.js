import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default {
  test: {
    globals: true,
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
    exclude: [
      "e2e/**",
      "node_modules/**",
      ".next/**",
      // Requires live DB connection — run in CI with DB provisioned
      "lib/rag/__tests__/prisma-iicrc-chunk.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
};
