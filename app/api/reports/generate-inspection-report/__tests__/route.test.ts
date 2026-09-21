import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  REPORT_GEN_PLATFORM_NOT_READY_BODY,
  reportGenByokRequiredBody,
} from "@/lib/signup-pricing-honesty";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const resolveReportProvider = vi.fn();
const getLatestAIIntegration = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const describePlatformTrialCoverage = vi.fn();
const tryPlatformTrialApiKey = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    report: {
      findUnique: (...args: unknown[]) => reportFindUnique(...args),
    },
  },
}));
vi.mock("../provider", () => ({
  resolveReportProvider: (...args: unknown[]) => resolveReportProvider(...args),
}));
vi.mock("@/lib/ai-provider", () => ({
  getLatestAIIntegration: (...args: unknown[]) =>
    getLatestAIIntegration(...args),
  callAIProvider: vi.fn(),
}));
vi.mock("@/lib/ai/platform-trial-credential", () => ({
  describePlatformTrialCoverage: (...args: unknown[]) =>
    describePlatformTrialCoverage(...args),
  tryPlatformTrialApiKey: (...args: unknown[]) =>
    tryPlatformTrialApiKey(...args),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ai/resolve-workspace-ai-key")
  >("@/lib/ai/resolve-workspace-ai-key");
  return {
    ...actual,
    resolveWorkspaceAiKey: (...args: unknown[]) =>
      resolveWorkspaceAiKey(...args),
  };
});

import { POST } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";

const PAID_COVERAGE = {
  fundedTrial: false,
  platformKeyPresent: true,
  canUsePlatformTrial: false,
};

const FUNDED_MISSING_PLATFORM = {
  fundedTrial: true,
  platformKeyPresent: false,
  canUsePlatformTrial: false,
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost/api/reports/generate-inspection-report",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}

function trialUser() {
  return {
    id: "user-1",
    name: "Taylor",
    email: "taylor@example.com",
    businessName: null,
    businessAddress: null,
    businessLogo: null,
    businessABN: null,
    businessPhone: null,
    businessEmail: null,
    subscriptionStatus: "TRIAL",
    pricingConfig: null,
  };
}

function minimalReport() {
  return {
    id: "report-1",
    userId: "user-1",
    technicianReportAnalysis: null,
    tier1Responses: null,
    tier2Responses: null,
    tier3Responses: null,
    psychrometricAssessment: null,
    scopeAreas: null,
    equipmentSelection: null,
    propertyPostcode: "4000",
    reportDepthLevel: "Enhanced",
    client: { company: "Acme", name: "Pat" },
    inspection: { propertyCountry: "AU" },
    authorityForms: [],
  };
}

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  reportFindUnique.mockReset();
  resolveReportProvider.mockReset();
  getLatestAIIntegration.mockReset();
  resolveWorkspaceAiKey.mockReset();
  describePlatformTrialCoverage.mockReset();
  tryPlatformTrialApiKey.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(trialUser());
  reportFindUnique.mockResolvedValue(minimalReport());
  resolveReportProvider.mockResolvedValue(null);
  getLatestAIIntegration.mockResolvedValue(null);
  describePlatformTrialCoverage.mockResolvedValue(PAID_COVERAGE);
  tryPlatformTrialApiKey.mockResolvedValue(null);
});

describe("POST /api/reports/generate-inspection-report — RA-7601 400 copy", () => {
  it("paid workspace 400 still says add-your-key", async () => {
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new Error("decrypt failed — do not leak"),
    );

    const res = await POST(makeRequest({ reportId: "report-1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toBe(reportGenByokRequiredBody("ANTHROPIC"));
    expect(body.error.message).not.toMatch(/decrypt failed/i);
  });

  it("funded-trial platform miss 400 does not say add-a-key", async () => {
    describePlatformTrialCoverage.mockResolvedValue(FUNDED_MISSING_PLATFORM);
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new Error("store unavailable — do not leak"),
    );

    const res = await POST(makeRequest({ reportId: "report-1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toBe(REPORT_GEN_PLATFORM_NOT_READY_BODY);
    expect(body.error.message).not.toMatch(/add your/i);
    expect(body.error.message).not.toMatch(/add an anthropic or openai key/i);
    expect(body.error.message).not.toMatch(/store unavailable/i);
  });

  it("funded trial with a present platform key still is not told to add a key", async () => {
    describePlatformTrialCoverage.mockResolvedValue({
      fundedTrial: true,
      platformKeyPresent: true,
      canUsePlatformTrial: true,
    });
    resolveWorkspaceAiKey.mockRejectedValueOnce(new Error("unexpected miss"));

    const res = await POST(makeRequest({ reportId: "report-1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.message).toBe(REPORT_GEN_PLATFORM_NOT_READY_BODY);
    expect(body.error.message).not.toMatch(/add your/i);
  });

  it("NoWorkspaceKeyError still returns 402 with the classified message", async () => {
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC", "PLATFORM_NOT_READY"),
    );

    const res = await POST(makeRequest({ reportId: "report-1" }));
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.error.code).toBe("PAYMENT_REQUIRED");
    expect(body.error.message).toBe(REPORT_GEN_PLATFORM_NOT_READY_BODY);
    expect(body.error.message).not.toMatch(/add your/i);
  });
});
