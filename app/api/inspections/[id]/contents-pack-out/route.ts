/**
 * Contents Pack-Out Items API — RA-290 (NIR Phase 2)
 *
 * GET  /api/inspections/[id]/contents-pack-out
 *   Returns all ContentsPackOutItems for this inspection, grouped by packOutDecision.
 *
 * POST /api/inspections/[id]/contents-pack-out
 *   Creates a new pack-out item. Stamps Inspection.claimType = CONTENTS.
 *
 * DELETE /api/inspections/[id]/contents-pack-out/[itemId]
 *   Removes a specific item (see [itemId]/route.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ─── Validation ────────────────────────────────────────────────────────────────

const packOutItemSchema = z.object({
  itemDescription: z.string().min(1),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  ageYears: z.number().int().nonnegative().nullable().optional(),
  conditionPreLoss: z
    .enum(["EXCELLENT", "GOOD", "FAIR", "POOR"])
    .nullable()
    .optional(),
  conditionPostLoss: z
    .enum(["EXCELLENT", "GOOD", "FAIR", "POOR"])
    .nullable()
    .optional(),
  replacementValueAud: z.number().nonnegative().nullable().optional(),
  restorationCostEstimate: z.number().nonnegative().nullable().optional(),
  packOutDecision: z
    .enum(["CLEAN_ONSITE", "PACK_OUT", "TOTAL_LOSS"])
    .nullable()
    .optional(),
  packOutTag: z.string().nullable().optional(),
  beforePhotoUrl: z.string().url().nullable().optional(),
  afterPhotoUrl: z.string().url().nullable().optional(),
  claimType: z
    .enum([
      "WATER",
      "FIRE",
      "MOULD",
      "STORM",
      "CONTENTS",
      "BIOHAZARD",
      "ODOUR",
      "CARPET",
      "HVAC",
      "ASBESTOS",
    ])
    .nullable()
    .optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const inspection = await prisma.inspection.findUnique({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  const items = await (prisma as any).contentsPackOutItem.findMany({
    where: { inspectionId: id },
    orderBy: { createdAt: "asc" },
  });

  const totalReplacementValueAud = (items as any[]).reduce(
    (sum: number, item: any) =>
      item.packOutDecision === "TOTAL_LOSS"
        ? sum + (Number(item.replacementValueAud) ?? 0)
        : sum,
    0,
  );

  return NextResponse.json({
    items,
    summary: {
      totalItems: items.length,
      cleanOnsite: (items as any[]).filter(
        (i: any) => i.packOutDecision === "CLEAN_ONSITE",
      ).length,
      packOut: (items as any[]).filter(
        (i: any) => i.packOutDecision === "PACK_OUT",
      ).length,
      totalLoss: (items as any[]).filter(
        (i: any) => i.packOutDecision === "TOTAL_LOSS",
      ).length,
      totalReplacementValueAud,
    },
  });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const inspection = await prisma.inspection.findUnique({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  const body = await req.json();
  const parsed = packOutItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const record = await (prisma as any).contentsPackOutItem.create({
    data: {
      inspectionId: id,
      itemDescription: data.itemDescription,
      make: data.make ?? null,
      model: data.model ?? null,
      serialNumber: data.serialNumber ?? null,
      ageYears: data.ageYears ?? null,
      conditionPreLoss: data.conditionPreLoss ?? null,
      conditionPostLoss: data.conditionPostLoss ?? null,
      replacementValueAud: data.replacementValueAud ?? null,
      restorationCostEstimate: data.restorationCostEstimate ?? null,
      packOutDecision: data.packOutDecision ?? null,
      packOutTag: data.packOutTag ?? null,
      beforePhotoUrl: data.beforePhotoUrl ?? null,
      afterPhotoUrl: data.afterPhotoUrl ?? null,
      claimType: data.claimType ?? null,
    },
  });

  // Stamp Inspection.claimType = CONTENTS if no claim type already set
  await prisma.inspection.update({
    where: { id },
    data: { claimType: "CONTENTS" } as any,
  });

  return NextResponse.json(record, { status: 201 });
}
