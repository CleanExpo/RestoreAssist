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
    expect(body).toEqual({ error: "Evaluation service is not configured" });
  });

  it("does not expose unexpected evaluation exception details", async () => {
    runEvaluationSuite.mockRejectedValueOnce(
      new Error("provider returned stack trace with secret abc123"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Evaluation failed" });
  });
});
