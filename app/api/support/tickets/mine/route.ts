/**
 * RA-1355 — user's own support tickets.
 *
 * Authenticated endpoint. Returns only tickets created by the current
 * user (by userId match OR email match for tickets submitted
 * pre-authentication). Supports the in-app "My tickets" history view.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickets = await prisma.supportTicket.findMany({
    where: {
      OR: [
        { userId: session.user.id },
        ...(session.user.email ? [{ email: session.user.email }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      subject: true,
      category: true,
      priority: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
    },
  });

  return NextResponse.json({ tickets });
}
