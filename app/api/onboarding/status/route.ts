import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/get-api-session";
import { prisma } from "@/lib/prisma";
import { isPricingConfigured } from "@/lib/pricing/effective-pricing";
import {
  getEffectiveSubscription,
  getOrganizationOwner,
} from "@/lib/organization-credits";
import { getFailedOperatingProviderConnection } from "@/lib/workspace/provider-connections";
import { hasConfiguredAi } from "@/lib/services/integrations/ai-readiness";
import { describePlatformTrialCoverage } from "@/lib/ai/platform-trial-credential";
import {
  buildAiProviderOnboardingStep,
} from "@/lib/onboarding/ai-provider-step";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession(request);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        role: true,
        businessName: true,
        businessAddress: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        organizationId: true,
      },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    // Get effective subscription (Admin's for Managers/Technicians, own for Admins)
    const effectiveSub = await getEffectiveSubscription(session.user.id);

    // Subscription is no longer required for onboarding - users get 30 free credits to start

    // For Managers/Technicians, check Admin's onboarding status
    // For Admins, check their own onboarding status
    const isAdmin = user.role === "ADMIN";
    const isTeamMember = user.role === "MANAGER" || user.role === "USER";

    let businessProfileCompleted = !!(
      user.businessName && user.businessAddress
    );
    // RA-7026: org-first "is pricing configured?" so this agrees with the setup
    // stepper (which reads OrganizationPricingConfig) instead of only the user table.
    let pricingConfigured = false;

    if (isTeamMember) {
      // Get Admin's ID
      const ownerId = await getOrganizationOwner(session.user.id);
      if (ownerId) {
        // Check Admin's business profile
        const owner = await prisma.user.findUnique({
          where: { id: ownerId },
          select: {
            businessName: true,
            businessAddress: true,
          },
        });
        businessProfileCompleted = !!(
          owner?.businessName && owner?.businessAddress
        );

        // Check Admin's pricing configuration (org-first)
        pricingConfigured = await isPricingConfigured(prisma, ownerId);
      }
    } else {
      // Admin - check their own onboarding
      pricingConfigured = await isPricingConfigured(prisma, session.user.id);
    }

    // Check if user has created at least one report (check current user's reports, not Admin's)
    const reportCount = await prisma.report.count({
      where: {
        userId: session.user.id,
      },
    });

    // Canonical configuration takes precedence over stale legacy integrations.
    // This is a presence check, not live credential validation.
    let hasApiKey = await hasConfiguredAi(session.user.id);
    const byokOwnerId =
      (await getOrganizationOwner(session.user.id)) || session.user.id;
    if (!hasApiKey && (isAdmin || isTeamMember)) {
      // Preserve legacy DeepSeek support without selecting its plaintext key.
      const deepseek = await prisma.user.findFirst({
        where: {
          id: byokOwnerId,
          deepseekApiKey: { not: null },
          NOT: { deepseekApiKey: "" },
        },
        select: { id: true },
      });
      hasApiKey = Boolean(deepseek);
    }

    // RA-7428: a FAILED stored key is not "no key" — surface the rejection
    // (provider + when) so the dashboard does not say "add a key".
    let rejectedKey: { provider: string; rejectedAt: Date } | null = null;
    if (!hasApiKey) {
      const failed = await getFailedOperatingProviderConnection(byokOwnerId);
      if (failed) {
        rejectedKey = {
          provider: failed.provider,
          rejectedAt: failed.rejectedAt,
        };
      }
    }

    // Check if user is on trial (free user)
    const isTrial =
      effectiveSub?.subscriptionStatus === "TRIAL" ||
      user.subscriptionStatus === "TRIAL";

    // Check if user has connected property data (any PropertyLookup linked to their inspections)
    const propertyLookupCount = await prisma.propertyLookup.count({
      where: { inspection: { userId: session.user.id } },
    });

    // RA-6792: Reconcile first-run surfaces. The canonical first action that
    // reaches first value is "create an inspection → generate a report"
    // (matches /api/onboarding/first-run and the in-app first-run checklist).
    // Has the user created their first inspection yet?
    const inspectionCount = await prisma.inspection.count({
      where: { userId: session.user.id },
    });

    // RA-6792: For TRIAL users we hide/relabel steps that are NOT required to
    // reach first value. Business profile and pricing config are real setup
    // tasks but they do NOT block a trial user from creating an inspection and
    // generating a report, so we mark them clearly optional ("when you're
    // ready") and never count them as blocking incomplete steps for trials.
    // Paid users still see them as required.
    // RA-6801: funded trials generate on the platform key — BYOK is optional.
    // Paid / expired / zero-credit accounts still hard-require a workspace key.
    // RA-7569: a funded trial whose platform key is missing is still not a
    // BYOK hard gate — that is a platform-key fail, not "add your key".
    const trialCoverage = await describePlatformTrialCoverage(session.user.id);
    const steps = {
      ai_provider: buildAiProviderOnboardingStep({
        hasByokKey: hasApiKey,
        canUsePlatformTrial: trialCoverage.canUsePlatformTrial,
        fundedTrial: trialCoverage.fundedTrial,
        platformProviderStatus: trialCoverage.platformProviderStatus,
        rejectedKey,
      }),
      first_inspection: {
        completed: inspectionCount > 0,
        required: false, // Self-serve first value, not a hard gate
        title: "Create your first job",
        description:
          "Add the property, capture photos and moisture, and draw or import a floor plan — everything stays on one inspection.",
        route: "/dashboard/inspections/new",
      },
      first_report: {
        completed: reportCount > 0,
        required: false, // Informational — produced from an inspection
        title: "Generate your first report",
        description:
          "Produce an IICRC S500:2021 draft from the evidence you captured; you review and approve before it goes to the client.",
        route: "/dashboard/reports/new",
      },
      business_profile: {
        completed: businessProfileCompleted, // Uses Admin's profile for team members
        required: !isTrial, // Only required for paid users
        title: isTrial
          ? "Business details (optional for trial)"
          : "Business profile",
        description: isTrial
          ? "Legal name, address and contacts for letterhead — required before paid invoicing."
          : "Legal name, ABN, address and contacts on every report and invoice.",
        route: "/dashboard/settings",
      },
      pricing_config: {
        completed: pricingConfigured, // org-first; team members use Admin's config
        required: !isTrial, // Only required for paid users (locked for free users)
        title: isTrial
          ? "Rate card (optional for trial)"
          : "Pricing & rate card",
        description:
          "Set labour and line-item rates once — estimates and invoices pull from here with GST applied.",
        route: "/dashboard/pricing-config",
      },
      property_data: {
        completed: propertyLookupCount > 0,
        required: false, // Optional — skippable
        title: "Property lookup (optional)",
        description:
          "Prefill address and floor-plan hints from public property data when starting a job.",
        route: "/dashboard/integrations",
      },
    };

    // Get incomplete required steps
    const incompleteSteps = Object.entries(steps)
      .filter(([, step]) => step.required && !step.completed)
      .map(([key]) => key);

    const isComplete = incompleteSteps.length === 0;

    return NextResponse.json({
      isComplete,
      incompleteSteps,
      steps,
      nextStep: incompleteSteps.length > 0 ? incompleteSteps[0] : null,
    });
  } catch (error) {
    return fromException(request, error, { stage: "status" });
  }
}
