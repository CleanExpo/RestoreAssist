import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, platform } = body;
  if (!token || !["ios", "android"].includes(platform ?? "")) {
    return NextResponse.json({ error: "Invalid token or platform" }, { status: 400 });
  }

  await prisma.deviceToken.upsert({
    where: { token },
    update: { userId: session.user.id, isActive: true, updatedAt: new Date() },
    create: { userId: session.user.id, token, platform: platform! },
  });

  return NextResponse.json({ ok: true });
}
