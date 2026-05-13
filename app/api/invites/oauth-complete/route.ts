import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = req.cookies.get("invite_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
  }

  const invite = await prisma.userInvite.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      organizationId: true,
      role: true,
      usedAt: true,
      expiresAt: true,
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.usedAt) {
    return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  const url = req.nextUrl.clone();
  url.pathname = `/invite/${token}`;
  url.searchParams.set("step", "2");
  // Clear the invite_token cookie now that we've used it.
  const response = NextResponse.redirect(url, 307);
  response.cookies.delete("invite_token");
  return response;
}
