import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getEffectiveSubscription,
  getOrganizationOwner,
} from "@/lib/organization-credits";
import { hasActiveOperatingProviderConnection } from "@/lib/workspace/provider-connections";

export const AI_PROVIDER_ROUTE = "/dashboard/settings/ai-providers";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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
    let integration = null;
    let pricingConfig = null;

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

        // Check Admin's integrations
        integration = await prisma.integration.findFirst({
          where: {
            userId: ownerId,
            status: "CONNECTED",
            OR: [
              { name: { contains: "Anthropic" } },
              { name: { contains: "OpenAI" } },
              { name: { contains: "Gemini" } },
              { name: { contains: "Claude" } },
              { name: { contains: "GPT" } },
            ],
          },
          select: {
            apiKey: true,
          },
        });

        // Check Admin's pricing configuration
        pricingConfig = await prisma.companyPricingConfig.findUnique({
          where: {
            userId: ownerId,
          },
        });
      }
    } else {
      // Admin - check their own onboarding
      integration = await prisma.integration.findFirst({
        where: {
          userId: session.user.id,
          status: "CONNECTED",
          OR: [
            { name: { contains: "Anthropic" } },
            { name: { contains: "OpenAI" } },
            { name: { contains: "Gemini" } },
            { name: { contains: "Claude" } },
            { name: { contains: "GPT" } },
          ],
        },
        select: {
          apiKey: true,
        },
      });

      pricingConfig = await prisma.companyPricingConfig.findUnique({
        where: {
          userId: session.user.id,
        },
      });
    }

    // Check if user has created at least one report (check current user's reports, not Admin's)
    const reportCount = await prisma.report.count({
      where: {
        userId: session.user.id,
      },
    });

    // Check for Deepseek API key (for free users) or regular integrations (for paid users)
    let hasApiKey = !!integration?.apiKey;
    if (!hasApiKey && isAdmin) {
      // Check for Deepseek API key for free users
      const adminUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { deepseekApiKey: true },
      });
      hasApiKey = !!adminUser?.deepseekApiKey;
    } else if (!hasApiKey && isTeamMember) {
      // For team members, check Admin's Deepseek API key
      const ownerId = await getOrganizationOwner(session.user.id);
      if (ownerId) {
        const owner = await prisma.user.findUnique({
          where: { id: ownerId },
          select: { deepseekApiKey: true },
        });
        hasApiKey = !!owner?.deepseekApiKey;
      }
    }

    // RA-6801: Recognise a key saved via the new BYOK store. The onboarding
    // "Add your AI key" card writes to ProviderConnection (workspace BYOK),
    // NOT the legacy Integration table checked above — so without this bridge
    // a user who completed that card would still be nagged to add a key, and
    // onboarding/status would disagree with the setup gate (byok_keys check),
    // which already reads ProviderConnection. Resolve the workspace owner
    // (Admin's for team members) and check for an ACTIVE Anthropic/OpenAI key.
    if (!hasApiKey) {
      const byokOwnerId = isTeamMember
        ? await getOrganizationOwner(session.user.id)
        : session.user.id;
      if (byokOwnerId) {
        hasApiKey = await hasActiveOperatingProviderConnection(byokOwnerId);
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
    const steps = {
      // RA-6801 / RA-6799: Surface the AI key requirement early in onboarding.
      // Trial users have platform-key coverage; paid users without BYOK are
      // blocked on report generation. Required = true for paid users only.
      ai_provider: {
        completed: hasApiKey,
        required: !hasApiKey,
        title: hasApiKey
          ? "AI provider key configured"
          : "Add your Anthropic or OpenAI API key",
        description: hasApiKey
          ? "An Anthropic or OpenAI API key is configured — AI report generation is active."
          : "An Anthropic or OpenAI API key is required to operate RestoreAssist. You pay providers directly, at cost. Add it in Settings → AI Providers.",
        route: AI_PROVIDER_ROUTE,
      },
      first_inspection: {
        completed: inspectionCount > 0,
        required: false, // Self-serve first value, not a hard gate
        title: "Create your first inspection",
        description: "Capture field data for a water damage job to get started",
        route: "/dashboard/inspections/new",
      },
      first_report: {
        completed: reportCount > 0,
        required: false, // Informational — produced from an inspection
        title: "Generate your first report",
        description:
          "Turn an inspection into an IICRC S500:2021 compliance report",
        route: "/dashboard/reports/new",
      },
      business_profile: {
        completed: businessProfileCompleted, // Uses Admin's profile for team members
        required: !isTrial, // Only required for paid users
        title: isTrial ? "Add business details (when you're ready)" : "Settings & Profile",
        description: "Setup Business Details",
        route: "/dashboard/settings",
      },
      pricing_config: {
        completed: !!pricingConfig, // Uses Admin's pricing config for team members
        required: !isTrial, // Only required for paid users (locked for free users)
        title: isTrial
          ? "Configure pricing (when you're ready)"
          : "Pricing Configuration",
        description: "Set up your company pricing rates",
        route: "/dashboard/pricing-config",
      },
      property_data: {
        completed: propertyLookupCount > 0,
        required: false, // Optional — skippable
        title: "Connect Property Data",
        description:
          "Auto-fill inspections with property details and floor plans via Claude in Chrome",
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
    console.error("Error checking onboarding status:", error);
    return NextResponse.json(
      { error: "Failed to check onboarding status" },
      { status: 500 },
    );
  }
}
