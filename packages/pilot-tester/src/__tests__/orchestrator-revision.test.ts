import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/safety.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client/safety.js")>();
  return {
    ...actual,
    probeSandboxRuntimeRevision: vi.fn(),
  };
});

import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";
import { probeSandboxRuntimeRevision } from "../client/safety.js";
import { runHarness } from "../runner/orchestrator.js";

const REVISION = "a".repeat(40);
const userPool = SYNTHETIC_COMPANIES.map((company, index) => ({
  email: `pilot-${company.key}@restoreassist.sandbox`,
  password: `sandbox-password-${index}`,
  workspaceName: `${company.name} (sandbox pilot)`,
  workspaceId: `workspace_${company.key.replaceAll("-", "_")}`,
  companyKey: company.key,
}));

describe("runHarness release/runtime binding", () => {
  beforeEach(() => {
    vi.mocked(probeSandboxRuntimeRevision).mockReset();
    vi.stubEnv(
      "PILOT_TESTER_ALLOWED_BASE_URLS",
      "https://restoreassist-sandbox.vercel.app",
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("stops before creating pilot work when the sandbox revision cannot be proven", async () => {
    vi.mocked(probeSandboxRuntimeRevision).mockRejectedValueOnce(
      new Error("sandbox revision mismatch"),
    );

    await expect(
      runHarness({
        baseUrl: "https://restoreassist-sandbox.vercel.app",
        userPool,
        revision: REVISION,
      }),
    ).rejects.toThrow(/revision mismatch/);
    expect(probeSandboxRuntimeRevision).toHaveBeenCalledTimes(1);
    expect(probeSandboxRuntimeRevision).toHaveBeenCalledWith(
      "https://restoreassist-sandbox.vercel.app",
      REVISION,
    );
  });
});
