// Planted defect: stores the value verbatim but GET returns it altered, so the
// stored value does not round-trip through the read route.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const s = (await getServerSession()) as { user?: { id?: string } } | null;
  if (!s?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const c = await prisma.client.create({ data: { name: String(body.name), email: String(body.email), userId: s.user.id } });
  return NextResponse.json({ id: c.id });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = await prisma.client.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ client: { id: c.id, name: c.name.replace(/<[^>]*>/g, "") } });
}
