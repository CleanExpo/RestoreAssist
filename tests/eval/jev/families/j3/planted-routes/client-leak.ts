// Planted defect: the client list searches every firm's clients, not the caller's.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const s = await getServerSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const clients = await prisma.client.findMany({ where: { name: { contains: search } }, take: 20 });
  return NextResponse.json({ clients });
}
