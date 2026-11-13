/**
 * RA-8281 review round 2 (P1-ASSESSMENT-PRICING-USES-ACTOR). An assessment
 * is priced at the rates of the business that owns the inspection (RA-7893),
 * never at the rates of whoever clicks Generate. The real resolvers run end
 * to end: resolveInspectionPriceList, resolveEffectivePricing and
 * resolveReportPricing. Only Prisma reads, the tenant lookup and GST are
 * stubbed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    organizationPricingConfig: { findUnique: vi.fn() },
    companyPricingConfig: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/organization-credits", async (orig) => ({
  ...(await orig<typeof import("@/lib/organization-credits")>()),
  getResourceTenant: vi.fn(),
}));
vi.mock("@/lib/assessments/gst", async () => {
  const { getGstTreatment } = await import("@/lib/gst-rules");
  return { gstForInspection: vi.fn(async () => getGstTreatment("AU")) };
});

import { prisma } from "@/lib/prisma";
import { getResourceTenant } from "@/lib/organization-credits";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import { sqmToSqft } from "@/lib/units";
import { waterDomain } from "../domains/water";
import { mouldDomain } from "../domains/mould";
import { stormDomain } from "../domains/storm";
import { biohazardDomain } from "../domains/biohazard";
import { hvacDomain } from "../domains/hvac";
import { australianComplianceDomain } from "../domains/australian-compliance";
import { fireSmokeDomain } from "../domains/fire-smoke";
import type { DomainPlugin, EstimateLine } from "../types";

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  inspection: { findUnique: Fn };
  user: { findUnique: Fn };
  organizationPricingConfig: { findUnique: Fn };
  companyPricingConfig: { findUnique: Fn };
};
const tenantOf = getResourceTenant as unknown as Fn;

const OWNER = "u_owner";
const MEMBER = "u_member";
const ORG = "org_1";
const CREATED = new Date("2026-10-01T00:00:00Z");

/** Every NRPG field at one point inside its national range, to the cent. */
function priceListAt(weight: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(NRPG_RATE_RANGES).map(([field, r]) => [
      field,
      Math.round((r.min * (1 - weight) + r.max * weight) * 100) / 100,
    ]),
  );
}
const OWNER_LIST = priceListAt(0.3);
const MEMBER_LIST = priceListAt(0.8);
const ORG_LIST = priceListAt(0.55);

function inspectionCreatedBy(creator: string) {
  return {
    id: "i_1",
    userId: creator,
    createdAt: CREATED,
    propertyAddress: "12 Smith St, Brisbane QLD 4000",
    propertyPostcode: "4000",
    classifications: [{ category: "2", class: "2" }],
    affectedAreas: [
      { affectedAreaSqm: 20, affectedSquareFootage: sqmToSqft(20) },
    ],
    moistureReadings: [],
    _count: { contentsPackOutItems: 0 },
  };
}

/**
 * Owner and member both belong to ORG. Each has a legacy price list of their
 * own; the organisation has one only when `orgList` is given.
 */
function business(opts: {
  creator: string;
  orgList: Record<string, number> | null;
  tenant: { ownerId: string; organizationId: string | null } | null;
}) {
  db.inspection.findUnique.mockResolvedValue(inspectionCreatedBy(opts.creator));
  db.user.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      where.id === OWNER || where.id === MEMBER ? { organizationId: ORG } : null,
  );
  db.organizationPricingConfig.findUnique.mockImplementation(
    async ({ where }: { where: { organizationId: string } }) =>
      where.organizationId === ORG ? opts.orgList : null,
  );
  db.companyPricingConfig.findUnique.mockImplementation(
    async ({ where }: { where: { userId: string } }) =>
      where.userId === OWNER
        ? OWNER_LIST
        : where.userId === MEMBER
          ? MEMBER_LIST
          : null,
  );
  tenantOf.mockResolvedValue(opts.tenant);
}

beforeEach(() => {
  for (const m of [
    db.inspection.findUnique,
    db.user.findUnique,
    db.organizationPricingConfig.findUnique,
    db.companyPricingConfig.findUnique,
    tenantOf,
  ]) {
    m.mockReset();
  }
});

async function estimateAs(
  actor: string,
  domain: DomainPlugin,
  options: Record<string, unknown> | null,
) {
  const r = await domain.generate({
    inspectionId: "i_1",
    workspaceId: "ws_1",
    userId: actor,
    options,
  });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.message);
  return r.data.estimate;
}

