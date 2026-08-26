import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEnvStatus } from "@/lib/env-check";

const EMAIL_ENV_NAMES = ["MAILTRAP_API_KEY", "SENDER_EMAIL"] as const;

const originalEmailEnv = Object.fromEntries(
  EMAIL_ENV_NAMES.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  for (const name of EMAIL_ENV_NAMES) delete process.env[name];
});

afterEach(() => {
  for (const name of EMAIL_ENV_NAMES) {
    const original = originalEmailEnv[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

describe("getEnvStatus transactional email", () => {
  it("does not report the capability missing when Mailtrap is complete", () => {
    process.env.MAILTRAP_API_KEY = "mailtrap-test-key";
    process.env.SENDER_EMAIL = "noreply@example.test";

    expect(getEnvStatus().missingRecommended).not.toContain(
      "MAILTRAP_API_KEY+SENDER_EMAIL",
    );
  });

  it("reports the capability missing when provider credentials are incomplete", () => {
    process.env.MAILTRAP_API_KEY = "mailtrap-test-key";

    expect(getEnvStatus().missingRecommended).toContain(
      "MAILTRAP_API_KEY+SENDER_EMAIL",
    );
  });
});
