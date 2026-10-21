// Planted defect: a long string crashes the handler into a 500.
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const long = Object.values(body ?? {}).some((v) => typeof v === "string" && v.length > 10_000);
  if (long) return NextResponse.json({ error: "Internal error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
