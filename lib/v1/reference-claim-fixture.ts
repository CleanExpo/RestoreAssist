/**
 * V1 Phase 6 (§39) — programmatic reference claim fixture for test helpers + E2E.
 * Idempotent upserts; no direct DB access required from specs once seeded via API.
 */

import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { seedReferenceClaimExitSpine } from "./reference-claim-exit-spine";

export type ReferenceClaimSeedInput = {
  inspectionId: string;
  ownerUserId: string;
  ownerOrganizationId: string | null;
  /** Link e2e test-user / test-manager into the owner's org and assign the tech. */
  syncTestColleagues?: boolean;
  /** Seed estimate / SWMS / equipment / payments entitlement (§39 exit path). */
  includeExitSpine?: boolean;
};

export type ReferenceClaimSeedResult = {
  inspectionId: string;
  reportId: string;
  clientId: string;
  portalToken: string;
  technicianUserId: string | null;
  managerUserId: string | null;
  /** Deliberately incomplete job for completeness-inbox E2E. */
  gapInspectionId: string;
  estimateId: string | null;
  workspaceId: string | null;
  scopeDisposalItemId: string | null;
};

const TEST_USER_EMAIL = "test-user@test.local";
const TEST_MANAGER_EMAIL = "test-manager@test.local";

function portalTokenForInspection(inspectionId: string): string {
  return createHash("sha256")
    .update(`v1-portal:${inspectionId}`)
    .digest("base64url");
}

export async function ensureTestColleague(
  tx: Prisma.TransactionClient,
  args: {
    email: string;
    role: "USER" | "MANAGER";
    organizationId: string;
    name: string;
  },
): Promise<string> {
  let user = await tx.user.findUnique({
    where: { email: args.email },
    select: { id: true, organizationId: true, role: true },
  });
  if (!user) {
    user = await tx.user.create({
      data: {
        email: args.email,
        name: args.name,
        role: args.role,
        organizationId: args.organizationId,
        productTourDismissedAt: new Date(),
      },
      select: { id: true, organizationId: true, role: true },
    });
    return user.id;
  }
  if (user.organizationId !== args.organizationId || user.role !== args.role) {
    await tx.user.update({
      where: { id: user.id },
      data: {
        organizationId: args.organizationId,
        role: args.role,
      },
    });
  }
  return user.id;
}

