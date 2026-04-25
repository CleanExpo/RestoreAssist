/**
 * POST   /api/integrations/ubibot/assign — assign a channel to an inspection
 * DELETE /api/integrations/ubibot/assign — remove assignment
 *
 * RA-1613
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface ChannelAssignment {
  channelId: string;
  channelName: string;
  inspectionId?: string;
  roomName?: string;
}

interface IntegrationConfig {
  channels?: ChannelAssignment[];
}

async function getIntegration(userId: string) {
  return prisma.integration.findFirst({
    where: { userId, provider: "UBIBOT", status: "CONNECTED" },
    select: { id: true, config: true },
  });
}

function parseConfig(config: string | null): IntegrationConfig {
  try {
    return config ? (JSON.parse(config) as IntegrationConfig) : {};
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channelId?: string; channelName?: string; inspectionId?: string; roomName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { channelId, channelName, inspectionId, roomName } = body;
  if (!channelId || !channelName || !inspectionId) {
    return NextResponse.json(
      { error: "channelId, channelName, and inspectionId are required" },
      { status: 400 },
    );
  }

  const integration = await getIntegration(session.user.id);
  if (!integration) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }

  const config = parseConfig(integration.config);
  const channels = (config.channels ?? []).filter((c) => c.channelId !== channelId);
  channels.push({ channelId, channelName, inspectionId, roomName });

  await prisma.integration.update({
    where: { id: integration.id },
    data: { config: JSON.stringify({ ...config, channels }) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channelId?: string };
  try {
    body = (await request.json()) as { channelId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { channelId } = body;
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  const integration = await getIntegration(session.user.id);
  if (!integration) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }

  const config = parseConfig(integration.config);
  const channels = (config.channels ?? []).filter((c) => c.channelId !== channelId);

  await prisma.integration.update({
    where: { id: integration.id },
    data: { config: JSON.stringify({ ...config, channels }) },
  });

  return NextResponse.json({ ok: true });
}
