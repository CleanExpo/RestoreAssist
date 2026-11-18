import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import {
  assertDisposableDatabase,
  assertStripeTestKey,
} from "../e2e/one-setup-path/guards";

// Signup to first real job, on a disposable database with Stripe test mode only.
// The Done recipe runs with a bare PATH, so this config loads its own env:
//   DATABASE_URL, STRIPE_SECRET_KEY (sk_test_), STRIPE_PRICE_MONTHLY (a test price)
// from .env.one-setup.local, which is gitignored.
//
// ONE_SETUP_WITHOUT_STRIPE=1 walks every leg except the real purchases, using a seeded
// seat. It proves less and says so in the test names; the full run never sets it.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const PORT = 3117;
const baseURL = `http://localhost:${PORT}`;

function readEnvFile(): Record<string, string> {
  try {
    const lines = readFileSync(path.join(repoRoot, ".env.one-setup.local"), "utf8").split("\n");
    return Object.fromEntries(
      lines
        .map((line) => line.match(/^\s*([A-Z0-9_]+)=(.*)$/))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => [match[1], match[2].trim().replace(/^["']|["']$/g, "")]),
    );
  } catch {
    return {};
  }
}

// A run without Stripe never opens the file: nothing in it is needed or wanted.
const withoutStripe = process.env.ONE_SETUP_WITHOUT_STRIPE === "1";
const file = withoutStripe ? {} as Record<string, string> : readEnvFile();
const databaseUrl = withoutStripe
  ? process.env.ONE_SETUP_DATABASE_URL
  : file.DATABASE_URL;
const stripeKey = withoutStripe
  ? "sk_test_placeholder_no_stripe_calls"
  : file.STRIPE_SECRET_KEY;

assertDisposableDatabase(databaseUrl);
assertStripeTestKey(stripeKey);

process.env.ONE_SETUP_DATABASE_URL = databaseUrl;
process.env.ONE_SETUP_NEXTAUTH_SECRET = "one-setup-local-only-not-a-real-secret-0000";

export default defineConfig({
  testDir: path.join(repoRoot, "e2e/one-setup-path"),
  testMatch: /.*\.spec\.ts/,
  grepInvert: withoutStripe ? /@stripe/ : /@seeded/,
  workers: 1,
  retries: 0,
  timeout: 10 * 60 * 1000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  outputDir: path.join(repoRoot, "test-results/one-setup-path"),
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    serviceWorkers: "block",
    navigationTimeout: 180_000,
    actionTimeout: 30_000,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev -p ${PORT}`,
    cwd: repoRoot,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: databaseUrl as string,
      DIRECT_URL: databaseUrl as string,
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: process.env.ONE_SETUP_NEXTAUTH_SECRET,
      NEXT_PUBLIC_APP_URL: baseURL,
      STRIPE_SECRET_KEY: stripeKey as string,
      STRIPE_PRICE_MONTHLY: file.STRIPE_PRICE_MONTHLY ?? "price_placeholder_no_stripe_calls",
      SETUP_WIZARD_ENABLED: "true",
    },
  },
});
