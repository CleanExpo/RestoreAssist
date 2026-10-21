// Planted defect: returns firm A's inspection to any caller.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.inspection.findUnique({ where: { id } });
  return NextResponse.json(row);
}
