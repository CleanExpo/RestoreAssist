import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

// RA-7727: the structured report header carries the BUSINESS — the workspace
// owner's saved business details — whoever in the workspace generates it.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const reportUpdate = vi.fn();
const resolveReportProvider = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    report: {
      findUnique: (...args: unknown[]) => reportFindUnique(...args),
      update: (...args: unknown[]) => reportUpdate(...args),
    },
  },
}));
vi.mock("../provider", () => ({
  resolveReportProvider: (...args: unknown[]) => resolveReportProvider(...args),
}));
vi.mock("@/lib/ai-provider", () => ({
  getLatestAIIntegration: vi.fn().mockResolvedValue(null),
  callAIProvider: vi.fn(),
}));
// Retrieval is best-effort in the route (each call sits in its own try/catch);
// failing it keeps the test off the network.
vi.mock("@/lib/standards-retrieval", () => ({
  retrieveRelevantStandards: vi.fn().mockRejectedValue(new Error("offline")),
  buildStandardsContextPrompt: vi.fn(),
}));
vi.mock("@/lib/rag/retrieve", () => ({
  retrieveForCitation: vi.fn().mockRejectedValue(new Error("offline")),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { POST } from "../route";

function makeRequest() {
  return new NextRequest(
    "http://localhost/api/reports/generate-inspection-report",
    {
      method: "POST",
      body: JSON.stringify({ reportId: "report-1", reportType: "basic" }),
      headers: { "Content-Type": "application/json" },
    },
  );
}

function minimalReport(userId: string) {
  return {
    id: "report-1",
    userId,
    technicianReportAnalysis: null,
    tier1Responses: null,
    tier2Responses: null,
    tier3Responses: null,
    psychrometricAssessment: null,
    scopeAreas: null,
    equipmentSelection: null,
    propertyPostcode: "4000",
    reportDepthLevel: "Basic",
    client: { company: "Acme", name: "Pat" },
    inspection: { propertyCountry: "AU" },
    authorityForms: [],
  };
}

function sessionAs(userId: string, fixture = makeTwoWorkspaces()) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
  // Scope-sensitive: the row is looked up by the id the route asks for and
  // projected through the route's own select.
  userFindUnique.mockImplementation(
    async (args: { where: { id: string }; select: Record<string, unknown> }) => {
      const row = fixture.userRow(args.where.id);
      return row
        ? { ...(project(row, args.select) as object), subscriptionStatus: "TRIAL" }
        : null;
    },
  );
  reportFindUnique.mockResolvedValue(minimalReport(userId));
}

async function header() {
  const res = await POST(makeRequest());
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.report.structuredData.header as Record<string, unknown>;
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  reportFindUnique.mockReset();
  reportUpdate.mockReset();
  resolveReportProvider.mockReset();
  reportUpdate.mockResolvedValue({});
  resolveReportProvider.mockResolvedValue({
    id: "conn-1",
    name: "Anthropic",
    apiKey: "test-key-not-a-secret",
    provider: "anthropic",
  });
});

describe("POST generate-inspection-report — business header (RA-7727)", () => {
  it("control: the owner's own report carries the owner's business name", async () => {
    sessionAs("owner-a");
    const h = await header();
    expect(h.businessName).toBe("Harbour Restorations");
  });

  it("a technician's report carries the workspace owner's business details", async () => {
    sessionAs("tech-a");
    const h = await header();
    expect(h.businessName).toBe("Harbour Restorations");
    expect(h.businessABN).toBe("11 111 111 111");
    expect(h.businessPhone).toBe("0400 000 001");
  });

  it("never carries another workspace's business details", async () => {
    sessionAs("tech-a");
    const h = await header();
    expect(JSON.stringify(h)).not.toMatch(/Rival/);
  });

  it("falls back to the author's own details when the owner saved none", async () => {
    sessionAs(
      "tech-a",
      makeTwoWorkspaces({
        users: {
          "owner-a": { businessName: null },
          "tech-a": { businessName: "Tess Drying Services" },
        },
      }),
    );
    const h = await header();
    expect(h.businessName).toBe("Tess Drying Services");
  });
});
