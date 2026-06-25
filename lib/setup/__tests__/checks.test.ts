import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { runAllChecks, CHECKS, pricingCheck, type CheckResult } from "../checks";
import { prisma } from "@/lib/prisma";

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

describe("welcomeEmailCheck (Resend domain probe)", () => {
  const ORIGINAL_ENV = { ...process.env };
  // Re-created in beforeEach (not once at module load): the sibling DB-gated
  // runAllChecks block runs vi.restoreAllMocks(), which would otherwise DETACH
  // this spy. Since CI now provides DATABASE_URL (#1337), that block runs and
  // strands the spy — letting welcomeEmailCheck hit the real Resend API (→ 400).
  let fetchSpy!: ReturnType<typeof vi.spyOn>;

  // The welcome-email check is the 10th registered check.
  const welcomeEmailCheck = CHECKS[9];

  function mockResendResponse(body: unknown, ok = true, status = 200) {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: ok ? status : status,
        headers: { "content-type": "application/json" },
      }),
    );
  }

  beforeEach(() => {
    // Detach any spy a prior suite left behind, then re-attach a fresh one so
    // this block is immune to sibling vi.restoreAllMocks() calls.
    vi.restoreAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockReset();
    process.env = { ...ORIGINAL_ENV };
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "RestoreAssist <noreply@restoreassist.app>";
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    fetchSpy.mockRestore();
  });

  it("returns red when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("red");
    expect(r.note).toMatch(/RESEND_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns green when SPF, DKIM and DMARC are all verified", async () => {
    mockResendResponse({
      data: [
        {
          id: "d1",
          name: "restoreassist.app",
          status: "verified",
          records: [
            { record: "SPF", status: "verified" },
            { record: "DKIM", status: "verified" },
            { record: "DMARC", status: "verified" },
          ],
        },
      ],
    });
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("green");
    expect(r.note).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/domains",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
        }),
      }),
    );
  });

  it("returns yellow when DKIM aligned but SPF or DMARC missing", async () => {
    mockResendResponse({
      data: [
        {
          name: "restoreassist.app",
          records: [
            { record: "DKIM", status: "verified" },
            { record: "SPF", status: "pending" },
            { record: "DMARC", status: "not_started" },
          ],
        },
      ],
    });
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("yellow");
    expect(r.note).toMatch(/DKIM aligned/);
    expect(r.note).toMatch(/SPF/);
    expect(r.note).toMatch(/DMARC/);
  });

  it("returns red when DKIM is not verified", async () => {
    mockResendResponse({
      data: [
        {
          name: "restoreassist.app",
          records: [
            { record: "DKIM", status: "pending" },
            { record: "SPF", status: "verified" },
            { record: "DMARC", status: "not_started" },
          ],
        },
      ],
    });
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("red");
    expect(r.note).toMatch(/no DNS records aligned/);
    expect(r.note).toMatch(/DKIM/);
    expect(r.note).toMatch(/DMARC/);
  });

  it("returns red when the From domain is not registered in Resend", async () => {
    mockResendResponse({
      data: [
        {
          name: "some-other-domain.com",
          records: [{ record: "DKIM", status: "verified" }],
        },
      ],
    });
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("red");
    expect(r.note).toMatch(/not registered in Resend/);
    expect(r.note).toMatch(/restoreassist\.app/);
  });

  it("returns red when Resend returns a non-2xx status", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("red");
    expect(r.note).toMatch(/401/);
  });

  it("returns red when the fetch throws (network failure)", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNRESET"));
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("red");
    expect(r.note).toMatch(/unreachable/);
  });

  it("extracts the domain from a plain-address RESEND_FROM_EMAIL", async () => {
    process.env.RESEND_FROM_EMAIL = "hello@example.com";
    mockResendResponse({
      data: [
        {
          name: "example.com",
          records: [
            { record: "SPF", status: "verified" },
            { record: "DKIM", status: "verified" },
            { record: "DMARC", status: "verified" },
          ],
        },
      ],
    });
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("green");
  });

  it("falls back to restoreassist.app when RESEND_FROM_EMAIL is unset", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    mockResendResponse({
      data: [
        {
          name: "restoreassist.app",
          records: [
            { record: "SPF", status: "verified" },
            { record: "DKIM", status: "verified" },
            { record: "DMARC", status: "verified" },
          ],
        },
      ],
    });
    const r = await welcomeEmailCheck("any-org");
    expect(r.status).toBe("green");
  });
});

describe("pricingCheck (unit — presence not truthiness)", () => {
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

vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: vi.fn(async () => {
    throw new Error("SECRET pdf-lib internal: /var/task/node_modules/...");
  }),
}));

describe("sampleReportRenderCheck note redaction", () => {
  let orgFindUniqueSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    orgFindUniqueSpy = vi.spyOn(
      prisma.organization,
      "findUnique",
    ) as unknown as ReturnType<typeof vi.spyOn>;
    (orgFindUniqueSpy as any).mockResolvedValue(null);
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
