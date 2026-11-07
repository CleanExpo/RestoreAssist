/**
 * L-2 paid-base-plan vs Founding Trial: reports/upload is a paid-plan feature.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const featureEntitlementFindFirst = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const extractReportFromUpload = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    featureEntitlement: {
      findFirst: (...args: unknown[]) => featureEntitlementFindFirst(...args),
    },
  },
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
vi.mock("@/lib/services/ai/extract-report-from-upload", () => ({
  extractReportFromUpload: (...args: unknown[]) =>
    extractReportFromUpload(...args),
}));

import { POST } from "../route";
import { COMPLIMENTARY_PRICE_ID } from "@/lib/billing/founding-trial-grant";

const DAY = 24 * 60 * 60 * 1000;

function pdfFile() {
  const bytes = Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.alloc(200, 0x20),
    Buffer.from("\n%%EOF\n"),
  ]);
  return new File([bytes], "report.pdf", { type: "application/pdf" });
}

function makeRequest() {
  const form = new FormData();
  form.append("file", pdfFile());
  return new NextRequest("http://localhost/api/reports/upload", {
    method: "POST",
    body: form,
  });
}

function seedOwner(opts: {
  status: string;
  trialEndsAt: Date | null;
  founding: boolean;
}) {
  userFindUnique.mockResolvedValue({
    id: "user-1",
    role: "ADMIN",
    organizationId: "org-a",
    organization: { ownerId: "user-1" },
    subscriptionStatus: opts.status,
    trialEndsAt: opts.trialEndsAt,
    lifetimeAccess: false,
    creditsRemaining: 10,
  });
  featureEntitlementFindFirst.mockImplementation(
    async (args: { where?: { stripePriceId?: string } } = {}) =>
      opts.founding && args.where?.stripePriceId === COMPLIMENTARY_PRICE_ID
        ? { id: "fe_1" }
        : null,
  );
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  featureEntitlementFindFirst.mockReset();
  resolveWorkspaceAiKey.mockReset();
  extractReportFromUpload.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws-1",
    apiKey: "anthropic-key",
  });
  extractReportFromUpload.mockResolvedValue({
    ok: true,
    data: { parsedData: { clientName: "Acme", fullText: "extracted" } },
  });
  featureEntitlementFindFirst.mockResolvedValue(null);
});

describe("POST /api/reports/upload — founding-trial grant", () => {
  it("unexpired founding-trial grant gets 200", async () => {
    seedOwner({
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() + 40 * DAY),
      founding: true,
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("expired founding-trial grant gets 402", async () => {
    seedOwner({
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() - DAY),
      founding: true,
    });
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(402);
    // hasActiveSubscription runs first; an expired trial never reaches
    // requirePaidBasePlan.
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Active subscription required");
  });
});
