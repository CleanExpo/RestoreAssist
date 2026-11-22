import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  assertWrite: vi.fn(),
  requireActiveSubscription: vi.fn(),
  applyRateLimit: vi.fn(),
  getWorkspaceForUser: vi.fn(),
  checkWorkspaceBudget: vi.fn(),
  resolveKey: vi.fn(),
  logAiUsage: vi.fn(),
  extractLabReport: vi.fn(),
  assessmentFindFirst: vi.fn(),
  writes: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mouldRemediationAssessment: {
      findFirst: m.assessmentFindFirst,
      create: m.writes,
      upsert: m.writes,
      update: m.writes,
    },
    auditLog: { create: m.writes },
    inspection: { update: m.writes, updateMany: m.writes },
    $transaction: m.writes,
  },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: m.assertWrite,
}));
vi.mock("@/lib/env", () => ({ readEnv: () => "test-secret-for-proposals" }));
vi.mock("@/lib/billing/subscription-gate", () => ({
  requireActiveSubscription: m.requireActiveSubscription,
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: m.applyRateLimit }));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: m.getWorkspaceForUser,
}));
vi.mock("@/lib/ai/budget-guard", () => ({
  checkWorkspaceBudget: m.checkWorkspaceBudget,
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: m.resolveKey,
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/usage/log-usage", () => ({
  logAiUsage: m.logAiUsage,
  estimateCostUsd: () => 0.01,
}));
vi.mock("@/lib/third-party-report/extract", async (orig) => ({
  ...(await orig<typeof import("@/lib/third-party-report/extract")>()),
  extractLabReport: m.extractLabReport,
}));

import { POST } from "../extract/route";

const PDF = Buffer.from("%PDF-1.4\n" + "x".repeat(200) + "\n%%EOF");

function req(bytes: Buffer | null, name = "lab.pdf"): NextRequest {
  const form = new FormData();
  if (bytes) form.append("file", new File([new Uint8Array(bytes)], name));
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/third-party-reports/extract",
    { method: "POST", body: form },
  );
}
const ctx = { params: Promise.resolve({ id: "insp_1" }) };

const okRead = {
  ok: true,
  data: {
    document: { title: "Lab", author: "Acme", reportDate: null },
    facts: [
      { field: "labName", value: "Acme", pageRef: 1, quote: "Acme Lab" },
      { field: "sporeCountPreRemediation", value: 5000, pageRef: 2, quote: "5000" },
    ],
    rejectedCount: 1,
    usage: { inputTokens: 10, outputTokens: 5 },
  },
};

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.getServerSession.mockResolvedValue({ user: { id: "u1" } });
  m.assertWrite.mockResolvedValue({
    ok: true,
    data: { childInspectionFilter: undefined },
  });
  m.requireActiveSubscription.mockResolvedValue(null);
  m.applyRateLimit.mockResolvedValue(null);
  m.getWorkspaceForUser.mockResolvedValue({ id: "ws1" });
  m.checkWorkspaceBudget.mockResolvedValue({ ok: true });
  m.resolveKey.mockResolvedValue({ apiKey: "sk-test" });
  m.extractLabReport.mockResolvedValue(okRead);
  m.assessmentFindFirst.mockResolvedValue({ labName: "Other Lab" });
});

describe("POST third-party-reports/extract", () => {
  it("proposes labelled facts with page refs and writes nothing", async () => {
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(200);
    const { proposal } = await res.json();
    expect(proposal.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(proposal.proposalToken).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(proposal.facts[0]).toMatchObject({ status: "conflicts", pageRef: 1, jobValue: "Other Lab" });
    expect(proposal.facts[1]).toMatchObject({ status: "new", pageRef: 2 });
    expect(proposal.gaps.length).toBeGreaterThan(0);
    expect(proposal.rejectedCount).toBe(1);
    expect(m.writes).not.toHaveBeenCalled();
    expect(m.logAiUsage).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("uses the owner and manager reach, not the assigned technician's (D-028: AI-key spend)", async () => {
    const tenancy = await import("@/lib/auth/assert-tenancy");
    expect(tenancy.resolveInspectionWrite).toBe(m.assertWrite);
    expect(Object.keys(tenancy)).not.toContain("assertInspectionAssignedWrite");
  });

  it("401 without a session, before any work", async () => {
    m.getServerSession.mockResolvedValue(null);
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(401);
    expect(m.extractLabReport).not.toHaveBeenCalled();
  });

  it("404 for another tenant's job, with no AI call and no write", async () => {
    m.assertWrite.mockResolvedValue({ ok: false, status: 404, reason: "Not found" });
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(404);
    expect(m.extractLabReport).not.toHaveBeenCalled();
    expect(m.writes).not.toHaveBeenCalled();
  });

  it("returns the subscription refusal and makes no AI call", async () => {
    m.requireActiveSubscription.mockResolvedValue(
      Response.json({ error: "upgrade" }, { status: 402 }),
    );
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(402);
    expect(m.extractLabReport).not.toHaveBeenCalled();
  });

  it("400 for no file, an empty body, and a non-PDF", async () => {
    expect((await POST(req(null), ctx)).status).toBe(400);
    expect((await POST(req(Buffer.alloc(0)), ctx)).status).toBe(400);
    const fake = Buffer.from("GIF89a" + "x".repeat(300));
    expect((await POST(req(fake, "lab.pdf"), ctx)).status).toBe(400);
    expect(m.extractLabReport).not.toHaveBeenCalled();
  });

  it("429 when the workspace budget is spent, with no AI call", async () => {
    m.checkWorkspaceBudget.mockResolvedValue({
      ok: false,
      error: "budget",
      remainingUsd: 0,
      budgetUsd: 5,
    });
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(429);
    expect(m.extractLabReport).not.toHaveBeenCalled();
  });

  it("402 when the workspace has no AI key", async () => {
    const { NoWorkspaceKeyError } = await import("@/lib/ai/resolve-workspace-ai-key");
    m.resolveKey.mockRejectedValue(new NoWorkspaceKeyError("none"));
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(402);
    expect(m.extractLabReport).not.toHaveBeenCalled();
  });

  it.each([
    ["TIMEOUT", 504],
    ["PARSE_FAILED", 502],
    ["MODEL_OVERLOADED", 503],
    ["RATE_LIMITED", 429],
    ["API_ERROR", 502],
  ])("a failed AI call (%s) maps to %i, logs the failure and writes nothing", async (reason, status) => {
    m.extractLabReport.mockResolvedValue({ ok: false, reason, retryAfterMs: 10000 });
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: reason });
    expect(m.logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorType: reason }),
    );
    expect(m.writes).not.toHaveBeenCalled();
  });

  it("an empty read (no facts) still returns a proposal with gaps, not an error", async () => {
    m.extractLabReport.mockResolvedValue({
      ok: true,
      data: { ...okRead.data, facts: [], rejectedCount: 0 },
    });
    m.assessmentFindFirst.mockResolvedValue(null);
    const res = await POST(req(PDF), ctx);
    const { proposal } = await res.json();
    expect(res.status).toBe(200);
    expect(proposal.facts).toEqual([]);
    expect(proposal.gaps.map((g: { code: string }) => g.code)).toContain("NO_SAMPLING_DATE");
  });

  it("never leaks an internal error message", async () => {
    m.extractLabReport.mockRejectedValue(new Error("secret db detail"));
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret db detail");
  });
});
