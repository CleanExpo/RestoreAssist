import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getResourceTenant } from "@/lib/organization-credits";
import { WORKSPACE_OWNER_SELECT, workspaceBusiness } from "@/lib/reports/workspace-business";
import { isIssuedReportReadGrant, reportTenantKey } from "./authorise";
import {
  INSPECTION_FIELDS,
  INSPECTION_LINKS,
  REPORT_FIELDS,
  REPORT_LINKS,
  inventoryOmissions,
  inventorySelect,
} from "./evidence-inventory";
import type { ReportReadGrant, VerifiedReportProjection } from "./snapshot";

/**
 * RA-8104 W1.3: builds the projection the snapshot builder consumes from ONE
 * report's existing rows. No new table, no migration, no network call.
 *
 * Where the evidence lives (same links the PDF route uses,
 * `app/api/reports/[id]/pdf/route.ts`): `Report` -> `Inspection` through
 * `Inspection.reportId` (unique, main `prisma/schema.prisma`; the model of the
 * same name in `prisma/tenant/schema.prisma` is a read-shadow of the inspection
 * header only and carries no evidence). From the inspection: `MoistureReading`,
 * `ScopeItem`, `InspectionPhoto`, and `ClaimSketch` -> `Hazard`. The estimate
 * hangs off `Report.estimates`.
 *
 * Rule for every mapping: use a stored value only when it says exactly what
 * the projection field says. Anything found but not mappable faithfully goes
 * into `omitted` with a reason. Nothing is dropped silently and nothing is
 * coerced into a neighbouring category.
 */
export type OmittedEvidence = { kind: string; id?: string; reason: string };

export type ReportEvidenceResult = {
  projection: VerifiedReportProjection;
  omitted: OmittedEvidence[];
};

/** Bounds one report's lists so a single large job cannot exhaust memory. */
const LIST_LIMIT = 1000;

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

// MoistureReading.unit is "PERCENT_MC" | "WME" | "RH" | "CELSIUS" (or null).
// PERCENT_MC is a different quantity from WME, and null says nothing, so
// neither is mapped. G_PER_KG is accepted should a writer ever store it.
const READING_UNITS: Readonly<Record<string, "WME" | "RH_PERCENT" | "G_PER_KG" | "CELSIUS">> = {
  WME: "WME",
  RH: "RH_PERCENT",
  G_PER_KG: "G_PER_KG",
  CELSIUS: "CELSIUS",
};

const CURRENCY_BY_COUNTRY: Readonly<Record<string, "AUD" | "NZD">> = { AU: "AUD", NZ: "NZD" };

// EstimateStatus has more states (INTERNAL_REVIEW, SENT, ...). Only these two
// say exactly what the projection says.
const ESTIMATE_STATUS: Readonly<Record<string, "draft" | "approved">> = {
  DRAFT: "draft",
  APPROVED: "approved",
};

/**
 * Readings in the older report format: JSON text on Report.moistureReadings.
 * Those entries carry no link to a sketch room, so they cannot be mapped
 * without guessing. Returns how many there are, or -1 when the text is not a
 * JSON list.
 */
function countLegacyReadings(text: string | null): number {
  if (!text || !text.trim()) return 0;
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.length : -1;
  } catch {
    return -1;
  }
}

function describeLimit(kind: string, shown: number): OmittedEvidence {
  return { kind, reason: "More than " + shown + " records stored; only the first " + shown + " are included" };
}

