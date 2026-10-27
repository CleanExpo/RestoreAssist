import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The builder accepts only grants issued by authoriseReportExperienceRead, so
 * these tests obtain every grant through that gate, with its database and
 * tenancy reads replaced by small fakes.
 */
const fake = vi.hoisted(() => ({ financial: true }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: vi.fn(async () => ({ id: "report_001", userId: "user_a", createdAt: new Date("2026-09-15T00:00:00Z") })),
      count: vi.fn(async () => (fake.financial ? 1 : 0)),
    },
    reportShareAccess: { findUnique: vi.fn(async () => null), update: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportReach: vi.fn(async () => ({ ok: true, data: {} })),
  resolveReportFinancialReach: vi.fn(async () => ({ ok: true, data: {} })),
}));
vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: vi.fn(async () => ({ ownerId: "owner_a", organizationId: "business_a" })),
}));

import { authoriseReportExperienceRead } from "../authorise";
import {
  buildReportExperienceSnapshot,
  type ReportReadGrant,
  type VerifiedReportProjection,
} from "../snapshot";

const fixture: VerifiedReportProjection = {
  reportId: "report_001",
  organisationId: "org_business_a",
  revision: "rev-a",
  revisionCreatedAt: "2026-10-27T08:00:00Z",
  reportNumber: "SAMPLE-001",
  status: "DRAFT",
  workspaceBrand: { businessName: "Synthetic Test Organisation", approvedLogoAssetId: "logo_123" },
  propertyAddress: "1 Example Street (synthetic)",
  safetyAssessment: "NOT_ASSESSED",
  hazards: [{ id: "hazard_1", title: "Electrical hazard unverified", action: "Inspection required", verification: "unverified" }],
  moistureReadings: [{ id: "reading_1", roomId: "living_1", observedAt: "2026-10-27T08:00:00Z", value: 28.6, unit: "WME" }],
  scopeItems: [{ id: "scope_1", description: "Inspection", approvalStatus: "proposed" }],
  financials: { estimatedTotalCents: 27500, currency: "AUD", estimateStatus: "draft" },
  sourceRefs: [{ kind: "inspection", id: "inspection_1" }, { kind: "reading", id: "reading_1" }],
};
const NOW = new Date("2026-10-27T12:00:00Z");
const now = NOW.toISOString();

async function grantFor(financial: boolean): Promise<ReportReadGrant> {
  fake.financial = financial;
  const result = await authoriseReportExperienceRead({
    reportId: "report_001",
    session: { user: { id: "user_t", role: "USER" } },
  });
  if (!result.ok) throw new Error("expected a grant");
  return result.grant;
}

let grant: ReportReadGrant;
let moneyGrant: ReportReadGrant;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  grant = await grantFor(false);
  moneyGrant = await grantFor(true);
});

