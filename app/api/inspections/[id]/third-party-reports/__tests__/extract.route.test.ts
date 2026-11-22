import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  assertWrite: vi.fn(),
  assertSpender: vi.fn(),
  requireActiveSubscription: vi.fn(),
  applyRateLimit: vi.fn(),
  checkWorkspaceBudget: vi.fn(),
  resolveKey: vi.fn(),
  logAiUsage: vi.fn(),
  extractLabReport: vi.fn(),
  assessmentFindFirst: vi.fn(),
  inspectionFindFirst: vi.fn(),
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
    inspection: {
      findFirst: m.inspectionFindFirst,
      update: m.writes,
      updateMany: m.writes,
    },
    $transaction: m.writes,
  },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: m.assertWrite,
  assertFinancialWriter: m.assertSpender,
}));
vi.mock("@/lib/env", () => ({ readEnv: () => "test-secret-for-proposals" }));
vi.mock("@/lib/billing/subscription-gate", () => ({
  requireActiveSubscription: m.requireActiveSubscription,
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: m.applyRateLimit }));
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

let PDF: Buffer;
beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.addPage();
  PDF = Buffer.from(await doc.save());
});

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
    data: {
      inspectionWhere: { id: "insp_1" },
      childInspectionFilter: undefined,
    },
  });
  m.inspectionFindFirst.mockResolvedValue({ userId: "u1", workspaceId: null });
  m.assertSpender.mockResolvedValue({ ok: true, data: { id: "u1", role: "MANAGER" } });
  m.requireActiveSubscription.mockResolvedValue(null);
  m.applyRateLimit.mockResolvedValue(null);
  m.checkWorkspaceBudget.mockResolvedValue({ ok: true });
  m.resolveKey.mockResolvedValue({
    apiKey: "sk-test",
    workspaceId: "ws1",
    source: "byok",
  });
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

  it("403 for an ordinary workspace member (role USER): no reach check, no AI call", async () => {
    m.assertSpender.mockResolvedValue({
      ok: false,
      status: 403,
      reason: "Only an owner or manager can do this",
    });
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(403);
    expect(m.assertWrite).not.toHaveBeenCalled();
    expect(m.resolveKey).not.toHaveBeenCalled();
    expect(m.extractLabReport).not.toHaveBeenCalled();
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

  it("400 and no spend for a PDF that cannot be parsed, so page numbers are never unverified", async () => {
    const unparseable = Buffer.from("%PDF-1.4\n" + "x".repeat(200) + "\n%%EOF");
    const res = await POST(req(unparseable), ctx);
    expect(res.status).toBe(400);
    expect(m.resolveKey).not.toHaveBeenCalled();
    expect(m.extractLabReport).not.toHaveBeenCalled();
  });

  it("402 and no AI call when only the funded-trial platform key would pay", async () => {
    m.resolveKey.mockResolvedValue({
      apiKey: "sk-platform",
      workspaceId: "platform-trial",
      source: "platform",
    });
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(402);
    expect(m.extractLabReport).not.toHaveBeenCalled();
    expect(m.checkWorkspaceBudget).not.toHaveBeenCalled();
  });

  it("checks the budget of, and logs usage to, the workspace that owns the key and the job", async () => {
    m.inspectionFindFirst.mockResolvedValue({ userId: "u1", workspaceId: "wsOwner" });
    m.resolveKey.mockResolvedValue({
      apiKey: "sk-test",
      workspaceId: "wsOwner",
      source: "byok",
    });
    await POST(req(PDF), ctx);
    expect(m.checkWorkspaceBudget).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "wsOwner" }),
    );
    expect(m.logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "wsOwner", success: true }),
    );
  });

  it("an admin in two workspaces reading a job in workspace B resolves B's key through the job owner and spends B's cap", async () => {
    m.inspectionFindFirst.mockResolvedValue({ userId: "ownerB", workspaceId: "wsB" });
    m.resolveKey.mockImplementation(async (id: string) => ({
      apiKey: id === "ownerB" ? "sk-from-B" : "sk-from-A",
      workspaceId: id === "ownerB" ? "wsB" : "wsA",
      source: "byok",
    }));
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(200);
    expect(m.resolveKey).toHaveBeenCalledWith("ownerB", "ANTHROPIC");
    expect(m.resolveKey).not.toHaveBeenCalledWith("u1", "ANTHROPIC");
    expect(m.extractLabReport).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-from-B" }),
    );
    expect(m.checkWorkspaceBudget).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "wsB" }),
    );
    expect(m.logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "wsB" }),
    );
  });

  it("refuses with no spend when the job's recorded workspace differs from the workspace that owns the resolved key", async () => {
    m.inspectionFindFirst.mockResolvedValue({ userId: "ownerB", workspaceId: "wsB" });
    m.resolveKey.mockResolvedValue({
      apiKey: "sk-from-A",
      workspaceId: "wsA",
      source: "byok",
    });
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(403);
    expect(m.extractLabReport).not.toHaveBeenCalled();
    expect(m.checkWorkspaceBudget).not.toHaveBeenCalled();
    expect(m.logAiUsage).not.toHaveBeenCalled();
    expect(m.writes).not.toHaveBeenCalled();
  });

  it("404 and no spend when the job row cannot be read back", async () => {
    m.inspectionFindFirst.mockResolvedValue(null);
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(404);
    expect(m.resolveKey).not.toHaveBeenCalled();
    expect(m.extractLabReport).not.toHaveBeenCalled();
  });

  it("402 and no AI call when the resolved key names no workspace", async () => {
    m.resolveKey.mockResolvedValue({ apiKey: "sk-test", workspaceId: "", source: "byok" });
    const res = await POST(req(PDF), ctx);
    expect(res.status).toBe(402);
    expect(m.extractLabReport).not.toHaveBeenCalled();
  });

  it("charges a malformed reply at the usage the provider reported", async () => {
    m.extractLabReport.mockResolvedValue({
      ok: false,
      reason: "PARSE_FAILED",
      cause: { usage: { inputTokens: 1200, outputTokens: 80 } },
    });
    await POST(req(PDF), ctx);
    expect(m.logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        inputTokens: 1200,
        outputTokens: 80,
        estimatedCostUsd: 0.01,
      }),
    );
  });

  it("charges the bounded estimate for an API_ERROR that returned no usage, but not for a refusal that did no work", async () => {
    m.extractLabReport.mockResolvedValue({ ok: false, reason: "API_ERROR" });
    await POST(req(PDF), ctx);
    expect(m.logAiUsage).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, estimatedCostUsd: 0.05 }),
    );
    m.extractLabReport.mockResolvedValue({ ok: false, reason: "KEY_INVALID" });
    await POST(req(PDF), ctx);
    expect(m.logAiUsage).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, estimatedCostUsd: 0 }),
    );
  });

  it("charges the bounded estimate when a read may have been billed with no usage returned", async () => {
    m.extractLabReport.mockResolvedValue({ ok: false, reason: "TIMEOUT" });
    await POST(req(PDF), ctx);
    expect(m.logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, estimatedCostUsd: 0.05 }),
    );
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
