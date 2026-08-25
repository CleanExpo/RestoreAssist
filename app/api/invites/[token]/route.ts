/**
 * RA-1249 — Invite token preview + acceptance.
 *
 * GET  /api/invites/[token]  (public, no auth)
 *   Returns org name, inviter name, role, email, and expiresAt.
 *   404 on unknown/used tokens. 410 on expired.
 *
 * POST /api/invites/[token]  (public, no auth — the session is created as part of acceptance)
 *   Body: { name: string, password: string }
 *   - Creates the User in the invite's organization
 *   - Marks invite used
 *   - 400 on weak password (<12 chars) or missing name
 *   - 410 on expired
 *   - 409 if email already has an account (shouldn't happen — team/invites POST guards against this)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { sanitizeString } from "@/lib/sanitize";
import { validateCsrf } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limiter";
import { isUserInviteToken } from "@/lib/public-token-shape";
import { apiError } from "@/lib/api-errors";
import { rejectIfBreached } from "@/lib/auth/password-breach";
import { canonicalEmail } from "@/lib/email-identity";
import crypto from "node:crypto";

interface RouteContext {
  params: Promise<{ token: string }>;
}

class InviteClaimConflict extends Error {}

function roleLabel(role: string) {
  if (role === "MANAGER") return "Manager";
  if (role === "USER") return "Technician";
  return role;
}

function isAssignableInviteRole(role: string): role is "MANAGER" | "USER" {
  return role === "MANAGER" || role === "USER";
}

type AcceptanceProvider = "credentials" | "google";

function acceptanceResponse(
  provider: AcceptanceProvider,
  email: string,
  replayed = false,
) {
  if (provider === "google") {
    return NextResponse.json({ ok: true, replayed });
  }
  return NextResponse.json({
    success: true,
    message: "Account created. You can now sign in.",
    email: canonicalEmail(email),
    replayed,
  });
}

async function replayAcceptance(
  req: NextRequest,
  invite: {
    email: string;
    organizationId: string;
    usedAt: Date | null;
    acceptedUserId: string | null;
    acceptanceProvider: string | null;
    acceptancePayloadHash: string | null;
  },
  provider: AcceptanceProvider,
  expectedPayloadHash: string,
): Promise<NextResponse | null> {
  if (
    !invite.usedAt ||
    !invite.acceptedUserId ||
    invite.acceptanceProvider !== provider ||
    invite.acceptancePayloadHash !== expectedPayloadHash
  ) {
    return null;
  }

  if (provider === "google") {
    const session = await getServerSession(authOptions);
    if (session?.user?.id !== invite.acceptedUserId) return null;
  }

  const acceptedUser = await prisma.user.findFirst({
    where: {
      id: invite.acceptedUserId,
      organizationId: invite.organizationId,
      email: { equals: invite.email, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (!acceptedUser) {
    return apiError(req, {
      code: "CONFLICT",
      message: "Invitation receipt no longer matches the accepted account",
      status: 409,
    });
  }

  return acceptanceResponse(provider, invite.email, true);
}

function acceptancePayloadHash(input: {
  provider: AcceptanceProvider;
  name: string;
  phone: string;
  headshotDataUrl: string;
  password: string;
}): string | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const headshotHash = crypto
    .createHash("sha256")
    .update(input.headshotDataUrl)
    .digest("hex");
  // HMAC binds a credentials retry to the original password without storing a
  // reusable password or an offline-comparable unkeyed password digest.
  return crypto
    .createHmac("sha256", secret)
    .update(
      JSON.stringify([
        input.provider,
        input.name,
        input.phone,
        headshotHash,
        input.password,
        true,
        true,
      ]),
    )
    .digest("hex");
}

async function deleteLosingHeadshot(publicId: string) {
  try {
    const { deleteImage } = await import("@/lib/cloudinary");
    await deleteImage(publicId);
  } catch (error) {
    console.error(
      "[POST /api/invites/[token]] Failed to delete unclaimed headshot",
      error,
    );
    await (prisma as any).mediaCleanupTask.upsert({
      where: { publicId },
      create: {
        publicId,
        reason: "invite_acceptance_not_committed",
        status: "PENDING",
        attemptCount: 1,
        lastError:
          error instanceof Error ? error.message.slice(0, 500) : "unknown",
      },
      update: {
        status: "PENDING",
        attemptCount: { increment: 1 },
        lastError:
          error instanceof Error ? error.message.slice(0, 500) : "unknown",
      },
    });
    throw new Error("Headshot cleanup queued; invitation result is unresolved");
  }
}

// ─── GET — preview the invite ──────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteContext) {
  const rateLimited = await applyRateLimit(req, {
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
    prefix: "invite-preview",
  });
  if (rateLimited) return rateLimited;

  const { token } = await params;
  if (!token) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Token required",
      status: 400,
    });
  }

  if (!isUserInviteToken(token)) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Invite not found",
      status: 404,
    });
  }

  const invite = await prisma.userInvite.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      usedAt: true,
      organization: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (!invite) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Invite not found",
      status: 404,
    });
  }

  if (!isAssignableInviteRole(invite.role)) {
    return apiError(req, {
      code: "CONFLICT",
      message: "This invitation carries an unsupported role",
      status: 409,
    });
  }

  if (invite.usedAt) {
    return apiError(req, {
      code: "GONE",
      message: "This invite has already been used. Please sign in instead.",
      status: 410,
    });
  }

  if (invite.expiresAt < new Date()) {
    return apiError(req, {
      code: "GONE",
      message: "This invite has expired. Ask the inviter to resend it.",
      status: 410,
    });
  }

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    roleLabel: roleLabel(invite.role),
    organizationName: invite.organization.name,
    inviterName: invite.createdBy.name ?? "your team administrator",
    expiresAt: invite.expiresAt.toISOString(),
  });
}

// ─── POST — accept the invite ──────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  const rateLimited = await applyRateLimit(req, {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
    prefix: "invite-accept",
  });
  if (rateLimited) return rateLimited;

  const csrfError = validateCsrf(req, { requireOrigin: true });
  if (csrfError) return csrfError;

  const { token } = await params;
  if (!token) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Token required",
      status: 400,
    });
  }

  if (!isUserInviteToken(token)) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Invite not found",
      status: 404,
    });
  }

  let body: {
    provider?: "google";
    name?: string;
    password?: string;
    phone?: string;
    headshotDataUrl?: string;
    acceptedTerms?: boolean;
    acceptedChainOfCustody?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid request body",
      status: 400,
    });
  }

  const name = sanitizeString(body.name, 200);
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Name is required",
      status: 400,
    });
  }

  // Google path skips password; email path keeps the existing length check.
  const isGoogle = body.provider === "google";

  // RA-1258 / RA-1342 — align with register + change-password min length.
  if (!isGoogle && password.length < 12) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Password must be at least 12 characters",
      status: 400,
    });
  }

  if (body.acceptedTerms !== true) {
    return apiError(req, {
      code: "VALIDATION",
      message: "You must accept the Terms of Service and Privacy Policy",
      status: 400,
    });
  }

  // Phone is required on both paths.
  const rawPhone = typeof body.phone === "string" ? body.phone : "";
  const { normaliseAuMobile, isValidAuMobile } =
    await import("@/components/invite/phone-validator");
  if (!isValidAuMobile(rawPhone)) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Enter a 10-digit Australian mobile (04…)",
      status: 400,
    });
  }
  const phone = normaliseAuMobile(rawPhone);

  // Headshot is required on both paths. SP-7 Seam F — magic-byte + size
  // gate (CLAUDE.md rule 11). The client validator (validateHeadshotFile)
  // is UX-only; this is the security gate.
  const { validateHeadshotDataUrl } =
    await import("@/lib/headshot/validate-data-url");
  const headshotCheck = validateHeadshotDataUrl(body.headshotDataUrl);
  if (!headshotCheck.ok) {
    return apiError(req, {
      code: "VALIDATION",
      message: headshotCheck.error ?? "Invalid headshot image",
      status: 400,
    });
  }
  // Narrow for the rest of the function — the helper just confirmed it's a string.
  const headshotDataUrl: string = body.headshotDataUrl as string;

  if (body.acceptedChainOfCustody !== true) {
    return apiError(req, {
      code: "VALIDATION",
      message: "You must consent to evidence hashing",
      status: 400,
    });
  }

  const invite = await prisma.userInvite.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      organizationId: true,
      managedById: true,
      expiresAt: true,
      usedAt: true,
      acceptedUserId: true,
      acceptanceProvider: true,
      acceptancePayloadHash: true,
    },
  });

  if (!invite) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Invite not found",
      status: 404,
    });
  }

  if (!isAssignableInviteRole(invite.role)) {
    return apiError(req, {
      code: "CONFLICT",
      message: "This invitation carries an unsupported role",
      status: 409,
    });
  }

  const payloadHash = acceptancePayloadHash({
    provider: isGoogle ? "google" : "credentials",
    name,
    phone,
    headshotDataUrl,
    password: isGoogle ? "" : password,
  });
  if (!payloadHash) {
    return apiError(req, {
      code: "INTERNAL",
      message: "Invitation acceptance is temporarily unavailable",
      status: 503,
    });
  }

  if (invite.usedAt) {
    const replay = await replayAcceptance(
      req,
      invite,
      isGoogle ? "google" : "credentials",
      payloadHash,
    );
    if (replay) return replay;
    return apiError(req, {
      code: "GONE",
      message: "This invite has already been used",
      status: 410,
    });
  }

  if (invite.expiresAt < new Date()) {
    return apiError(req, {
      code: "GONE",
      message: "This invite has expired",
      status: 410,
    });
  }

  if (invite.managedById) {
    const manager = await prisma.user.findFirst({
      where: {
        id: invite.managedById,
        organizationId: invite.organizationId,
        role: { in: ["ADMIN", "MANAGER"] },
      },
      select: { id: true },
    });
    if (!manager) {
      return apiError(req, {
        code: "CONFLICT",
        message: "The manager assigned by this invitation is no longer valid",
        status: 409,
      });
    }
  }

  if (!isGoogle) {
    const breachMessage = await rejectIfBreached(password);
    if (breachMessage) {
      return apiError(req, {
        code: "VALIDATION",
        message: breachMessage,
        status: 400,
      });
    }
  }

  // Google-OAuth completion path — the user record already exists (created
  // by NextAuth when the invitee signed in with Google). We attach the org +
  // phone + headshot and mark the invite used.
  if (isGoogle) {
    const session = await getServerSession(authOptions);
    if (
      !session?.user?.id ||
      !session.user.email ||
      canonicalEmail(session.user.email) !== canonicalEmail(invite.email)
    ) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Sign in with the Google account named in this invitation",
        status: 401,
      });
    }
    const googleAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "google" },
      select: { id: true },
    });
    if (!googleAccount) {
      return apiError(req, {
        code: "FORBIDDEN",
        message: "A verified Google sign-in is required for this path",
        status: 403,
      });
    }
    const googleUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        name: true,
        organizationId: true,
        pendingInviteIdentity: true,
        ownedOrganizations: { select: { id: true }, take: 1 },
      },
    });
    if (
      !googleUser ||
      canonicalEmail(googleUser.email) !== canonicalEmail(invite.email) ||
      googleUser.organizationId !== null ||
      googleUser.ownedOrganizations.length > 0
    ) {
      return apiError(req, {
        code: "CONFLICT",
        message:
          "This Google account already belongs to a RestoreAssist organization and cannot be moved by an invitation.",
        status: 409,
      });
    }
    const { uploadDataUrlWithReceipt } = await import("@/lib/cloudinary");
    let headshotUpload: { url: string; publicId: string };
    try {
      headshotUpload = await uploadDataUrlWithReceipt(headshotDataUrl, {
        folder: "headshots",
        tags: ["headshot", "invite"],
      });
    } catch (err) {
      console.error(
        "[POST /api/invites/[token]] Cloudinary upload failed",
        err,
      );
      return apiError(req, {
        code: "UPSTREAM_FAILED",
        message: "Failed to upload headshot",
        status: 502,
        err,
        stage: "invite-accept:headshot-upload",
      });
    }
    try {
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        if (invite.managedById) {
          const manager = await tx.user.findFirst({
            where: {
              id: invite.managedById,
              organizationId: invite.organizationId,
              role: { in: ["ADMIN", "MANAGER"] },
            },
            select: { id: true },
          });
          if (!manager) throw new InviteClaimConflict();
        }
        const claimed = await tx.userInvite.updateMany({
          where: {
            id: invite.id,
            token,
            organizationId: invite.organizationId,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new InviteClaimConflict();

        // Re-assert that OAuth created an unassigned user. An existing owner or
        // member with the same email must never be silently moved across tenants.
        const attached = await tx.user.updateMany({
          where: {
            id: session.user.id,
            organizationId: null,
            pendingInviteIdentity: true,
          },
          data: {
            phone,
            image: headshotUpload.url,
            name: sanitizeString(googleUser.name, 200) || name,
            role: invite.role,
            organizationId: invite.organizationId,
            managedById: invite.managedById,
            needsOnboarding: false,
            acceptedTermsAt: now,
            subscriptionStatus: null,
            subscriptionPlan: null,
            subscriptionId: null,
            stripeCustomerId: null,
            trialEndsAt: null,
            subscriptionEndsAt: null,
            creditsRemaining: null,
            totalCreditsUsed: 0,
            quickFillCreditsRemaining: null,
            totalQuickFillUsed: 0,
            signupBonusApplied: false,
            pendingInviteIdentity: false,
          } as any,
        });
        if (attached.count !== 1) throw new InviteClaimConflict();
        await tx.userInvite.update({
          where: { id: invite.id },
          data: {
            acceptedUserId: session.user.id,
            acceptanceProvider: "google",
            acceptancePayloadHash: payloadHash,
          },
        });
      });
    } catch (error) {
      await deleteLosingHeadshot(headshotUpload.publicId);
      if (error instanceof InviteClaimConflict) {
        const committed = await prisma.userInvite.findUnique({
          where: { token },
          select: {
            email: true,
            organizationId: true,
            usedAt: true,
            acceptedUserId: true,
            acceptanceProvider: true,
            acceptancePayloadHash: true,
          },
        });
        if (committed) {
          const replay = await replayAcceptance(req, committed, "google", payloadHash);
          if (replay) return replay;
        }
        return apiError(req, {
          code: "CONFLICT",
          message:
            "This invitation was already accepted or the account changed",
          status: 409,
        });
      }
      throw error;
    }
    return acceptanceResponse("google", invite.email);
  }

  // Guard against a race with a separate registration on the same email —
  // the UI for this page is gated behind a valid unused token, but someone
  // could have registered via /signup in parallel.
  const existing = await prisma.user.findFirst({
    where: {
      email: { equals: invite.email, mode: "insensitive" },
    },
    select: {
      id: true,
      role: true,
      organizationId: true,
      subscriptionStatus: true,
      subscriptionPlan: true,
      subscriptionId: true,
      stripeCustomerId: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      creditsRemaining: true,
      quickFillCreditsRemaining: true,
      signupBonusApplied: true,
      pendingInviteIdentity: true,
      ownedOrganizations: { select: { id: true }, take: 1 },
    },
  });
  const isAdoptablePendingIdentity = Boolean(
    existing &&
      existing.role === "USER" &&
      existing.organizationId === null &&
      existing.subscriptionStatus === null &&
      existing.subscriptionPlan === null &&
      existing.subscriptionId === null &&
      existing.stripeCustomerId === null &&
      existing.trialEndsAt === null &&
      existing.subscriptionEndsAt === null &&
      existing.creditsRemaining === null &&
      existing.quickFillCreditsRemaining === null &&
      existing.signupBonusApplied === false &&
      existing.pendingInviteIdentity === true &&
      existing.ownedOrganizations.length === 0,
  );
  if (existing && !isAdoptablePendingIdentity) {
    return apiError(req, {
      code: "CONFLICT",
      message:
        "An account with this email already exists. Sign in, then ask an admin to re-link you to the organization.",
      status: 409,
    });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // Upload the headshot before the DB transaction — network I/O does not
  // belong inside a Prisma transaction.
  const { uploadDataUrlWithReceipt } = await import("@/lib/cloudinary");
  let headshotUpload: { url: string; publicId: string };
  try {
    headshotUpload = await uploadDataUrlWithReceipt(headshotDataUrl, {
      folder: "headshots",
      tags: ["headshot", "invite"],
    });
  } catch (err) {
    console.error("[POST /api/invites/[token]] Cloudinary upload failed", err);
    return NextResponse.json(
      { error: "Failed to upload headshot" },
      { status: 502 },
    );
  }

  // Create the user and mark the invite used atomically.
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      if (invite.managedById) {
        const manager = await tx.user.findFirst({
          where: {
            id: invite.managedById,
            organizationId: invite.organizationId,
            role: { in: ["ADMIN", "MANAGER"] },
          },
          select: { id: true },
        });
        if (!manager) throw new InviteClaimConflict();
      }
      const claimed = await tx.userInvite.updateMany({
        where: {
          id: invite.id,
          token,
          organizationId: invite.organizationId,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new InviteClaimConflict();

      const memberData = {
          email: canonicalEmail(invite.email),
          name,
          password: hashedPassword,
          role: invite.role,
          organizationId: invite.organizationId,
          managedById: invite.managedById,
          phone,
          image: headshotUpload.url,
          // Invited members don't have their own trial credits —
          // they share the Admin org's credits.
          subscriptionStatus: null,
          creditsRemaining: null,
          totalCreditsUsed: 0,
          mustChangePassword: false,
          acceptedTermsAt: now as any,
          pendingInviteIdentity: false,
        } as any;
      const createdUser = isAdoptablePendingIdentity && existing
        ? await tx.user.update({
            where: { id: existing.id, organizationId: null },
            data: memberData,
          })
        : await tx.user.create({ data: memberData });
      await tx.userInvite.update({
        where: { id: invite.id },
        data: {
          acceptedUserId: createdUser.id,
          acceptanceProvider: "credentials",
          acceptancePayloadHash: payloadHash,
        },
      });
    });
  } catch (error) {
    await deleteLosingHeadshot(headshotUpload.publicId);
    if (error instanceof InviteClaimConflict) {
      const committed = await prisma.userInvite.findUnique({
        where: { token },
        select: {
          email: true,
          organizationId: true,
          usedAt: true,
          acceptedUserId: true,
          acceptanceProvider: true,
          acceptancePayloadHash: true,
        },
      });
      if (committed) {
        const replay = await replayAcceptance(req, committed, "credentials", payloadHash);
        if (replay) return replay;
      }
      return apiError(req, {
        code: "CONFLICT",
        message: "This invitation was already accepted",
        status: 409,
      });
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const committed = await prisma.userInvite.findUnique({
        where: { token },
        select: {
          email: true,
          organizationId: true,
          usedAt: true,
          acceptedUserId: true,
          acceptanceProvider: true,
          acceptancePayloadHash: true,
        },
      });
      if (committed) {
        const replay = await replayAcceptance(req, committed, "credentials", payloadHash);
        if (replay) return replay;
      }
      return apiError(req, {
        code: "CONFLICT",
        message:
          "An account with this email was created while accepting the invitation",
        status: 409,
      });
    }
    throw error;
  }

  return acceptanceResponse("credentials", invite.email);
}