function pricedLines(lines: EstimateLine[]) {
  return lines.filter((l) => l.pricingStatus === "priced");
}

function expectPricedFrom(
  lines: EstimateLine[],
  list: Record<string, number>,
  pricesLines: boolean,
) {
  const rates = new Set(Object.values(list));
  const priced = pricedLines(lines);
  if (pricesLines) expect(priced.length).toBeGreaterThan(0);
  for (const l of priced) {
    expect(rates.has(l.rate as number)).toBe(true);
  }
  for (const l of lines) {
    expect(l.rate).not.toBe(0);
    expect(l.lineTotalExGst).not.toBe(0);
  }
}

const DOMAINS: {
  name: string;
  domain: DomainPlugin;
  options: Record<string, unknown> | null;
  /** False where no line has a price-list field yet (hvac, compliance). */
  pricesLines: boolean;
}[] = [
  { name: "water", domain: waterDomain, options: null, pricesLines: true },
  {
    name: "mould",
    domain: mouldDomain,
    options: { condition: "CONDITION_3", ambientRelativeHumidity: 70 },
    pricesLines: true,
  },
  {
    name: "storm",
    domain: stormDomain,
    options: { entryType: "roof_penetration", waterCategory: 2 },
    pricesLines: true,
  },
  {
    name: "biohazard",
    domain: biohazardDomain,
    options: { biohazardType: "sewage_overflow" },
    pricesLines: true,
  },
  {
    name: "hvac",
    domain: hvacDomain,
    options: { systemType: "ducted_residential", condition: "MICROBIAL_GROWTH" },
    pricesLines: false,
  },
  {
    name: "australian-compliance",
    domain: australianComplianceDomain,
    options: null,
    pricesLines: false,
  },
  {
    name: "fire-smoke",
    domain: fireSmokeDomain,
    options: {
      smokeType: "wet",
      charLevel: 2,
      technicians: 2,
      supervisors: 1,
      buildingDays: 2,
      contentsDays: 1,
      airScrubbers: 2,
      hepaVacuumUnitDays: 2,
      ozoneUnitDays: 2,
    },
    pricesLines: true,
  },
];

describe.each(DOMAINS)(
  "$name is priced at the inspection business's rates, not the actor's",
  ({ domain, options, pricesLines }) => {
    it("the owner and an invited member generating the owner's inspection get the same estimate, at the owner's rates", async () => {
      business({
        creator: OWNER,
        orgList: null,
        tenant: { ownerId: OWNER, organizationId: null },
      });
      const byOwner = await estimateAs(OWNER, domain, options);
      const byMember = await estimateAs(MEMBER, domain, options);
      expect(byMember).toEqual(byOwner);
      expectPricedFrom(byOwner.lines, OWNER_LIST, pricesLines);
    });

    it("a member-created inspection with no organisation pricing uses the owner's legacy rates, never the member's own", async () => {
      business({
        creator: MEMBER,
        orgList: null,
        tenant: { ownerId: OWNER, organizationId: ORG },
      });
      const byMember = await estimateAs(MEMBER, domain, options);
      const byOwner = await estimateAs(OWNER, domain, options);
      expect(byOwner).toEqual(byMember);
      expectPricedFrom(byMember.lines, OWNER_LIST, pricesLines);
    });

    it("the organisation's own price list wins over the owner's legacy rates", async () => {
      business({
        creator: MEMBER,
        orgList: ORG_LIST,
        tenant: { ownerId: OWNER, organizationId: ORG },
      });
      const byMember = await estimateAs(MEMBER, domain, options);
      const byOwner = await estimateAs(OWNER, domain, options);
      expect(byOwner).toEqual(byMember);
      expectPricedFrom(byMember.lines, ORG_LIST, pricesLines);
    });

    it("an inspection whose business cannot be proven prices nothing and blocks the total", async () => {
      business({ creator: MEMBER, orgList: ORG_LIST, tenant: null });
      for (const actor of [OWNER, MEMBER]) {
        const est = await estimateAs(actor, domain, options);
        expect(est.lines.length).toBeGreaterThan(0);
        for (const l of est.lines) {
          expect(l.rate).toBeNull();
          expect(l.lineTotalExGst).toBeNull();
        }
        expect(est.totals.status).toBe("blocked");
        expect(est.totals.subtotalExGst).toBeNull();
        expect(est.totals.totalIncGst).toBeNull();
      }
    });
  },
);
