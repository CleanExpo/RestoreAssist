import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const reportFindFirst = vi.fn();
const requireActiveSubscription = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const review = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...args: unknown[]) => reportFindFirst(...args),
    },
  },
}));
vi.mock("@/lib/billing/subscription-gate", () => ({
  requireActiveSubscription: (...args: unknown[]) =>
    requireActiveSubscription(...args),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ai/resolve-workspace-ai-key")
  >("@/lib/ai/resolve-workspace-ai-key");
  return {
    ...actual,
    resolveWorkspaceAiKey: (...args: unknown[]) => resolveWorkspaceAiKey(...args),
  };
});
vi.mock("@/lib/services/weakness-detection/llm-contradiction-check", () => ({
  llmContradictionChecker: { review: (...args: unknown[]) => review(...args) },
}));

import { POST } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";

function postRequest() {
  return new NextRequest("http://localhost/api/reports/report_1/weakness-check", {
    method: "POST",
  });
}

function invoke() {
  return POST(postRequest(), { params: Promise.resolve({ id: "report_1" }) });
}

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  reportFindFirst.mockReset();
  requireActiveSubscription.mockReset();
  resolveWorkspaceAiKey.mockReset();
  review.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  requireActiveSubscription.mockResolvedValue(null);
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "workspace-anthropic-key",
  });
  review.mockResolvedValue([]);
  reportFindFirst.mockResolvedValue({
    id: "report_1",
    incidentDate: null,
    technicianAttendanceDate: null,
    waterCategory: "Category 2",
    waterClass: "Class 2",
    sourceOfWater: null,
    biologicalMouldDetected: false,
    biologicalMouldCategory: null,
    technicianFieldReport:
      "Damage was caused by a burst pipe. Property is guaranteed dry.",
    reportInstructions: null,
  });
});

describe("POST /api/reports/[id]/weakness-check", () => {
  it("returns 401 when there is no session", async () => {
    getServerSession.mockResolvedValueOnce(null);

    const response = await invoke();

    expect(response.status).toBe(401);
    expect(reportFindFirst).not.toHaveBeenCalled();
  });

  it("returns 402 from the shared subscription gate", async () => {
    requireActiveSubscription.mockResolvedValueOnce(
      NextResponse.json(
        { error: "Active subscription required", upgradeRequired: true },
        { status: 402 },
      ),
    );

    const response = await invoke();

    expect(response.status).toBe(402);
    expect(reportFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the report is not owned by the caller", async () => {
    reportFindFirst.mockResolvedValueOnce(null);

    const response = await invoke();

    expect(response.status).toBe(404);
    expect(review).not.toHaveBeenCalled();
  });

  it("returns 200 with deterministic-only findings when no workspace key resolves", async () => {
    resolveWorkspaceAiKey.mockRejectedValueOnce(new NoWorkspaceKeyError("ANTHROPIC"));

    const response = await invoke();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.llmReviewApplied).toBe(false);
    expect(body.data.note).toContain("No workspace AI key");
    expect(review).not.toHaveBeenCalled();
    expect(body.data.findings.length).toBeGreaterThan(0);
    expect(
      body.data.findings.every((f: { detectionMethod: string }) => f.detectionMethod === "deterministic"),
    ).toBe(true);
  });

  it("returns 200 with deterministic + llm findings merged when a key resolves", async () => {
    review.mockResolvedValueOnce([
      {
        id: "llm_1",
        checkClass: "contradiction",
        severity: "P1",
        evidenceAnchor: "unverified/missing",
        description: "Summary contradicts the technician notes.",
        suggestedAction: "Reconcile the two sections.",
        detectionMethod: "llm",
      },
    ]);

    const response = await invoke();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.llmReviewApplied).toBe(true);
    expect(review).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "workspace-anthropic-key",
        byokModel: "claude-sonnet-4-6",
      }),
    );
    const llm = body.data.findings.filter(
      (f: { detectionMethod: string }) => f.detectionMethod === "llm",
    );
    expect(llm).toHaveLength(1);
    expect(llm[0].id).toBe("llm_1");
  });
});
