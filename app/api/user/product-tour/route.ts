import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * RA-1238: In-app product tour state.
 * GET  — returns { dismissed: boolean } so the client knows whether to auto-open the tour.
 * POST — { action: "dismiss" | "complete" } — both set `productTourDismissedAt`; the field
 *        records "user has already seen the tour and should not see it again".
 */

export interface ProductTourStateResponse {
  dismissed: boolean;
}

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<ProductTourStateResponse>> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ dismissed: true }, { status: 401 });
  }

  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: session.user.id },
      select: { productTourDismissedAt: true },
    });
    return NextResponse.json({ dismissed: !!user?.productTourDismissedAt });
  } catch (err) {
    console.error("[product-tour GET] error", err);
    // Fail closed — don't annoy the user with a tour we can't track.
    return NextResponse.json({ dismissed: true }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  if (action !== "dismiss" && action !== "complete") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    await (prisma as any).user.update({
      where: { id: session.user.id },
      data: { productTourDismissedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[product-tour POST] error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
