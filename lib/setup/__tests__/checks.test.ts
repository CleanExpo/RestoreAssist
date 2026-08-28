import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { runAllChecks, CHECKS, pricingCheck, type CheckResult } from "../checks";
import { prisma } from "@/lib/prisma";

// Shared, hoisted flag so a single module mock can serve two suites: the
// runAllChecks suite needs the REAL pdf generator (green), while the redaction
// suite needs it to throw. vi.mock is hoisted above imports, so the flag must
// come from vi.hoisted to be referenceable inside the factory.
const pdfMock = vi.hoisted(() => ({ throwOnRender: false }));
vi.mock("@/lib/generate-iicrc-report-pdf", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/generate-iicrc-report-pdf")>();
  return {
    ...actual,
    generateIICRCReportPDF: async (...args: unknown[]) => {
      if (pdfMock.throwOnRender) {
        throw new Error("SECRET pdf-lib internal: /var/task/node_modules/...");
      }
      return (actual.generateIICRCReportPDF as (...a: unknown[]) => unknown)(
        ...args,
      );
    },
  };
});

vi.mock("@/lib/ai/model-router", () => ({
  routeBasic: vi.fn(),
}));
import { routeBasic } from "@/lib/ai/model-router";

describe.skipIf(!process.env.DATABASE_URL)("runAllChecks", () => {
  let testOrgId = "";
  let testUserId = "";

  beforeAll(async () => {
    // Create a test user + org
    const user = await prisma.user.create({
      data: { email: `checks-${Date.now()}@test.com` },
    });
    testUserId = user.id;
    const org = await prisma.organization.create({
      data: { name: "Test Org", ownerId: user.id },
    });
    testOrgId = org.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: org.id },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.organizationPricingConfig.deleteMany({
      where: { organizationId: testOrgId },
    });
    await prisma.organization
      .delete({ where: { id: testOrgId } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: AI generation returns success
    (routeBasic as any).mockResolvedValue({ text: "ok", confidence: 1 });
  });

  it("returns one result per registered check (10 total)", async () => {
    const results = await runAllChecks(testOrgId);
    expect(results).toHaveLength(CHECKS.length);
    expect(results).toHaveLength(10);
    for (const r of results) {
      expect(["green", "yellow", "red"]).toContain(r.status);
      expect(typeof r.capability).toBe("string");
      expect(typeof r.label).toBe("string");
    }
  });

  it("returns red for business_profile when required fields are missing", async () => {
    // The test org has no legalName / abn / state set
    const results = await runAllChecks(testOrgId);
    const bp = results.find((r) => r.capability === "business_profile");
    expect(bp?.status).toBe("red");
  });

  it("returns green for business_profile when required fields are populated", async () => {
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { legalName: "Test Co", state: "NSW", abn: "53004085616" },
    });
    const results = await runAllChecks(testOrgId);
    const bp = results.find((r) => r.capability === "business_profile");
    expect(bp?.status).toBe("green");
  });

  it("accepts a New Zealand profile with NZBN instead of ABN", async () => {
    await prisma.organization.update({
      where: { id: testOrgId },
      data: {
        country: "NZ",
        legalName: "Test NZ Limited",
        state: "Auckland",
        timezone: "Pacific/Auckland",
        abn: null,
        nzbn: "9429031234566",
      },
    });
    const results = await runAllChecks(testOrgId);
    const bp = results.find((r) => r.capability === "business_profile");
    expect(bp?.status).toBe("green");

    await prisma.organization.update({
      where: { id: testOrgId },
      data: {
        country: "AU",
        timezone: "Australia/Sydney",
        nzbn: null,
        abn: "53004085616",
        state: "NSW",
      },
    });
  });

  it("returns red for ai_generation when routeBasic throws", async () => {
    (routeBasic as any).mockRejectedValueOnce(new Error("gemma down"));
    const results = await runAllChecks(testOrgId);
    const ai = results.find((r) => r.capability === "ai_generation");
    expect(ai?.status).toBe("red");
  });

  it("returns yellow for cloud_storage by default (stub — not connected)", async () => {
    const results = await runAllChecks(testOrgId);
    const cs = results.find((r) => r.capability === "cloud_storage");
    expect(cs?.status).toBe("yellow");
  });

  it("does not throw when org does not exist (returns red for org-dependent checks)", async () => {
    const results = await runAllChecks("non-existent-org-id");
    expect(results).toHaveLength(10);
    const bp = results.find((r) => r.capability === "business_profile");
    expect(bp?.status).toBe("red");
  });

  it("returns green for sample_report_render when pdf-lib produces a > 1 KB buffer", async () => {
    const results = await runAllChecks(testOrgId);
    const r = results.find((r) => r.capability === "sample_report_render");
    expect(r?.status).toBe("green");
    expect(r?.label).toBe("Sample report rendering");
  });

  it("still produces a sample_report_render result when the org does not exist", async () => {
    // Org lookup returns null but the PDF generator tolerates minimal data,
    // so this should still render a valid PDF (no throw, no DB dependency).
    const results = await runAllChecks("non-existent-org-id");
    const r = results.find((r) => r.capability === "sample_report_render");
    expect(r?.status).toBe("green");
  });

  it("returns green for chain_of_custody when SHA-256 + UTC primitives work", async () => {
    const results = await runAllChecks(testOrgId);
    const r = results.find((r) => r.capability === "chain_of_custody");
    expect(r?.status).toBe("green");
    expect(r?.label).toBe("Photo chain-of-custody");
  });
});

