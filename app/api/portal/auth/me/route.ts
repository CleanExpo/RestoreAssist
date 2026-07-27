import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClientAuth } from "@/lib/portal/require-client-auth";

// GET /api/portal/auth/me — current homeowner profile from the bearer JWT.
export async function GET(request: NextRequest) {
  const auth = await requireClientAuth(request);
  if (!auth.ok) return auth.response;

  const clientUser = await prisma.clientUser.findUnique({
    where: { id: auth.claims.sub },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      clientId: true,
      mustChangePassword: true,
    },
  });

  if (!clientUser) {
    return NextResponse.json({ error: "Account not found" }, { status: 401 });
  }

  return NextResponse.json({ clientUser });
}
