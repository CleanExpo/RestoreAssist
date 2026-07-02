import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const runEvaluationSuite = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
}));
vi.mock("@/lib/ai/evaluation-harness", () => ({
  runEvaluationSuite: (...args: unknown[]) => runEvaluationSuite(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  runEvaluationSuite.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "admin_user" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin_user", role: "ADMIN" },
  });
});

function postRequest() {
  return new NextRequest("http://localhost/api/admin/evaluation", {
    method: "POST",
    body: JSON.stringify({ sampleSize: 1 }),
  });
}

describe("POST /api/admin/evaluation", () => {
  it("does not expose missing provider configuration details", async () => {
    runEvaluationSuite.mockRejectedValueOnce(
      new Error("ANTHROPIC_API_KEY is missing from process env"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toBe("Evaluation service is not configured");
    // must not leak the raw provider-config detail
    expect(JSON.stringify(body)).not.toContain("ANTHROPIC_API_KEY");
  });

  it("does not expose unexpected evaluation exception details", async () => {
    runEvaluationSuite.mockRejectedValueOnce(
      new Error("provider returned stack trace with secret abc123"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Evaluation failed");
    // must not leak the raw exception detail
    expect(JSON.stringify(body)).not.toContain("abc123");
  });
});
