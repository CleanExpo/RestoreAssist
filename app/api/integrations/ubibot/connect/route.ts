/**
 * POST /api/integrations/ubibot/connect  — store account_key + verify
 * DELETE /api/integrations/ubibot/connect — disconnect
 *
 * RA-1613
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listUbibotChannels } from "@/lib/ubibot-client";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { accountKey?: string };
  try {
    body = (await request.json()) as { accountKey?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { accountKey } = body;
  if (!accountKey?.trim()) {
    return NextResponse.json({ error: "accountKey is required" }, { status: 400 });
  }

  // Verify the key against Ubibot API
  try {
    await listUbibotChannels(accountKey.trim());
  } catch (err) {
    console.error("[ubibot/connect]", err);
    return NextResponse.json(
      { error: "Could not verify account key with Ubibot. Check the key and try again." },
      { status: 400 },
    );
  }

  const integration = await prisma.integration.upsert({
    where: {
      // Composite unique: one Ubibot integration per user (use userId + provider workaround)
      id:
        (
          await prisma.integration.findFirst({
            where: { userId: session.user.id, provider: "UBIBOT" },
            select: { id: true },
          })
        )?.id ?? "new",
    },
    create: {
      userId: session.user.id,
      provider: "UBIBOT",
      name: "Ubibot",
      description: "WiFi thermo-hygrometer cloud API",
      status: "CONNECTED",
      apiKey: accountKey.trim(),
      config: JSON.stringify({ channels: [] }),
    },
    update: {
      status: "CONNECTED",
      apiKey: accountKey.trim(),
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({ integration });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await prisma.integration.findFirst({
    where: { userId: session.user.id, provider: "UBIBOT" },
    select: { id: true },
  });

  if (!integration) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { status: "DISCONNECTED", apiKey: null, config: JSON.stringify({ channels: [] }) },
  });

  return NextResponse.json({ ok: true });
}
