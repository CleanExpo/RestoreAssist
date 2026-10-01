import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifiedOfflineOwner } from "@/lib/offline/server-boundary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ owner: null }, { status: 401, headers });
    const owner = await verifiedOfflineOwner(request);
    if (!owner || owner.userId !== session.user.id) return NextResponse.json({ owner: null }, { status: 401, headers });
    return NextResponse.json({ owner }, { headers });
  } catch { return NextResponse.json({ owner: null }, { status: 503, headers }); }
}
