/**
 * GET /api/integrations/ubibot/channels
 *
 * Returns live Ubibot channel list merged with current assignment config.
 * RA-1613
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listUbibotChannels } from "@/lib/ubibot-client";

interface ChannelAssignment {
  channelId: string;
  channelName: string;
  inspectionId?: string;
  roomName?: string;
}

interface IntegrationConfig {
  channels?: ChannelAssignment[];
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await prisma.integration.findFirst({
    where: { userId: session.user.id, provider: "UBIBOT", status: "CONNECTED" },
    select: { apiKey: true, config: true },
  });

  if (!integration?.apiKey) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }

  let liveChannels: Awaited<ReturnType<typeof listUbibotChannels>> = [];
  try {
    liveChannels = await listUbibotChannels(integration.apiKey);
  } catch (err) {
    console.error("[ubibot/channels]", err);
    return NextResponse.json({ error: "Failed to fetch channels from Ubibot" }, { status: 502 });
  }

  let config: IntegrationConfig = {};
  try {
    config = integration.config ? (JSON.parse(integration.config) as IntegrationConfig) : {};
  } catch {
    // Ignore malformed config
  }

  const assignmentMap = new Map<string, ChannelAssignment>(
    (config.channels ?? []).map((a) => [a.channelId, a]),
  );

  const channels = liveChannels.map((ch) => {
    const assignment = assignmentMap.get(ch.channel_id);
    return {
      channelId: ch.channel_id,
      channelName: ch.name,
      inspectionId: assignment?.inspectionId ?? null,
      roomName: assignment?.roomName ?? null,
    };
  });

  return NextResponse.json({ channels });
}
