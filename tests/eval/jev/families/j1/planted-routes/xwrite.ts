// Planted defect: accepts any signed-in caller's write on any record.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

export async function PATCH() {
  const s = await getServerSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ updated: true });
}
