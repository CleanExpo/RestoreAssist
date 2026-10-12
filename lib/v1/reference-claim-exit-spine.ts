/**
 * V1 Phase 6 — §39 exit-path data (estimate, SWMS, equipment, entitlements).
 * Seeded only via test helpers / fixture transaction — E2E asserts via API.
 */

import type { Prisma } from "@prisma/client";
import { DISPOSAL_AUTHORITY_AUDIT_ACTION } from "../compliance/disposal-authority-gate";
import { recordReportSent } from "../lifecycle/report-delivery";
import { PAYMENTS_SKU } from "../billing/payments-addon";

export type ExitSpineResult = {
  estimateId: string;
  workspaceId: string | null;
};

export async function ensureOwnerWorkspaceWithPayments(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
): Promise<string | null> {
  const user = await tx.user.findUnique({
    where: { id: ownerUserId },
    select: { organizationId: true, email: true },
  });
  if (!user?.organizationId) return null;

  let workspace = await tx.workspace.findFirst({
    where: { ownerId: ownerUserId },
    select: { id: true },
  });
  if (!workspace) {
    workspace = await tx.workspace.create({
      data: {
        name: "V1 reference workspace",
        slug: `v1-ref-${ownerUserId.replace(/[^a-z0-9]/gi, "").slice(-12) || "ws"}`,
        ownerId: ownerUserId,
        status: "READY",
      },
      select: { id: true },
    });
  }

  await tx.featureEntitlement.upsert({
    where: {
      workspaceId_sku: { workspaceId: workspace.id, sku: "PAYMENTS" },
    },
    create: {
      workspaceId: workspace.id,
      sku: PAYMENTS_SKU,
      active: true,
    },
    update: { active: true },
  });

  return workspace.id;
}

export async function seedReferenceClaimExitSpine(
  tx: Prisma.TransactionClient,
  args: {
    inspectionId: string;
    reportId: string;
    ownerUserId: string;
    clientEmail: string;
  },
): Promise<ExitSpineResult> {
  const workspaceId = await ensureOwnerWorkspaceWithPayments(tx, args.ownerUserId);

  const estimateId = `${args.inspectionId}-estimate`;
  const totalIncGST = 1100;
  const subtotalExGST = 1000;
  const gst = 100;

  await tx.report.update({
    where: { id: args.reportId },
    data: { status: "COMPLETED" },
  });

  await tx.reportApproval.upsert({
    where: {
      reportId_approvalType: {
        reportId: args.reportId,
        approvalType: "COST_ESTIMATE",
      },
    },
    create: {
      reportId: args.reportId,
      approvalType: "COST_ESTIMATE",
      status: "APPROVED",
      respondedAt: new Date("2026-06-10T12:00:00.000Z"),
      amount: totalIncGST,
    },
    update: {
      status: "APPROVED",
      respondedAt: new Date("2026-06-10T12:00:00.000Z"),
      amount: totalIncGST,
    },
  });

  await tx.estimate.upsert({
    where: { id: estimateId },
    create: {
      id: estimateId,
      reportId: args.reportId,
      userId: args.ownerUserId,
      status: "CLIENT_REVIEW",
      version: 1,
      subtotalExGST,
      gst,
      totalIncGST,
      createdBy: args.ownerUserId,
      updatedBy: args.ownerUserId,
    },
    update: {
      status: "CLIENT_REVIEW",
      subtotalExGST,
      gst,
      totalIncGST,
    },
  });

  const lineId = `${estimateId}-line-1`;
  await tx.estimateLineItem.upsert({
    where: { id: lineId },
    create: {
      id: lineId,
      estimateId,
      category: "Mitigation",
      description: "Structural drying — reference claim",
      qty: 1,
      unit: "job",
      rate: 1000,
      subtotal: 1000,
      createdBy: args.ownerUserId,
      displayOrder: 0,
    },
    update: { estimateId },
  });

  await tx.swmsDraft.upsert({
    where: { inspectionId: args.inspectionId },
    create: {
      inspectionId: args.inspectionId,
      contentJson: JSON.stringify({
        title: "V1 reference SWMS",
        hazards: [{ type: "electrical", control: "Isolate affected circuits" }],
        signed: true,
      }),
      signedAt: new Date("2026-06-02T07:00:00.000Z"),
      signedByUserId: args.ownerUserId,
    },
    update: {
      signedAt: new Date("2026-06-02T07:00:00.000Z"),
      signedByUserId: args.ownerUserId,
    },
  });

  const disposalAudit = await tx.auditLog.findFirst({
    where: {
      inspectionId: args.inspectionId,
      action: DISPOSAL_AUTHORITY_AUDIT_ACTION,
    },
    select: { id: true },
  });
  if (!disposalAudit) {
    await tx.auditLog.create({
      data: {
        inspectionId: args.inspectionId,
        userId: args.ownerUserId,
        action: DISPOSAL_AUTHORITY_AUDIT_ACTION,
        entityType: "Inspection",
        entityId: args.inspectionId,
        changes: JSON.stringify({
          signerName: "Reference Homeowner",
          reference: "AUTH-V1-REF",
        }),
      },
    });
  }

  const scopeDisposalId = `${args.inspectionId}-scope-disposal`;
  await tx.scopeItem.upsert({
    where: { id: scopeDisposalId },
    create: {
      id: scopeDisposalId,
      inspectionId: args.inspectionId,
      itemType: "remove_wet_carpet",
      description: "Remove and dispose wet carpet — bathroom",
      quantity: 12,
      unit: "m2",
      isSelected: false,
      autoDetermined: false,
    },
    update: { inspectionId: args.inspectionId },
  });

  const deployId = `${args.reportId}-dehu-1`;
  await tx.equipmentDeployment.upsert({
    where: { id: deployId },
    create: {
      id: deployId,
      reportId: args.reportId,
      userId: args.ownerUserId,
      equipmentType: "LGR Dehumidifier",
      manufacturer: "Reference",
      deploymentLocation: "Bathroom",
      startTime: new Date("2026-06-03T08:00:00.000Z"),
      runHours: 48,
      ampDraw: 8.5,
    },
    update: { reportId: args.reportId },
  });

  await tx.inspection.update({
    where: { id: args.inspectionId },
    data: { status: "ESTIMATED" },
  });

  return { estimateId, workspaceId };
}

/** After invoice + payment exist — delivery fact for Close Job `report_sent`. */
export async function seedReportDeliveryForClose(
  tx: Prisma.TransactionClient,
  args: {
    inspectionId: string;
    reportId: string;
    ownerUserId: string;
    clientEmail: string;
  },
): Promise<void> {
  const existing = await tx.auditLog.findFirst({
    where: {
      inspectionId: args.inspectionId,
      action: "REPORT_SENT",
      entityId: args.reportId,
    },
    select: { id: true },
  });
  if (existing) return;

  await recordReportSent(tx, {
    inspectionId: args.inspectionId,
    reportId: args.reportId,
    userId: args.ownerUserId,
    recipient: args.clientEmail,
    providerMessageId: "v1-reference-fixture",
  });
}
