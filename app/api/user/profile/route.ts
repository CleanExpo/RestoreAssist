import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { stripe } from "@/lib/stripe";
import { getUserReportLimits } from "@/lib/report-limits";
import {
  getTrialStatus,
  checkAndUpdateTrialStatus,
} from "@/lib/trial-handling";
import { sanitizeString, isValidABN } from "@/lib/sanitize";
import { PRICING_CONFIG } from "@/lib/pricing";

// Free-trial grant — sourced from PRICING_CONFIG (the SSOT) so the profile
// auto-create path grants the same 15-day / 30-credit trial as email/register,
// Google OAuth and native iOS. See lib/__tests__/pricing-integrity.test.ts.
const TRIAL_REPORT_CREDITS = PRICING_CONFIG.free.trialReportCredits;
const TRIAL_QUICK_FILL_CREDITS = PRICING_CONFIG.free.trialQuickFillCredits;
const TRIAL_DAYS = PRICING_CONFIG.free.trialDays;
const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

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
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionId: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
        lastBillingDate: true,
        nextBillingDate: true,
        businessName: true,
        businessAddress: true,
        businessLogo: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
        addonReports: true,
        monthlyReportsUsed: true,
        monthlyResetDate: true,
        organizationId: true,
        lifetimeAccess: true,
        // RA-1260 — surface 2FA state so /dashboard/security can render
        // the correct on/off panel without a second round-trip.
        twoFactorEnabled: true,
        // perf — select role + org owner here so the effective-subscription
        // and organization-owner logic can be inlined below without
        // re-fetching this same user row multiple times.
        role: true,
        organization: { select: { ownerId: true } },
      },
    });

    if (!user) {
      // Create Stripe customer for new user
      let stripeCustomerId = null;
      try {
        const stripeCustomer = await stripe.customers.create({
          email: session.user.email!,
          name: session.user.name || undefined,
          metadata: {
            userId: session.user.id,
          },
        });
        stripeCustomerId = stripeCustomer.id;
      } catch (stripeError) {
        console.error("Error creating Stripe customer:", stripeError);
        // Continue without Stripe customer ID - user can still use the app
      }

      // If user doesn't exist in database, create a basic profile
      const newUser = await prisma.user.create({
        data: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email!,
          image: session.user.image,
          subscriptionStatus: "TRIAL",
          creditsRemaining: TRIAL_REPORT_CREDITS,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + TRIAL_DURATION_MS), // 15-day free trial
          quickFillCreditsRemaining: TRIAL_QUICK_FILL_CREDITS,
          totalQuickFillUsed: 0,
          stripeCustomerId: stripeCustomerId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          subscriptionStatus: true,
          subscriptionPlan: true,
          subscriptionId: true,
          stripeCustomerId: true,
          trialEndsAt: true,
          subscriptionEndsAt: true,
          creditsRemaining: true,
          totalCreditsUsed: true,
          quickFillCreditsRemaining: true,
          totalQuickFillUsed: true,
          lastBillingDate: true,
          nextBillingDate: true,
          businessName: true,
          businessAddress: true,
          businessLogo: true,
          businessABN: true,
          businessPhone: true,
          businessEmail: true,
        },
      });

      const newTrialEndsAt = newUser.trialEndsAt
        ? new Date(newUser.trialEndsAt)
        : null;
      // The trial is capped at the granted credit count — it is NOT unlimited.
      // Surface the real remaining balance so the dashboard tells the truth.
      const newTrialActive = !newTrialEndsAt || new Date() <= newTrialEndsAt;
      return NextResponse.json({
        profile: {
          ...newUser,
          creditsRemaining: newUser.creditsRemaining,
          createdAt: newUser.createdAt.toISOString(),
          trialEndsAt: newUser.trialEndsAt?.toISOString(),
          subscriptionEndsAt: newUser.subscriptionEndsAt?.toISOString(),
          lastBillingDate: newUser.lastBillingDate?.toISOString(),
          nextBillingDate: newUser.nextBillingDate?.toISOString(),
          trialStatus: newTrialActive
            ? {
                isTrialActive: true,
                daysRemaining: TRIAL_DAYS,
                hasTrialExpired: false,
                creditsRemaining: newUser.creditsRemaining,
                hasUnlimitedTrial: false,
              }
            : null,
        },
      });
    }

    // perf — Inlined effective-subscription + organization-owner logic.
    //
    // The previous implementation made ~6 serial DB round trips per request:
    // getEffectiveSubscription() called getOrganizationOwner() (1 query) then
    // re-fetched the effective user row (1 query); getOrganizationOwner() was
    // then called AGAIN separately (1 query); and a third findUnique fetched
    // the owner's business info (1 query) — most of them re-reading the SAME
    // user row already loaded above. That produced a 9.5–16s tail.
    //
    // We already select `role` and `organization.ownerId` on the main user
    // row, so the owner id is derivable with zero extra queries. The single
    // owner fetch below (only for team members) now covers BOTH the effective
    // subscription source AND the business-info source. Net: ~6 → ~3 round
    // trips with no behavior change.

    // Mirror getOrganizationOwner() exactly: ADMIN owns themselves; otherwise
    // the org owner if linked; otherwise null.
    const ownerId =
      user.role === "ADMIN"
        ? user.id
        : user.organizationId && user.organization?.ownerId
          ? user.organization.ownerId
          : null;
    const isTeamMember = !!ownerId && ownerId !== user.id;

    // Fetch the owner row ONCE, only for team members. This single row replaces
    // both getEffectiveSubscription's internal owner fetch and the separate
    // business-info fetch.
    const owner = isTeamMember
      ? await prisma.user.findUnique({
          where: { id: ownerId! },
          select: {
            subscriptionStatus: true,
            subscriptionPlan: true,
            creditsRemaining: true,
            trialEndsAt: true,
            lifetimeAccess: true,
            businessName: true,
            businessAddress: true,
            businessLogo: true,
            businessABN: true,
            businessPhone: true,
            businessEmail: true,
          },
        })
      : null;

    // Effective source: owner row for team members, else the user's own row.
    // Mirror getEffectiveSubscription's lifetimeAccess overrides exactly.
    const effSource = isTeamMember ? owner : user;
    const effLifetime = !!effSource?.lifetimeAccess;
    const effStatus = effLifetime
      ? "ACTIVE"
      : (effSource?.subscriptionStatus ?? null);
    const effPlan = effLifetime
      ? "Lifetime"
      : (effSource?.subscriptionPlan ?? null);
    const effCredits = effLifetime
      ? 999999
      : (effSource?.creditsRemaining ?? null);

    // For Managers/Technicians, use Admin's business information; else own.
    const businessInfo =
      isTeamMember && owner
        ? {
            businessName: owner.businessName,
            businessAddress: owner.businessAddress,
            businessLogo: owner.businessLogo,
            businessABN: owner.businessABN,
            businessPhone: owner.businessPhone,
            businessEmail: owner.businessEmail,
          }
        : {
            businessName: user.businessName,
            businessAddress: user.businessAddress,
            businessLogo: user.businessLogo,
            businessABN: user.businessABN,
            businessPhone: user.businessPhone,
            businessEmail: user.businessEmail,
          };

    const subscriptionStatus = effStatus || user.subscriptionStatus;
    const subscriptionPlan = effPlan || user.subscriptionPlan;
    // The 15-day trial is CAPPED at the granted credit count, not unlimited.
    // Always surface the real remaining balance for trial users so the
    // dashboard copy matches the enforced report cap.
    const creditsRemaining = effCredits ?? user.creditsRemaining;

    // Get report limits for active subscribers (use owner's account for team members)
    let reportLimits = null;
    if (subscriptionStatus === "ACTIVE") {
      try {
        // For team members, get limits from owner's account
        const targetUserId = ownerId || user.id;
        reportLimits = await getUserReportLimits(targetUserId);
      } catch {
        // Error fetching report limits
      }
    }

    // Get trial status for trial users
    let trialStatus = null;
    if (subscriptionStatus === "TRIAL") {
      // Check and update trial status if expired
      await checkAndUpdateTrialStatus(user.id);
      trialStatus = await getTrialStatus(user.id);
    }

    const isLifetime = subscriptionPlan === "Lifetime";
    return NextResponse.json({
      profile: {
        ...user,
        // Override with effective subscription for team members
        subscriptionStatus: trialStatus?.hasTrialExpired
          ? "EXPIRED"
          : subscriptionStatus,
        subscriptionPlan: subscriptionPlan,
        creditsRemaining: creditsRemaining,
        // Lifetime: no trial or billing dates
        trialEndsAt: isLifetime ? null : user.trialEndsAt?.toISOString(),
        nextBillingDate: isLifetime
          ? null
          : user.nextBillingDate?.toISOString(),
        // Override with Admin's business info for team members
        businessName: businessInfo.businessName,
        businessAddress: businessInfo.businessAddress,
        businessLogo: businessInfo.businessLogo,
        businessABN: businessInfo.businessABN,
        businessPhone: businessInfo.businessPhone,
        businessEmail: businessInfo.businessEmail,
        // Include organizationId to check if user is linked to Admin
        organizationId: user.organizationId,
        createdAt: user.createdAt.toISOString(),
        subscriptionEndsAt: user.subscriptionEndsAt?.toISOString(),
        lastBillingDate: user.lastBillingDate?.toISOString(),
        monthlyResetDate: user.monthlyResetDate?.toISOString(),
        reportLimits: reportLimits,
        trialStatus: isLifetime
          ? null
          : trialStatus
            ? {
                isTrialActive: trialStatus.isTrialActive,
                daysRemaining: trialStatus.daysRemaining,
                hasTrialExpired: trialStatus.hasTrialExpired,
                creditsRemaining: trialStatus.creditsRemaining,
                hasUnlimitedTrial: false,
              }
            : null,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "profile:get" });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const csrfError = validateCsrf(request);
    if (csrfError) return csrfError;

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Get user's role to check permissions
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const isAdmin = user.role === "ADMIN";

    let body: any;
    try {
      const parsed = await request.json();
      body = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    const name = sanitizeString(body.name, 200);
    const email = body.email
      ? sanitizeString(body.email, 320).toLowerCase()
      : undefined;
    const businessName = sanitizeString(body.businessName, 200);
    const businessAddress = sanitizeString(body.businessAddress, 500);
    const businessLogo = sanitizeString(body.businessLogo, 2000);
    const businessABNRaw = sanitizeString(body.businessABN, 20);
    // Validate ABN using ATO weighted-sum checksum — invalid ABNs on tax invoices
    // require recipients to withhold 47% PAYG (GST Act compliance).
    if (businessABNRaw && !isValidABN(businessABNRaw)) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "Invalid ABN — please enter a valid 11-digit Australian Business Number",
        status: 400,
      });
    }
    const businessABN = businessABNRaw || "";
    const businessPhone = sanitizeString(body.businessPhone, 50);
    const businessEmail = sanitizeString(body.businessEmail, 320);

    // Build update data object
    const updateData: any = {};

    // All users can update their name
    if (name !== undefined) updateData.name = name;

    // Email updates (if needed in future)
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email,
          id: { not: session.user.id },
        },
      });

      if (existingUser) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Email already in use",
          status: 400,
        });
      }
      updateData.email = email;
    }

    // Business information fields - only Admins can update
    if (isAdmin) {
      if (businessName !== undefined) updateData.businessName = businessName;
      if (businessAddress !== undefined)
        updateData.businessAddress = businessAddress;
      if (businessLogo !== undefined) updateData.businessLogo = businessLogo;
      if (businessABN !== undefined) updateData.businessABN = businessABN;
      if (businessPhone !== undefined) updateData.businessPhone = businessPhone;
      if (businessEmail !== undefined) updateData.businessEmail = businessEmail;
    } else {
      // Managers/Technicians cannot update business info
      // If they try, ignore those fields (they're read-only)
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionId: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
        lastBillingDate: true,
        nextBillingDate: true,
        businessName: true,
        businessAddress: true,
        businessLogo: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
        role: true,
        organizationId: true,
      },
    });

    // For Managers/Technicians, get Admin's business info
    let businessInfo = {
      businessName: updatedUser.businessName,
      businessAddress: updatedUser.businessAddress,
      businessLogo: updatedUser.businessLogo,
      businessABN: updatedUser.businessABN,
      businessPhone: updatedUser.businessPhone,
      businessEmail: updatedUser.businessEmail,
    };

    if (!isAdmin && updatedUser.organizationId) {
      const { getOrganizationOwner } =
        await import("@/lib/organization-credits");
      const ownerId = await getOrganizationOwner(updatedUser.id);

      if (ownerId && ownerId !== updatedUser.id) {
        const owner = await prisma.user.findUnique({
          where: { id: ownerId },
          select: {
            businessName: true,
            businessAddress: true,
            businessLogo: true,
            businessABN: true,
            businessPhone: true,
            businessEmail: true,
          },
        });

        if (owner) {
          businessInfo = {
            businessName: owner.businessName,
            businessAddress: owner.businessAddress,
            businessLogo: owner.businessLogo,
            businessABN: owner.businessABN,
            businessPhone: owner.businessPhone,
            businessEmail: owner.businessEmail,
          };
        }
      }
    }

    return NextResponse.json({
      profile: {
        ...updatedUser,
        // Override with Admin's business info for Managers/Technicians
        businessName: businessInfo.businessName,
        businessAddress: businessInfo.businessAddress,
        businessLogo: businessInfo.businessLogo,
        businessABN: businessInfo.businessABN,
        businessPhone: businessInfo.businessPhone,
        businessEmail: businessInfo.businessEmail,
        createdAt: updatedUser.createdAt.toISOString(),
        trialEndsAt: updatedUser.trialEndsAt?.toISOString(),
        subscriptionEndsAt: updatedUser.subscriptionEndsAt?.toISOString(),
        lastBillingDate: updatedUser.lastBillingDate?.toISOString(),
        nextBillingDate: updatedUser.nextBillingDate?.toISOString(),
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "profile:put" });
  }
}
