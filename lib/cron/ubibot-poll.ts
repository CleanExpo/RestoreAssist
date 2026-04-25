/**
 * Ubibot Sensor Poll — RA-1613
 *
 * Cron job: every 60s, fetch latest temperature + humidity from all Ubibot
 * channels that are assigned to an active inspection and write EnvironmentalData rows.
 *
 * Invoked from /app/api/cron/ubibot-poll/route.ts.
 */

import { prisma } from "@/lib/prisma";
import { runCronJob, type CronJobResult } from "./runner";
import { getLastValues, ubibotDelay } from "@/lib/ubibot-client";

interface UbibotChannelAssignment {
  channelId: string;
  channelName: string;
  inspectionId: string;
  roomName?: string;
}

interface UbibotIntegrationConfig {
  channels?: UbibotChannelAssignment[];
}

export async function pollUbibotSensors(): Promise<
  CronJobResult & { status: string }
> {
  return runCronJob("ubibot-poll", async () => {
    // Find all connected Ubibot integrations
    const integrations = await prisma.integration.findMany({
      where: { provider: "UBIBOT", status: "CONNECTED", apiKey: { not: null } },
      select: { id: true, apiKey: true, config: true },
    });

    let itemsProcessed = 0;

    for (const integration of integrations) {
      const accountKey = integration.apiKey!;
      let config: UbibotIntegrationConfig = {};
      try {
        config = integration.config
          ? (JSON.parse(integration.config) as UbibotIntegrationConfig)
          : {};
      } catch {
        console.error("[ubibot-poll] Invalid config JSON for integration", integration.id);
        continue;
      }

      const assignments = config.channels ?? [];
      if (assignments.length === 0) continue;

      for (const assignment of assignments) {
        // Check if the inspection is still active
        const inspection = await prisma.inspection.findFirst({
          where: {
            id: assignment.inspectionId,
            status: { not: "COMPLETED" },
          },
          select: { id: true },
        });

        if (!inspection) continue;

        try {
          const values = await getLastValues(accountKey, assignment.channelId);

          if (values.temperature !== null && values.humidity !== null) {
            // Calculate dew point (Magnus formula)
            const a = 17.625;
            const b = 243.04;
            const alpha =
              Math.log(values.humidity / 100) +
              (a * values.temperature) / (b + values.temperature);
            const dewPoint = Math.round(((b * alpha) / (a - alpha)) * 10) / 10;

            await prisma.environmentalData.create({
              data: {
                inspectionId: assignment.inspectionId,
                ambientTemperature: values.temperature,
                humidityLevel: values.humidity,
                dewPoint,
                notes: `Auto-polled from Ubibot channel "${assignment.channelName}"${assignment.roomName ? ` (${assignment.roomName})` : ""}`,
                recordedAt: values.recordedAt,
              },
            });

            itemsProcessed++;
          }
        } catch (err) {
          console.error(
            "[ubibot-poll] Failed to poll channel",
            assignment.channelId,
            "for inspection",
            assignment.inspectionId,
            err,
          );
        }

        // Respect Ubibot free-tier rate limit
        await ubibotDelay();
      }
    }

    return { itemsProcessed };
  });
}