describe("welcomeEmailCheck (Mailtrap presence)", () => {
  const ORIGINAL_ENV = { ...process.env };
  const welcomeEmailCheck = CHECKS[9];

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns red when MAILTRAP_API_KEY is not set", async () => {
    delete process.env.MAILTRAP_API_KEY;
    process.env.SENDER_EMAIL = "support@restoreassist.app";
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("red");
    expect(r.note).toMatch(/MAILTRAP_API_KEY\+SENDER_EMAIL/);
  });

  it("returns red when SENDER_EMAIL is not set", async () => {
    process.env.MAILTRAP_API_KEY = "mt_test_key";
    delete process.env.SENDER_EMAIL;
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("red");
    expect(r.note).toMatch(/MAILTRAP_API_KEY\+SENDER_EMAIL/);
  });

  it("returns green when Mailtrap Sending API is configured", async () => {
    process.env.MAILTRAP_API_KEY = "mt_test_key";
    process.env.SENDER_EMAIL = "RestoreAssist <noreply@restoreassist.app>";
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("green");
    expect(r.note).toMatch(/Mailtrap Sending API/);
    expect(r.note).toMatch(/restoreassist\.app/);
  });
});

// Spying on prisma delegate methods forces the lazy PrismaClient proxy to
// construct, which throws without DATABASE_URL (RA-7079). Gated like the
// runAllChecks suite above: runs in CI (which provisions Postgres, RA-6685),
// skips cleanly in the no-DB release-gate/local run.
describe.skipIf(!process.env.DATABASE_URL)(
  "pricingCheck (unit — presence not truthiness)",
  () => {
  let findUniqueSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    findUniqueSpy = vi.spyOn(
      prisma.organizationPricingConfig,
      "findUnique",
    ) as unknown as ReturnType<typeof vi.spyOn>;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("is green when admin fee is 0 (a legitimate waived fee)", async () => {
    (findUniqueSpy as any).mockResolvedValueOnce({
      masterQualifiedNormalHours: 40,
      administrationFee: 0,
    });
    const result = await pricingCheck("org-1");
    expect(result.status).toBe("green");
  });

  it("is red when the pricing row is missing entirely", async () => {
    (findUniqueSpy as any).mockResolvedValueOnce(null);
    const result = await pricingCheck("org-1");
    expect(result.status).toBe("red");
  });
});

describe.skipIf(!process.env.DATABASE_URL)(
  "sampleReportRenderCheck note redaction",
  () => {
  let orgFindUniqueSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Force the PDF generator to throw ONLY for this redaction suite, so the
    // sibling runAllChecks suite still exercises the real generator (green).
    pdfMock.throwOnRender = true;
    orgFindUniqueSpy = vi.spyOn(
      prisma.organization,
      "findUnique",
    ) as unknown as ReturnType<typeof vi.spyOn>;
    (orgFindUniqueSpy as any).mockResolvedValue(null);
  });

  afterEach(() => {
    pdfMock.throwOnRender = false;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("never returns the raw exception message to the client", async () => {
    const { sampleReportRenderCheck } = await import("../checks");
    const result = await sampleReportRenderCheck("org-1");
    expect(result.status).toBe("red");
    expect(result.note).not.toContain("SECRET");
    expect(result.note).toBe("Sample report rendering failed");
  });
});
