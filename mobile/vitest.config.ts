import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default {
  root: __dirname,
  oxc: false,
  esbuild: {
    include: /\.[jt]sx?$/,
    loader: "ts",
  },
  test: {
    globals: true,
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
    maxWorkers: 1,
    minWorkers: 1,
  },
  resolve: {
    alias: {
      "@": __dirname,
      "expo-sqlite": resolve(__dirname, "test/expo-sqlite-mock.ts"),
    },
  },
};
