import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAllChecks } from "@/lib/setup/checks";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json(
      { error: "No organization for this user" },
      { status: 404 },
    );
  }

  const checks = await runAllChecks(org.id);
  return NextResponse.json({ data: { checks } });
}
