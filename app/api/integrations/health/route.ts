import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/integrations/health - Health check for integration systems
 *
 * Checks:
 * - All integrations have valid tokens
 * - No integrations stuck in ERROR state > 24 hours
 * - Webhook queue is processing
 * - No excessive failures
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const checks: any[] = [];
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

    // Check 1: Active integrations have valid tokens
    const integrations = await prisma.integration.findMany({
      where: {
        userId: session.user.id,
        status: "CONNECTED",
      },
    });

    const expiredTokens = integrations.filter(
      (i) => i.tokenExpiresAt && i.tokenExpiresAt < new Date(),
    );

    checks.push({
      name: "Token Validity",
      status: expiredTokens.length === 0 ? "pass" : "fail",
      message:
        expiredTokens.length === 0
          ? `All ${integrations.length} integrations have valid tokens`
          : `${expiredTokens.length} integration(s) have expired tokens`,
      details: expiredTokens.map((i) => ({
        provider: i.provider,
        expiredAt: i.tokenExpiresAt,
      })),
    });

    if (expiredTokens.length > 0) {
      overallStatus = "degraded";
    }

    // Check 2: No integrations stuck in ERROR state
    const errorIntegrations = await prisma.integration.findMany({
      where: {
        userId: session.user.id,
        status: "ERROR",
        updatedAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        },
      },
    });

    checks.push({
      name: "Error State Duration",
      status: errorIntegrations.length === 0 ? "pass" : "fail",
      message:
        errorIntegrations.length === 0
          ? "No integrations stuck in ERROR state"
          : `${errorIntegrations.length} integration(s) stuck in ERROR for >24h`,
      details: errorIntegrations.map((i) => ({
        provider: i.provider,
        errorSince: i.updatedAt,
      })),
    });

    if (errorIntegrations.length > 0) {
      overallStatus = "unhealthy";
    }

    // Check 3: Webhook processing
    const pendingWebhooks = await prisma.webhookEvent.count({
      where: {
        integration: {
          userId: session.user.id,
        },
        status: "PENDING",
        createdAt: {
          lt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        },
      },
    });

    checks.push({
      name: "Webhook Processing",
      status: pendingWebhooks < 10 ? "pass" : "warn",
      message:
        pendingWebhooks < 10
          ? "Webhook queue processing normally"
          : `${pendingWebhooks} webhooks pending for >1 hour`,
      details: { pendingOld: pendingWebhooks },
    });

    if (pendingWebhooks >= 10 && overallStatus === "healthy") {
      overallStatus = "degraded";
    }

    // Check 4: Recent sync success rate
    const recentSyncs = await prisma.integrationSyncLog.findMany({
      where: {
        integration: {
          userId: session.user.id,
        },
        startedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    const successRate =
      recentSyncs.length > 0
        ? (recentSyncs.filter((s) => s.status === "SUCCESS").length /
            recentSyncs.length) *
          100
        : 100;

    checks.push({
      name: "Sync Success Rate",
      status: successRate >= 95 ? "pass" : successRate >= 80 ? "warn" : "fail",
      message: `${Math.round(successRate)}% success rate (${recentSyncs.length} syncs in 24h)`,
      details: {
        total: recentSyncs.length,
        successful: recentSyncs.filter((s) => s.status === "SUCCESS").length,
        failed: recentSyncs.filter((s) => s.status === "FAILED").length,
      },
    });

    if (successRate < 80 && overallStatus !== "unhealthy") {
      overallStatus = successRate < 50 ? "unhealthy" : "degraded";
    }

    // Check 5: Failed webhooks
    const failedWebhooks = await prisma.webhookEvent.count({
      where: {
        integration: {
          userId: session.user.id,
        },
        status: "FAILED",
        retryCount: {
          gte: 5,
        },
      },
    });

    checks.push({
      name: "Failed Webhooks",
      status: failedWebhooks < 5 ? "pass" : "warn",
      message:
        failedWebhooks < 5
          ? "Minimal webhook failures"
          : `${failedWebhooks} webhooks failed after max retries`,
      details: { failedMaxRetries: failedWebhooks },
    });

    if (failedWebhooks >= 5 && overallStatus === "healthy") {
      overallStatus = "degraded";
    }

    // Check 6: DR-NRPG integration freshness (RA-1287)
    // The DrNrpgIntegration model uses a long-lived API key; the daily
    // dr-nrpg-liveness cron pings it and updates lastSyncAt. If the last
    // successful probe is older than 48h, surface as degraded so the user
    // is aware before silent dispatch failure compounds.
    const drNrpg = await (prisma as any).drNrpgIntegration.findUnique({
      where: { userId: session.user.id },
      select: { isActive: true, lastSyncAt: true, updatedAt: true },
    });

    if (drNrpg) {
      const lastSync: Date | null = drNrpg.lastSyncAt ?? null;
      const ageMs = lastSync
        ? Date.now() - lastSync.getTime()
        : Number.POSITIVE_INFINITY;
      const stale = ageMs > 48 * 60 * 60 * 1000;
      const inactive = !drNrpg.isActive;

      const status: "pass" | "warn" | "fail" = inactive
        ? "fail"
        : stale
          ? "warn"
          : "pass";
      const msg = inactive
        ? "DR-NRPG integration is deactivated (liveness cron auth failure)"
        : stale
          ? `DR-NRPG last synced >${Math.floor(ageMs / 3_600_000)}h ago`
          : "DR-NRPG integration is fresh";

      checks.push({
        name: "DR-NRPG Liveness",
        status,
        message: msg,
        details: {
          isActive: drNrpg.isActive,
          lastSyncAt: lastSync,
        },
      });

      if (inactive && overallStatus !== "unhealthy") {
        overallStatus = "unhealthy";
      } else if (stale && overallStatus === "healthy") {
        overallStatus = "degraded";
      }
    }

    return NextResponse.json({
      status: overallStatus,
      checks,
      summary: {
        total: checks.length,
        passed: checks.filter((c) => c.status === "pass").length,
        warned: checks.filter((c) => c.status === "warn").length,
        failed: checks.filter((c) => c.status === "fail").length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Health Check] Error:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        error: "Failed to perform health check",
      },
      { status: 500 },
    );
  }
}
