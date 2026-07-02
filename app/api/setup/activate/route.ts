import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAllChecks } from "@/lib/setup/checks";
import { sendWelcomeEmail } from "@/lib/email";
import { TRIAL_DAYS } from "@/lib/billing/constants";
import { apiError, fromException } from "@/lib/api-errors";

// TODO(setup-wizard Phase 7+): wire to existing analytics if one emerges
function recordActivationAnalytics(payload: Record<string, unknown>): void {
  console.log("[setup] activation analytics", payload);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const userId = session.user.id;

    const org = await prisma.organization.findFirst({
      where: { ownerId: userId },
      select: {
        id: true,
        setupStartedAt: true,
        setupCompletedAt: true,
        setupMode: true,
        logoUrl: true,
        primaryColor: true,
        accentColor: true,
      },
    });
    if (!org) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "No organization for this user",
        status: 404,
      });
    }
    if (org.setupCompletedAt) {
      return apiError(request, {
        code: "CONFLICT",
        message: "Setup already activated",
        status: 409,
      });
    }

    // 1. Re-run pre-flight checks (defence-in-depth — UI already checked but server is authoritative)
    const checks = await runAllChecks(org.id);
    const reds = checks.filter((c) => c.status === "red");
    if (reds.length > 0) {
      // RA-1548 — kept raw: carries a top-level `failedChecks` sibling array
      // the setup wizard reads to render which capabilities blocked activation
      // (test-pinned to `json.failedChecks`), so it stays off the envelope.
      return NextResponse.json(
        {
          error: "Pre-flight checks failed",
          failedChecks: reds.map((c) => ({
            capability: c.capability,
            label: c.label,
            note: c.note,
          })),
        },
        { status: 400 },
      );
    }

    // 2–5: single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 2. Propagate branding → InvoiceTemplate (per-user FK, update default template if one exists)
      if (org.logoUrl || org.primaryColor) {
        await tx.invoiceTemplate.updateMany({
          where: { userId, isDefault: true },
          data: {
            ...(org.logoUrl ? { logoUrl: org.logoUrl } : {}),
            ...(org.primaryColor ? { primaryColor: org.primaryColor } : {}),
            ...(org.accentColor ? { accentColor: org.accentColor } : {}),
          },
        });
      }

      // 3. Seed sample Client + Report (idempotent: skip if already seeded)
      const existingSample = await tx.client.findFirst({
        where: { userId, isSample: true },
        select: { id: true },
      });

      if (!existingSample) {
        const sampleClient = await tx.client.create({
          data: {
            userId,
            name: "Sample Insurance Co.",
            email: `sample-client-${userId}@example.com`,
            phone: "1300 000 000",
            company: "Sample Insurance Co.",
            isSample: true,
          },
          select: { id: true },
        });

        await tx.report.create({
          data: {
            userId,
            clientId: sampleClient.id,
            title: "Sample Water Damage Assessment",
            clientName: "Sample Insurance Co.",
            propertyAddress: "1 Demo Street, Sydney NSW 2000",
            hazardType: "Water Damage",
            insuranceType: "Building & Contents",
            isSample: true,
          },
        });
      }

      // 4. Mark Organization as setup-complete
      const updated = await tx.organization.update({
        where: { id: org.id },
        data: { setupCompletedAt: new Date() },
        select: {
          id: true,
          setupMode: true,
          setupStartedAt: true,
          setupCompletedAt: true,
        },
      });

      return updated;
    });

    // 5. Analytics + email AFTER transaction (fire-and-forget; mustn't block the response)
    const timeToActivate = result.setupStartedAt
      ? result.setupCompletedAt!.getTime() - result.setupStartedAt.getTime()
      : null;

    recordActivationAnalytics({
      organizationId: result.id,
      setupMode: result.setupMode,
      timeToActivateMs: timeToActivate,
      hydrationSuccess: checks.filter((c) => c.status === "green").length,
      optionalSkipped: checks.filter((c) => c.status === "yellow").length,
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (user) {
      void Promise.resolve(
        sendWelcomeEmail({
          recipientEmail: user.email,
          recipientName: user.name ?? user.email,
          loginUrl: `${process.env.NEXTAUTH_URL ?? "https://restoreassist.app"}/dashboard`,
          trialDays: TRIAL_DAYS,
          trialCredits: 10,
        }),
      ).catch((err) =>
        console.error("[setup] welcome email dispatch failed:", err),
      );
    }

    return NextResponse.json({
      data: {
        organizationId: result.id,
        redirectTo: "/dashboard?firstRun=1",
      },
    });
  } catch (err) {
    return fromException(request, err, { stage: "setup/activate:post" });
  }
}
