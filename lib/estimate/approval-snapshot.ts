/**
 * P2 / V1 P2-2 — freeze estimate economics at approval time.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { resolveEffectivePricing } from "@/lib/pricing/effective-pricing";

type Tx = Prisma.TransactionClient | PrismaClient;

export async function freezeEstimateApprovalSnapshot(
  tx: Tx,
  args: {
    estimateId: string;
    userId: string;
    version: number;
  },
): Promise<void> {
  const estimate = await tx.estimate.findUnique({
    where: { id: args.estimateId },
    select: {
      id: true,
      version: true,
      status: true,
      subtotalExGST: true,
      gst: true,
      totalIncGST: true,
      rateTables: true,
      commercialParams: true,
      lineItems: {
        orderBy: { displayOrder: "asc" },
        take: 500,
      },
    },
  });
  if (!estimate) return;

  const pricing = await resolveEffectivePricing(tx, args.userId);

  const snapshot = {
    frozenAt: new Date().toISOString(),
    estimateVersion: estimate.version,
    totals: {
      subtotalExGST: estimate.subtotalExGST,
      gst: estimate.gst,
      totalIncGST: estimate.totalIncGST,
    },
    rateTables: estimate.rateTables,
    commercialParams: estimate.commercialParams,
    organizationPricingConfigId: pricing && "organizationId" in pricing ? pricing.id : null,
    lineItems: estimate.lineItems.map((li) => ({
      id: li.id,
      code: li.code,
      category: li.category,
      description: li.description,
      qty: li.qty,
      unit: li.unit,
      rate: li.rate,
      subtotal: li.subtotal,
      gstRate: null,
      taxType: li.taxType,
      isPassThrough: li.isPassThrough,
      xeroAccountCode: li.xeroAccountCode,
      displayOrder: li.displayOrder,
    })),
  };

  await tx.estimateVersion.upsert({
    where: {
      estimateId_version: { estimateId: args.estimateId, version: args.version },
    },
    create: {
      estimateId: args.estimateId,
      version: args.version,
      createdBy: args.userId,
      reason: "Approved — economics frozen (P2-2)",
      snapshot: JSON.stringify(snapshot),
    },
    update: {
      reason: "Approved — economics frozen (P2-2)",
      snapshot: JSON.stringify(snapshot),
    },
  });
}

export type FrozenEstimateLine = {
  id?: string;
  description: string;
  category: string;
  qty: number;
  unit: string;
  rate: number;
  subtotal: number;
  taxType?: string;
  isPassThrough?: boolean;
  xeroAccountCode?: string | null;
  code?: string | null;
};

export function parseFrozenEstimateLines(
  snapshotJson: string | null | undefined,
): FrozenEstimateLine[] | null {
  if (!snapshotJson?.trim()) return null;
  try {
    const parsed = JSON.parse(snapshotJson) as {
      lineItems?: FrozenEstimateLine[];
    };
    if (!Array.isArray(parsed.lineItems) || parsed.lineItems.length === 0) {
      return null;
    }
    return parsed.lineItems;
  } catch {
    return null;
  }
}
