import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RA-8104 W1.3: the evidence adapter turns one report's existing rows into the
 * projection the snapshot builder consumes.
 *
 * Prisma is a small in-memory fake that always returns the whole stored report
 * (every column, including the ones the adapter must never copy), so a test
 * that checks for a leaked field is checking the adapter, not the query. The
 * grant comes from the real gate (`authoriseReportExperienceRead`): the adapter
 * only accepts a grant that gate issued.
 */

const db = vi.hoisted(() => ({
  report: null as Record<string, any> | null,
  tenants: {} as Record<string, { ownerId: string; organizationId: string | null } | null>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findUnique: vi.fn(async (args: { where: { id: string } }) =>
        db.report && db.report.id === args.where.id ? { ...db.report } : null,
      ),
      findFirst: vi.fn(async () => (db.report ? { ...db.report } : null)),
      count: vi.fn(async () => 1),
    },
    reportShareAccess: { findUnique: vi.fn(async () => null), update: vi.fn(async () => ({})) },
  },
}));

vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: vi.fn(async (userId: string) => db.tenants[userId] ?? null),
}));

vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportReach: vi.fn(async () => ({ ok: true, data: {} })),
  resolveReportFinancialReach: vi.fn(async () => ({ ok: true, data: {} })),
}));

import { authoriseReportExperienceRead } from "../authorise";
import { buildReportExperienceSnapshot } from "../snapshot";
import { buildVerifiedReportProjection } from "../evidence-adapter";

const NOW = new Date("2026-10-27T12:00:00Z");
const T1 = new Date("2026-10-20T01:00:00Z");
const T2 = new Date("2026-10-26T03:00:00Z");
const session = { user: { id: "user_a", role: "MANAGER" } };

function reading(over: Record<string, unknown>): Record<string, any> {
  return { id: "read_1", unit: "WME", moistureLevel: 18.5, sketchRoomId: "room_1", recordedAt: T1, updatedAt: T1, ...over };
}

function baseReport(): Record<string, any> {
  return {
    id: "report_001",
    userId: "user_a",
    createdAt: new Date("2026-09-15T00:00:00Z"),
    updatedAt: T2,
    reportVersion: 3,
    reportNumber: "RA-2026-0042",
    jobNumber: "JOB-9",
    status: "DRAFT",
    propertyAddress: "1 Test Street, Brisbane QLD 4000",
    // Columns the adapter must never copy.
    clientName: "SECRET-CLIENT-NAME",
    clientContactDetails: "SECRET-CLIENT-PHONE 0400 000 000",
    ownerManagementEmail: "SECRET-owner@example.test",
    technicianFieldReport: "SECRET-INTERNAL-NOTE",
    user: {
      role: "MANAGER",
      organizationId: "business_a",
      businessName: "Author Personal Co",
      email: "SECRET-author@example.test",
      organization: { owner: { businessName: "Workspace Owner Pty Ltd", businessEmail: "SECRET-biz@example.test" } },
    },
    inspection: {
      id: "insp_1",
      updatedAt: T1,
      propertyCountry: "AU",
      moistureReadings: [reading({ id: "read_1" }), reading({ id: "read_rh", unit: "RH", moistureLevel: 61 })],
      scopeItems: [{ id: "scope_1", description: "Remove wet carpet", isSelected: true, updatedAt: T1 }],
      photos: [{ id: "photo_1", url: "https://signed.example.test/SECRET?sig=abc" }],
      claimSketches: [
        {
          hazards: [{ id: "haz_1", type: "asbestos", status: "suspected", whsPathwayNote: "Isolate area", updatedAt: T1 }],
        },
      ],
    },
    estimates: [{ id: "est_1", status: "DRAFT", totalIncGST: 1234.56, version: 1, updatedAt: T1 }],
  };
}

async function grantFor(): Promise<any> {
  const decision = await authoriseReportExperienceRead({ reportId: "report_001", session });
  if (!decision.ok) throw new Error("test setup: gate refused");
  return decision.grant;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db.report = baseReport();
  db.tenants = { user_a: { ownerId: "owner_a", organizationId: "business_a" } };
});

const withoutPhotos = (list: Array<{ kind: string }>) => list.filter((o) => o.kind !== "photo");

