// Planted defect: refuses the write but echoes the target record in the error body.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = await prisma.client.findUnique({ where: { id } });
  return NextResponse.json({ error: "Forbidden", record: c }, { status: 403 });
}