export async function seedReferenceClaim(
  tx: Prisma.TransactionClient,
  input: ReferenceClaimSeedInput,
): Promise<ReferenceClaimSeedResult> {
  const id = input.inspectionId;
  const reportId = `${id}-report`;
  const clientId = `${id}-client`;
  const userId = input.ownerUserId;
  const incidentDate = new Date("2026-06-01T10:00:00.000Z");
  const attendanceDate = new Date("2026-06-02T08:30:00.000Z");
  const portalToken = portalTokenForInspection(id);

  let technicianUserId: string | null = null;
  let managerUserId: string | null = null;

  if (input.syncTestColleagues !== false && input.ownerOrganizationId) {
    technicianUserId = await ensureTestColleague(tx, {
      email: TEST_USER_EMAIL,
      role: "USER",
      organizationId: input.ownerOrganizationId,
      name: "Test Technician",
    });
    managerUserId = await ensureTestColleague(tx, {
      email: TEST_MANAGER_EMAIL,
      role: "MANAGER",
      organizationId: input.ownerOrganizationId,
      name: "Test Manager",
    });
  }

  await tx.client.upsert({
    where: { id: clientId },
    create: {
      id: clientId,
      name: "Reference Homeowner",
      email: `ref-${id}@example.com`,
      phone: "0400000000",
      userId,
    },
    update: { name: "Reference Homeowner" },
  });

  await tx.report.upsert({
    where: { id: reportId },
    create: {
      id: reportId,
      title: "V1 reference water claim",
      clientName: "Reference Homeowner",
      propertyAddress: "42 Seed St, Brisbane QLD 4000",
      hazardType: "WATER",
      insuranceType: "BUILDING",
      status: "DRAFT",
      userId,
      clientId,
      incidentDate,
      technicianAttendanceDate: attendanceDate,
      claimReferenceNumber: "REF-2026-001",
    },
    update: {
      clientId,
      incidentDate,
      technicianAttendanceDate: attendanceDate,
    },
  });

  await tx.inspection.upsert({
    where: { id },
    create: {
      id,
      inspectionNumber: `V1-${id}`,
      propertyAddress: "42 Seed St, Brisbane QLD 4000",
      propertyPostcode: "4000",
      status: "CLASSIFIED",
      claimType: "WATER_DAMAGE",
      claimNumber: "REF-2026-001",
      userId,
      reportId,
      clientId,
      technicianId: technicianUserId,
    },
    update: {
      reportId,
      clientId,
      claimNumber: "REF-2026-001",
      technicianId: technicianUserId ?? undefined,
    },
  });

  await tx.waterDamageClassification.upsert({
    where: { inspectionId: id },
    create: {
      inspectionId: id,
      waterCategory: "CAT_2",
      damageClass: "CLASS_2",
      gateClassificationComplete: true,
      gatePhotosAttached: true,
    },
    update: {
      waterCategory: "CAT_2",
      damageClass: "CLASS_2",
      gateClassificationComplete: true,
      gatePhotosAttached: true,
    },
  });

  const areaId = `${id}-area-bathroom`;
  await tx.affectedArea.upsert({
    where: { id: areaId },
    create: {
      id: areaId,
      inspectionId: id,
      roomZoneId: "Bathroom",
      affectedSquareFootage: 120,
      affectedAreaSqm: 11.15,
      waterSource: "grey water",
      category: "2",
      class: "2",
    },
    update: { inspectionId: id },
  });

  const photoCount = await tx.inspectionPhoto.count({
    where: { inspectionId: id },
  });
  for (let i = photoCount; i < 5; i++) {
    await tx.inspectionPhoto.create({
      data: {
        inspectionId: id,
        url: `https://cdn.example.com/v1-ref/${id}/photo-${i + 1}.jpg`,
        location: i === 0 ? "Bathroom" : `Room ${i}`,
        description: "Reference claim evidence photo",
      },
    });
  }

  const existingBaseline = await tx.moistureReading.findFirst({
    where: { inspectionId: id, isBaseline: true },
    select: { id: true },
  });
  if (!existingBaseline) {
    await tx.moistureReading.create({
      data: {
        inspectionId: id,
        location: "Hall reference",
        surfaceType: "drywall",
        moistureLevel: 8,
        depth: "Surface",
        isBaseline: true,
        isMonitoringPoint: false,
        recordedAt: incidentDate,
      },
    });
  }

  const monitorPoints = await tx.moistureReading.count({
    where: { inspectionId: id, isMonitoringPoint: true, invalidatedAt: null },
  });
  if (monitorPoints < 2) {
    await tx.moistureReading.create({
      data: {
        inspectionId: id,
        location: "Bathroom wall",
        surfaceType: "drywall",
        moistureLevel: 22,
        depth: "Surface",
        isMonitoringPoint: true,
        recordedAt: new Date("2026-06-03T09:00:00.000Z"),
      },
    });
    await tx.moistureReading.create({
      data: {
        inspectionId: id,
        location: "Hall ceiling",
        surfaceType: "drywall",
        moistureLevel: 18,
        depth: "Surface",
        isMonitoringPoint: true,
        recordedAt: new Date("2026-06-04T09:00:00.000Z"),
      },
    });
  }

  await tx.clientPortalAccount.upsert({
    where: { token: portalToken },
    create: {
      clientId,
      token: portalToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    update: {
      clientId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const existingAppt = await tx.jobAppointment.findFirst({
    where: { inspectionId: id, status: "SCHEDULED" },
    select: { id: true },
  });
  if (!existingAppt && managerUserId) {
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    await tx.jobAppointment.create({
      data: {
        inspectionId: id,
        title: "Monitoring visit",
        startsAt: start,
        endsAt: end,
        assignedUserId: technicianUserId,
        createdByUserId: managerUserId,
        notes: "Dog on site; restricted parking",
      },
    });
  }

  let estimateId: string | null = null;
  let workspaceId: string | null = null;
  const scopeDisposalItemId = `${id}-scope-disposal`;
  if (input.includeExitSpine !== false) {
    const exit = await seedReferenceClaimExitSpine(tx, {
      inspectionId: id,
      reportId,
      ownerUserId: userId,
      clientEmail: `ref-${id}@example.com`,
    });
    estimateId = exit.estimateId;
    workspaceId = exit.workspaceId;
  }

  const gapInspectionId = `${id}-inbox-gap`;
  await tx.inspection.upsert({
    where: { id: gapInspectionId },
    create: {
      id: gapInspectionId,
      inspectionNumber: `GAP-${id}`,
      propertyAddress: "99 Incomplete St, Brisbane QLD 4000",
      propertyPostcode: "4000",
      status: "DRAFT",
      claimType: "WATER_DAMAGE",
      userId,
    },
    update: { userId },
  });

  return {
    inspectionId: id,
    reportId,
    clientId,
    portalToken,
    technicianUserId,
    managerUserId,
    gapInspectionId,
    estimateId,
    workspaceId,
    scopeDisposalItemId: input.includeExitSpine !== false ? scopeDisposalItemId : null,
  };
}

/** Capability matrix row ids for §39-style reporting in E2E. */
export const V1_REFERENCE_CAPABILITY_CHECKS = [
  "canonical_client_spine",
  "s500_classification",
  "loss_timeline",
  "moisture_baseline_monitoring",
  "evidence_photos",
  "affected_areas",
  "claim_context_api",
  "completeness_inbox",
  "scheduling",
  "portal_consumer_updates",
  "field_assist_read",
  "swms_signed",
  "disposal_authority",
  "equipment_matrix",
  "estimate_approval",
  "invoice_from_estimate",
  "eft_payment_ledger",
  "xero_reconciliation",
  "job_close",
] as const;

export type V1ReferenceCapability = (typeof V1_REFERENCE_CAPABILITY_CHECKS)[number];
