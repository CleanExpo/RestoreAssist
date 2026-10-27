import { describe, expect, it } from "vitest";
import {
  buildReportExperienceSnapshot,
  type ReportReadGrant,
  type VerifiedReportProjection,
} from "../snapshot";

const fixture: VerifiedReportProjection = {
  reportId: "report_001",
  organisationId: "business_a",
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
const grant: ReportReadGrant = {
  reportId: "report_001",
  organisationId: "business_a",
  audience: "property-owner",
  mayViewAddress: false,
  mayViewFinancials: false,
  expiresAt: "2026-10-29T08:00:00Z",
};
const now = "2026-10-27T12:00:00Z";

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
  it("excludes financials and property address when their separate permissions are absent", () => {
    const result = buildReportExperienceSnapshot(fixture, grant, now);
    expect("financials" in result).toBe(false);
    expect("propertyAddress" in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain("27500");
    expect(JSON.stringify(result)).not.toContain("Example Street");
  });
  it("includes explicitly approved financials and address without changing safety evidence", () => {
    const result = buildReportExperienceSnapshot(fixture, {
      ...grant, audience: "manager", mayViewAddress: true, mayViewFinancials: true,
    }, now);
    expect(result.financials?.estimatedTotalCents).toBe(27500);
    expect(result.propertyAddress).toContain("Example Street");
    expect(result.hazards).toEqual(fixture.hazards);
  });
  it("denies cross-organisation and wrong-report grants", () => {
    expect(() => buildReportExperienceSnapshot(fixture, { ...grant, organisationId: "business_b" }, now)).toThrow(/mismatch/i);
    expect(() => buildReportExperienceSnapshot(fixture, { ...grant, reportId: "another_report" }, now)).toThrow(/mismatch/i);
  });
  it("rejects an expired or malformed grant without a soft fallback", () => {
    expect(() => buildReportExperienceSnapshot(fixture, { ...grant, expiresAt: now }, now)).toThrow(/expired/i);
    expect(() => buildReportExperienceSnapshot(fixture, { ...grant, expiresAt: "not-a-date" }, now)).toThrow(/expiry/i);
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
  it("produces stable but permission-specific immutable receipts", () => {
    const base = buildReportExperienceSnapshot(fixture, grant, now);
    const same = buildReportExperienceSnapshot(fixture, grant, now);
    const financial = buildReportExperienceSnapshot(fixture, { ...grant, mayViewFinancials: true }, now);
    expect(base.contentDigestSha256).toBe(same.contentDigestSha256);
    expect(base.contentDigestSha256).not.toBe(financial.contentDigestSha256);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.hazards[0])).toBe(true);
    expect(Object.isFrozen(base.sourceRefs[0])).toBe(true);
    expect(Object.isFrozen(fixture.hazards[0])).toBe(false);
  });
  it("returns no invented measurements when evidence has none", () => {
    const result = buildReportExperienceSnapshot({ ...fixture, moistureReadings: [], scopeItems: [] }, grant, now);
    expect(result.moistureReadings).toEqual([]);
    expect(result.scopeItems).toEqual([]);
    expect(result.safetyAssessment).toBe("NOT_ASSESSED");
  });
});