describe("evidence adapter", () => {
  it("refuses a grant the gate did not issue", async () => {
    const forged = { ...(await grantFor()) };
    await expect(buildVerifiedReportProjection(forged)).rejects.toThrow(/grant/i);
  });

  it("refuses when the report now resolves to a different tenant", async () => {
    const grant = await grantFor();
    db.tenants.user_a = { ownerId: "owner_b", organizationId: "business_b" };
    await expect(buildVerifiedReportProjection(grant)).rejects.toThrow(/tenant/i);
  });

  it("refuses when the tenant cannot be resolved", async () => {
    const grant = await grantFor();
    db.tenants.user_a = null;
    await expect(buildVerifiedReportProjection(grant)).rejects.toThrow(/tenant/i);
  });

  it("builds a projection the snapshot builder accepts", async () => {
    const grant = await grantFor();
    const { projection, omitted } = await buildVerifiedReportProjection(grant);
    // Photos are not rendered yet, so each one is reported as not shown.
    expect(omitted).toEqual([
      { kind: "photo", id: "photo_1", reason: "Photos are not shown in this preview yet" },
    ]);
    expect(projection.reportId).toBe("report_001");
    expect(projection.organisationId).toBe(grant.organisationId);
    expect(projection.reportNumber).toBe("RA-2026-0042");
    expect(projection.workspaceBrand.businessName).toBe("Workspace Owner Pty Ltd");
    expect(projection.moistureReadings.map((r) => [r.id, r.unit, r.roomId])).toEqual([
      ["read_1", "WME", "room_1"],
      ["read_rh", "RH_PERCENT", "room_1"],
    ]);
    expect(projection.hazards).toEqual([
      { id: "haz_1", title: "asbestos", action: "Isolate area", verification: "unverified" },
    ]);
    expect(projection.scopeItems).toEqual([
      { id: "scope_1", description: "Remove wet carpet", approvalStatus: "unknown" },
    ]);
    expect(projection.financials).toEqual({ estimatedTotalCents: 123456, currency: "AUD", estimateStatus: "draft" });
    expect(projection.sourceRefs).toEqual(
      expect.arrayContaining([
        { kind: "inspection", id: "insp_1" },
        { kind: "reading", id: "read_1" },
        { kind: "scope", id: "scope_1" },
        { kind: "photo", id: "photo_1" },
      ]),
    );
    const snapshot = buildReportExperienceSnapshot(projection, grant, NOW.toISOString());
    expect(snapshot.hazards).toHaveLength(1);
    expect(snapshot.financials?.estimatedTotalCents).toBe(123456);
  });

  it("omits a reading whose stored unit does not map exactly, and says so", async () => {
    db.report!.inspection.moistureReadings.push(reading({ id: "read_pct", unit: "PERCENT_MC" }));
    db.report!.inspection.moistureReadings.push(reading({ id: "read_nounit", unit: null }));
    const { projection, omitted } = await buildVerifiedReportProjection(await grantFor());
    const ids = projection.moistureReadings.map((r) => r.id);
    expect(ids).not.toContain("read_pct");
    expect(ids).not.toContain("read_nounit");
    expect(projection.sourceRefs.map((s) => s.id)).not.toContain("read_pct");
    expect(omitted.filter((o) => o.kind === "moisture-reading").map((o) => o.id).sort()).toEqual([
      "read_nounit",
      "read_pct",
    ]);
  });

  it("omits a reading that has no room, and says so", async () => {
    db.report!.inspection.moistureReadings[0].sketchRoomId = null;
    const { projection, omitted } = await buildVerifiedReportProjection(await grantFor());
    expect(projection.moistureReadings.map((r) => r.id)).toEqual(["read_rh"]);
    expect(withoutPhotos(omitted)).toEqual([
      expect.objectContaining({ kind: "moisture-reading", id: "read_1", reason: expect.stringMatching(/room/i) }),
    ]);
  });

  it("lists readings stored in the older report format as not shown", async () => {
    db.report!.inspection.moistureReadings = [];
    db.report!.moistureReadings = JSON.stringify([
      { location: "Kitchen", value: 32, unit: "WME" },
      { location: "Hall", value: 18, unit: "WME" },
    ]);
    const { projection, omitted } = await buildVerifiedReportProjection(await grantFor());
    expect(projection.moistureReadings).toEqual([]);
    expect(withoutPhotos(omitted)).toEqual([
      {
        kind: "moisture-reading",
        reason: "2 reading(s) stored in the older report format have no room link, so they are not shown",
      },
    ]);
  });

  it("says so when older-format readings cannot be read, and is silent for an empty list", async () => {
    db.report!.moistureReadings = "not json";
    let { omitted } = await buildVerifiedReportProjection(await grantFor());
    expect(withoutPhotos(omitted)).toEqual([
      { kind: "moisture-reading", reason: "Readings stored in the older report format could not be read" },
    ]);
    db.report!.moistureReadings = "[]";
    ({ omitted } = await buildVerifiedReportProjection(await grantFor()));
    expect(withoutPhotos(omitted)).toEqual([]);
  });

  it("never assumes a site is safe: no assessment record means NOT_ASSESSED", async () => {
    db.report!.safetyPlan = "Site is safe, no hazards";
    const { projection } = await buildVerifiedReportProjection(await grantFor());
    expect(projection.safetyAssessment).toBe("NOT_ASSESSED");
  });

  it("marks a hazard resolved only when its stored status says cleared", async () => {
    db.report!.inspection.claimSketches[0].hazards.push(
      { id: "haz_2", type: "lead", status: "cleared", whsPathwayNote: null, updatedAt: T1 },
      { id: "haz_3", type: "silica", status: "sampled", whsPathwayNote: null, updatedAt: T1 },
    );
    const { projection } = await buildVerifiedReportProjection(await grantFor());
    const byId = Object.fromEntries(projection.hazards.map((h) => [h.id, h.verification]));
    expect(byId).toEqual({ haz_1: "unverified", haz_2: "resolved", haz_3: "unverified" });
  });

  it("leaves out financials and says so when the jurisdiction is unknown", async () => {
    db.report!.inspection.propertyCountry = "US";
    const { projection, omitted } = await buildVerifiedReportProjection(await grantFor());
    expect(projection.financials).toBeUndefined();
    expect(withoutPhotos(omitted)).toEqual([
      expect.objectContaining({ kind: "financials", reason: expect.stringMatching(/jurisdiction/i) }),
    ]);
  });

  it("leaves out an estimate total that is not exact to the cent", async () => {
    db.report!.estimates[0].totalIncGST = 10.005;
    const { projection, omitted } = await buildVerifiedReportProjection(await grantFor());
    expect(projection.financials).toBeUndefined();
    expect(omitted.map((o) => o.kind)).toContain("financials");
  });

  it("uses NZD for a New Zealand job", async () => {
    db.report!.inspection.propertyCountry = "NZ";
    const { projection } = await buildVerifiedReportProjection(await grantFor());
    expect(projection.financials?.currency).toBe("NZD");
  });

  it("gives no brand name when the workspace has none, so the snapshot refuses", async () => {
    db.report!.user.organization = { owner: { businessName: null } };
    db.report!.user.businessName = null;
    const grant = await grantFor();
    const { projection } = await buildVerifiedReportProjection(grant);
    expect(projection.workspaceBrand.businessName).toBe("");
    expect(() => buildReportExperienceSnapshot(projection, grant, NOW.toISOString())).toThrow(/brand/i);
  });

  it("gives no brand when the author has since moved to another organisation", async () => {
    db.report!.user.organizationId = "business_other";
    const { projection } = await buildVerifiedReportProjection(await grantFor());
    expect(projection.workspaceBrand.businessName).toBe("");
  });

  it("changes the revision when evidence under the report changes", async () => {
    const first = (await buildVerifiedReportProjection(await grantFor())).projection.revision;
    db.report!.inspection.moistureReadings[0].updatedAt = new Date("2026-10-27T11:00:00Z");
    const second = (await buildVerifiedReportProjection(await grantFor())).projection.revision;
    expect(second).not.toBe(first);
    expect(second).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,200}$/);
  });

  it("leaves a deselected scope item out and says so", async () => {
    db.report!.inspection.scopeItems.push({ id: "scope_off", description: "Not needed", isSelected: false, updatedAt: T1 });
    const { projection, omitted } = await buildVerifiedReportProjection(await grantFor());
    expect(projection.scopeItems.map((s) => s.id)).toEqual(["scope_1"]);
    expect(projection.sourceRefs.map((s) => s.id)).not.toContain("scope_off");
    expect(withoutPhotos(omitted)).toEqual([expect.objectContaining({ kind: "scope-item", id: "scope_off" })]);
  });

  it("states that no action is recorded rather than borrowing another field", async () => {
    db.report!.inspection.claimSketches[0].hazards[0].whsPathwayNote = null;
    const { projection } = await buildVerifiedReportProjection(await grantFor());
    expect(projection.hazards[0].action).toBe("No action recorded");
  });

  it("copies no sensitive field into the projection or the omitted list", async () => {
    db.report!.inspection.claimSketches[0].hazards[0].whsPathwayNote = null;
    const grant = await grantFor();
    const result = await buildVerifiedReportProjection(grant);
    const json = JSON.stringify(result);
    for (const secret of [
      "SECRET-CLIENT-NAME", "SECRET-CLIENT-PHONE", "SECRET-owner@example.test", "SECRET-INTERNAL-NOTE",
      "SECRET-author@example.test", "SECRET-biz@example.test", "signed.example.test", "clientContactDetails",
      "ownerManagementEmail",
    ]) {
      expect(json).not.toContain(secret);
    }
    const snapshot = buildReportExperienceSnapshot(result.projection, grant, NOW.toISOString());
    expect(JSON.stringify(snapshot)).not.toContain("SECRET");
  });
});