export async function buildVerifiedReportProjection(grant: ReportReadGrant): Promise<ReportEvidenceResult> {
  if (!isIssuedReportReadGrant(grant)) throw new Error("Denied: grant not issued by the server gate");
  const reportId = grant.reportId;

  // Step 1: ownership only, before any evidence is read into memory.
  const head = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, userId: true, createdAt: true },
  });
  if (!head) throw new Error("Report not found");
  const tenant = await getResourceTenant(head.userId, head.createdAt);
  if (!tenant || reportTenantKey(tenant) !== grant.organisationId) {
    throw new Error("Denied: report tenant does not match the grant");
  }

  // Step 2: the evidence, by the same report id.
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      updatedAt: true,
      reportVersion: true,
      // Stored identifiers, in order of preference. reportNumber is what the
      // PDF prints as the report's number; jobNumber is the firm's own job
      // reference; the report id is the last resort and is always present.
      reportNumber: true,
      jobNumber: true,
      status: true,
      propertyAddress: true,
      // Older reports keep readings as JSON text here (the PDF falls back to it).
      moistureReadings: true,
      user: {
        select: {
          organizationId: true,
          businessName: true,
          ...WORKSPACE_OWNER_SELECT,
        },
      },
      estimates: {
        orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
        take: 1,
        select: { id: true, status: true, totalIncGST: true, updatedAt: true },
      },
      inspection: {
        select: {
          id: true,
          updatedAt: true,
          propertyCountry: true,
          moistureReadings: {
            where: { invalidatedAt: null },
            orderBy: { recordedAt: "asc" },
            take: LIST_LIMIT + 1,
            select: { id: true, unit: true, moistureLevel: true, sketchRoomId: true, recordedAt: true, updatedAt: true },
          },
          scopeItems: {
            orderBy: { createdAt: "asc" },
            take: LIST_LIMIT + 1,
            select: { id: true, description: true, isSelected: true, updatedAt: true },
          },
          photos: {
            orderBy: { timestamp: "asc" },
            take: LIST_LIMIT + 1,
            select: { id: true },
          },
          claimSketches: {
            select: {
              hazards: {
                orderBy: { createdAt: "asc" },
                take: LIST_LIMIT + 1,
                select: { id: true, type: true, status: true, whsPathwayNote: true, updatedAt: true },
              },
            },
          },
        },
      },
    },
  });
  if (!report) throw new Error("Report not found");

  const omitted: OmittedEvidence[] = [];
  const inspection = report.inspection;
  if (!inspection) {
    omitted.push({ kind: "inspection", reason: "No inspection is linked to this report" });
  }

  // Newest change anywhere under the report. Row counts catch a deletion.
  let latest = report.updatedAt.getTime();
  const bump = (d: Date | null | undefined) => {
    if (d && d.getTime() > latest) latest = d.getTime();
  };

  const readingRows = inspection?.moistureReadings ?? [];
  const legacyReadings = countLegacyReadings(report.moistureReadings);
  if (legacyReadings === -1) {
    omitted.push({ kind: "moisture-reading", reason: "Readings stored in the older report format could not be read" });
  } else if (legacyReadings > 0) {
    omitted.push({
      kind: "moisture-reading",
      reason:
        legacyReadings +
        " reading(s) stored in the older report format have no room link, so they are not shown",
    });
  }
  if (readingRows.length > LIST_LIMIT) omitted.push(describeLimit("moisture-reading", LIST_LIMIT));
  const moistureReadings: Array<VerifiedReportProjection["moistureReadings"][number]> = [];
  for (const row of readingRows.slice(0, LIST_LIMIT)) {
    bump(row.updatedAt);
    const unit = row.unit ? READING_UNITS[row.unit] : undefined;
    if (!unit) {
      omitted.push({
        kind: "moisture-reading",
        id: row.id,
        reason: row.unit ? "Stored unit does not map exactly to a supported unit" : "No unit stored",
      });
    } else if (!row.sketchRoomId || !ID.test(row.sketchRoomId)) {
      omitted.push({ kind: "moisture-reading", id: row.id, reason: "Reading is not linked to a room" });
    } else if (!Number.isFinite(row.moistureLevel)) {
      omitted.push({ kind: "moisture-reading", id: row.id, reason: "Stored value is not a finite number" });
    } else {
      moistureReadings.push({
        id: row.id,
        roomId: row.sketchRoomId,
        observedAt: row.recordedAt.toISOString(),
        value: row.moistureLevel,
        unit,
      });
    }
  }

  const scopeRows = inspection?.scopeItems ?? [];
  if (scopeRows.length > LIST_LIMIT) omitted.push(describeLimit("scope-item", LIST_LIMIT));
  const scopeItems: Array<VerifiedReportProjection["scopeItems"][number]> = [];
  for (const row of scopeRows.slice(0, LIST_LIMIT)) {
    bump(row.updatedAt);
    if (!row.isSelected) {
      omitted.push({ kind: "scope-item", id: row.id, reason: "Item is deselected, so it is not part of the scope" });
      continue;
    }
    // No stored field records proposed or authorised, so the state is unknown.
    scopeItems.push({ id: row.id, description: row.description, approvalStatus: "unknown" });
  }

  const hazards: Array<VerifiedReportProjection["hazards"][number]> = [];
  let hazardCount = 0;
  for (const sketch of inspection?.claimSketches ?? []) {
    if (sketch.hazards.length > LIST_LIMIT) omitted.push(describeLimit("hazard", LIST_LIMIT));
    for (const row of sketch.hazards.slice(0, LIST_LIMIT)) {
      hazardCount++;
      bump(row.updatedAt);
      hazards.push({
        id: row.id,
        title: row.type,
        action: row.whsPathwayNote ?? "No action recorded",
        // Hazard.status: suspected | sampled | cleared | licensed_removal_required.
        // Only "cleared" says the hazard is resolved. Nothing stored says verified.
        verification: row.status === "cleared" ? "resolved" : "unverified",
      });
    }
  }

  const photoRows = inspection?.photos ?? [];
  if (photoRows.length > LIST_LIMIT) omitted.push(describeLimit("photo", LIST_LIMIT));
  const photoIds = photoRows.slice(0, LIST_LIMIT).map(p => p.id);
  // The report design does not show photos yet (RA-8104 slice C). Each one is
  // listed here so the page never claims every record was shown.
  for (const id of photoIds) {
    omitted.push({ kind: "photo", id, reason: "Photos are not shown in this preview yet" });
  }

  bump(inspection?.updatedAt);

  // Every other stored field and linked record on the report and its
  // inspection that holds evidence this preview does not show: listed by name
  // only (evidence-inventory.ts), never copied.
  const reportRow = await prisma.report.findUnique({
    where: { id: reportId },
    select: inventorySelect(REPORT_FIELDS, REPORT_LINKS) as Prisma.ReportSelect,
  });
  omitted.push(...inventoryOmissions("Report", (reportRow ?? {}) as Record<string, unknown>, REPORT_FIELDS, REPORT_LINKS));
  if (inspection) {
    const inspectionRow = await prisma.inspection.findUnique({
      where: { id: inspection.id },
      select: inventorySelect(INSPECTION_FIELDS, INSPECTION_LINKS) as Prisma.InspectionSelect,
    });
    omitted.push(
      ...inventoryOmissions("Inspection", (inspectionRow ?? {}) as Record<string, unknown>, INSPECTION_FIELDS, INSPECTION_LINKS),
    );
  }

  // Money: the latest stored estimate's GST-inclusive total, only if it is an
  // exact number of cents and the job's country says which currency it is.
  let financials: VerifiedReportProjection["financials"];
  const estimate = report.estimates[0];
  if (estimate) {
    bump(estimate.updatedAt);
    const currency = inspection ? CURRENCY_BY_COUNTRY[inspection.propertyCountry] : undefined;
    const status = ESTIMATE_STATUS[estimate.status];
    const total = estimate.totalIncGST;
    const cents = typeof total === "number" ? Math.round(total * 100) : NaN;
    if (!currency) {
      omitted.push({ kind: "financials", id: estimate.id, reason: "Job jurisdiction is not known as AU or NZ" });
    } else if (!status) {
      omitted.push({ kind: "financials", id: estimate.id, reason: "Estimate status does not map to draft or approved" });
    } else if (!Number.isSafeInteger(cents) || cents < 0 || Math.abs(total! * 100 - cents) > 1e-6) {
      omitted.push({ kind: "financials", id: estimate.id, reason: "Stored total is missing or not exact to the cent" });
    } else {
      financials = { estimatedTotalCents: cents, currency, estimateStatus: status };
    }
  }

  // The business that heads the report is the workspace's (RA-7727), never the
  // author's personal details. An invited member's CURRENT organisation is only
  // trusted when it is the organisation the report belongs to; a member who has
  // since moved would otherwise put another firm's name on this report.
  const authorMoved = tenant.organizationId !== null && report.user?.organizationId !== tenant.organizationId;
  const businessName = !authorMoved && report.user ? (workspaceBusiness(report.user).businessName ?? "").trim() : "";

  const sourceRefs: Array<VerifiedReportProjection["sourceRefs"][number]> = [];
  if (inspection) sourceRefs.push({ kind: "inspection", id: inspection.id });
  for (const r of moistureReadings) sourceRefs.push({ kind: "reading", id: r.id });
  for (const s of scopeItems) sourceRefs.push({ kind: "scope", id: s.id });
  for (const id of photoIds) sourceRefs.push({ kind: "photo", id });

  const counts = [moistureReadings.length, scopeRows.length, hazardCount, photoRows.length].join("-");
  const projection: VerifiedReportProjection = {
    reportId: report.id,
    organisationId: grant.organisationId,
    revision: "v" + report.reportVersion + "." + latest + ".c" + counts,
    revisionCreatedAt: new Date(latest).toISOString(),
    reportNumber: report.reportNumber ?? report.jobNumber ?? report.id,
    status: report.status,
    workspaceBrand: { businessName },
    propertyAddress: report.propertyAddress,
    // No stored record of a formal safety assessment exists today (Report.safetyPlan
    // is free text and says nothing about an assessment having happened), so
    // this is never anything but NOT_ASSESSED. It is never assumed safe.
    safetyAssessment: "NOT_ASSESSED",
    hazards,
    moistureReadings,
    scopeItems,
    ...(financials ? { financials } : {}),
    sourceRefs,
  };
  return { projection, omitted };
}
