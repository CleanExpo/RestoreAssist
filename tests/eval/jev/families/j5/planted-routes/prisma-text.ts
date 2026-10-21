// Planted defect: returns the raw Prisma error message to the caller (4xx, so
// only the error-text oracle can catch it).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    await prisma.client.create({ data: { name: body.name } as never });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
