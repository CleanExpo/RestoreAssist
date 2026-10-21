// Planted defect: mass assignment. Applies `role` from the body to the caller.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const s = (await getServerSession()) as { user?: { id?: string } } | null;
  if (!s?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const u = await prisma.user.update({ where: { id: s.user.id }, data: { ...(body.role ? { role: body.role } : {}), name: String(body.name ?? "x") } });
  return NextResponse.json({ id: u.id });
}
