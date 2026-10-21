// Planted defect: a submit handler that marks the inspection SUBMITTED without checking it has any photo.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.inspection.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  return NextResponse.json({ inspectionId: id, status: "SUBMITTED" });
}