describe("authorised report snapshot", () => {
  it("keeps original evidence values, provenance and missing safety state", () => {
    const result = buildReportExperienceSnapshot(fixture, grant, now);
    expect(result.safetyAssessment).toBe("NOT_ASSESSED");
    expect(result.moistureReadings[0].value).toBe(28.6);
    expect(result.moistureReadings[0].unit).toBe("WME");
    expect(result.sourceRefs[1].id).toBe("reading_1");
    expect(result.schemaVersion).toBe(1);
    expect(result.contentDigestSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("excludes financials when the money permission is absent", () => {
    const result = buildReportExperienceSnapshot(fixture, grant, now);
    expect(grant.mayViewFinancials).toBe(false);
    expect("financials" in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain("27500");
  });
  it("includes approved financials and address without changing safety evidence", () => {
    const result = buildReportExperienceSnapshot(fixture, moneyGrant, now);
    expect(result.financials?.estimatedTotalCents).toBe(27500);
    expect(result.propertyAddress).toContain("Example Street");
    expect(result.hazards).toEqual(fixture.hazards);
  });
  it("denies evidence from another organisation or another report", () => {
    expect(() => buildReportExperienceSnapshot({ ...fixture, organisationId: "org_business_b" }, grant, now)).toThrow(/mismatch/i);
    expect(() => buildReportExperienceSnapshot({ ...fixture, reportId: "another_report" }, grant, now)).toThrow(/mismatch/i);
  });
  it("rejects a grant once it has expired, without a soft fallback", () => {
    const later = new Date(Date.parse(grant.expiresAt) + 1000).toISOString();
    expect(() => buildReportExperienceSnapshot(fixture, grant, later)).toThrow(/expired/i);
    expect(() => buildReportExperienceSnapshot(fixture, grant, "not-a-date")).toThrow(/reference time/i);
  });
  it("rejects an expired grant even when the caller passes an old reference time", () => {
    vi.setSystemTime(Date.parse(grant.expiresAt) + 60_000);
    expect(() => buildReportExperienceSnapshot(fixture, grant, now)).toThrow(/expired/i);
  });
  it("fails invalid measurements and negative costs instead of generating corrected values", () => {
    expect(() => buildReportExperienceSnapshot({
      ...fixture, moistureReadings: [{ ...fixture.moistureReadings[0], value: Number.NaN }],
    }, grant, now)).toThrow(/reading/i);
    expect(() => buildReportExperienceSnapshot({
      ...fixture, financials: { estimatedTotalCents: -5, currency: "AUD", estimateStatus: "draft" },
    }, grant, now)).toThrow(/money/i);
  });
  it("will not accept a raw URL or token as a source reference ID", () => {
    expect(() => buildReportExperienceSnapshot({
      ...fixture, sourceRefs: [{ kind: "photo", id: "https://secret.example/p?token=sensitive" }],
    }, grant, now)).toThrow(/source ID/i);
  });
  it("requires real organisation branding and does not substitute report author's name", () => {
    expect(() => buildReportExperienceSnapshot({
      ...fixture, workspaceBrand: { businessName: " " },
    }, grant, now)).toThrow(/organisation brand/i);
  });
  it.each([
    ["an empty", ""],
    ["a null", null],
  ])("rejects %s approved logo ID instead of copying it", (_name, logo) => {
    expect(() => buildReportExperienceSnapshot({
      ...fixture, workspaceBrand: { businessName: "Synthetic Test Organisation", approvedLogoAssetId: logo },
    } as VerifiedReportProjection, grant, now)).toThrow(/logo asset ID/i);
  });
  it("produces stable but permission-specific immutable receipts", () => {
    const base = buildReportExperienceSnapshot(fixture, grant, now);
    const same = buildReportExperienceSnapshot(fixture, grant, now);
    const financial = buildReportExperienceSnapshot(fixture, moneyGrant, now);
    expect(base.contentDigestSha256).toBe(same.contentDigestSha256);
    expect(base.contentDigestSha256).not.toBe(financial.contentDigestSha256);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.hazards[0])).toBe(true);
    expect(Object.isFrozen(base.sourceRefs[0])).toBe(true);
    expect(Object.isFrozen(fixture.hazards[0])).toBe(false);
  });
  // A runtime record can carry fields its TypeScript shape does not declare.
  // The snapshot is a disclosure boundary, so only declared fields may cross it.
  const SECRET = "https://private.example/secret-sentinel";
  it.each([
    ["source references", { sourceRefs: [{ ...fixture.sourceRefs[0], signedUrl: SECRET }] }],
    ["hazards", { hazards: [{ ...fixture.hazards[0], internalNote: SECRET }] }],
    ["moisture readings", { moistureReadings: [{ ...fixture.moistureReadings[0], rawDeviceUrl: SECRET }] }],
    ["scope items", { scopeItems: [{ ...fixture.scopeItems[0], supplierCostUrl: SECRET }] }],
    ["workspace brand", { workspaceBrand: { ...fixture.workspaceBrand, logoSignedUrl: SECRET } }],
    ["financials", { financials: { ...fixture.financials!, marginNote: SECRET } }],
  ])("copies only declared fields from %s into the snapshot", (_name, extra) => {
    const result = buildReportExperienceSnapshot({ ...fixture, ...extra } as VerifiedReportProjection, moneyGrant, now);
    expect(JSON.stringify(result)).not.toContain("secret-sentinel");
  });
  it("returns no invented measurements when evidence has none", () => {
    const result = buildReportExperienceSnapshot({ ...fixture, moistureReadings: [], scopeItems: [] }, grant, now);
    expect(result.moistureReadings).toEqual([]);
    expect(result.scopeItems).toEqual([]);
    expect(result.safetyAssessment).toBe("NOT_ASSESSED");
  });
});
