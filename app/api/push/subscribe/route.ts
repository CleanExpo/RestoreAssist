import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid JSON",
      status: 400,
    });
  }

  const { token, platform } = body;
  if (!token || !["ios", "android"].includes(platform ?? "")) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid token or platform",
      status: 400,
    });
  }

  try {
    await prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId: session.user.id,
        isActive: true,
        updatedAt: new Date(),
      },
      create: { userId: session.user.id, token, platform: platform! },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return fromException(req, err, { stage: "subscribe" });
  }
}
