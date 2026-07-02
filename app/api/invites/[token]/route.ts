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
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { validateCsrf } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limiter";
import { isUserInviteToken } from "@/lib/public-token-shape";
import { apiError } from "@/lib/api-errors";

interface RouteContext {
  params: Promise<{ token: string }>;
}

function roleLabel(role: string) {
  if (role === "MANAGER") return "Manager";
  if (role === "USER") return "Technician";
  return role;
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

  const csrfError = validateCsrf(req);
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
    },
  });

  if (!invite) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Invite not found",
      status: 404,
    });
  }

  if (invite.usedAt) {
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

  // Google-OAuth completion path — the user record already exists (created
  // by NextAuth when the invitee signed in with Google). We attach the org +
  // phone + headshot and mark the invite used.
  if (isGoogle) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: invite.email.toLowerCase() },
      select: { id: true },
    });
    if (!existingByEmail) {
      return apiError(req, {
        code: "VALIDATION",
        message: "Google user not found for this invite",
        status: 400,
      });
    }
    const { uploadDataUrl } = await import("@/lib/cloudinary");
    let headshotUrl: string;
    try {
      headshotUrl = await uploadDataUrl(headshotDataUrl, {
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
    await prisma.user.update({
      where: { id: existingByEmail.id },
      data: { phone, image: headshotUrl, name } as any,
    });
    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // Guard against a race with a separate registration on the same email —
  // the UI for this page is gated behind a valid unused token, but someone
  // could have registered via /signup in parallel.
  const existing = await prisma.user.findUnique({
    where: { email: invite.email.toLowerCase() },
    select: { id: true },
  });
  if (existing) {
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
  const { uploadDataUrl } = await import("@/lib/cloudinary");
  let headshotUrl: string;
  try {
    headshotUrl = await uploadDataUrl(headshotDataUrl, {
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
  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        email: invite.email.toLowerCase(),
        name,
        password: hashedPassword,
        role: invite.role,
        organizationId: invite.organizationId,
        managedById: invite.managedById,
        phone,
        image: headshotUrl,
        // Invited members don't have their own trial credits —
        // they share the Admin org's credits.
        subscriptionStatus: null,
        creditsRemaining: null,
        totalCreditsUsed: 0,
        mustChangePassword: false,
        acceptedTermsAt: new Date() as any,
      } as any,
    });

    await tx.userInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
  });

  return NextResponse.json({
    success: true,
    message: "Account created. You can now sign in.",
    email: invite.email.toLowerCase(),
  });
}
