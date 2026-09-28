import { afterEach, describe, expect, it } from "vitest";
import { getClientId, getClientSecret } from "../base-client";
import type { IntegrationProvider } from "../oauth-handler";

const previousDevMode = process.env.INTEGRATION_DEV_MODE;

afterEach(() => {
  if (previousDevMode === undefined) delete process.env.INTEGRATION_DEV_MODE;
  else process.env.INTEGRATION_DEV_MODE = previousDevMode;
});

describe("provider credential lookup rejects prototype keys", () => {
  it("getClientId throws for an unlisted provider", () => {
    delete process.env.INTEGRATION_DEV_MODE;
    expect(() => getClientId("toString" as IntegrationProvider)).toThrow(
      /toString_CLIENT_ID is not configured/,
    );
  });

  it("getClientId throws for constructor", () => {
    delete process.env.INTEGRATION_DEV_MODE;
    expect(() => getClientId("constructor" as IntegrationProvider)).toThrow(
      /constructor_CLIENT_ID is not configured/,
    );
  });

  it("getClientSecret throws for an unlisted provider", () => {
    delete process.env.INTEGRATION_DEV_MODE;
    expect(() => getClientSecret("toString" as IntegrationProvider)).toThrow(
      /toString_CLIENT_SECRET is not configured/,
    );
  });

  it("getClientSecret throws for constructor", () => {
    delete process.env.INTEGRATION_DEV_MODE;
    expect(() => getClientSecret("constructor" as IntegrationProvider)).toThrow(
      /constructor_CLIENT_SECRET is not configured/,
    );
  });
});
