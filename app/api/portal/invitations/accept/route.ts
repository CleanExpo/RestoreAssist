import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { applyRateLimit } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import { isPortalInvitationToken } from "@/lib/public-token-shape";
import { signClientPortalJwt } from "@/lib/portal/client-jwt";
import {
  claimInvitationForAcceptance,
  markInvitationExpired,
} from "@/lib/portal/invitation-transitions";
import {
  looksLikeRecoveryToken,
  recoveryLinkIsLive,
  verifyRecoveryToken,
} from "@/lib/portal/recovery-token";

/**
 * RA-8668 - the reply for an acceptance that lost a race: the invitation was
 * PENDING when it was read and is not any more. The status it has now decides
 * the reply, so the caller hears what a request arriving a moment later would.
 */
async function invitationNoLongerOpen(invitationId: string) {
  const current = await prisma.portalInvitation.findUnique({
    where: { id: invitationId },
    select: { status: true },
  });
  if (!current) {
    return NextResponse.json(
      { error: "Invalid invitation token" },
      { status: 404 },
    );
  }
  if (current.status === "ACCEPTED") {
    return NextResponse.json(
      { error: "Invitation already accepted" },
      { status: 400 },
    );
  }
  if (current.status === "REVOKED") {
    return NextResponse.json(
      { error: "Invitation has been revoked" },
      { status: 400 },
    );
  }
  if (current.status === "EXPIRED") {
    return NextResponse.json(
      { error: "Invitation has expired" },
      { status: 400 },
    );
  }
  // PENDING again: it changed and was reopened while this request ran.
  return NextResponse.json(
    { error: "This invitation changed while it was being accepted. Try again." },
    { status: 409 },
  );
}

/**
 * RA-8613 - set a new password for an existing portal account from the
 * stateless recovery link that was emailed to the account's address. The link
 * is checked against the account's CURRENT password hash and the hash is
 * replaced only where it is still that hash, so one link sets one password.
 */
async function recoverAccount(token: string, password: unknown) {
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters long" },
      { status: 400 },
    );
  }
  const refused = () =>
    NextResponse.json(
      { error: "This recovery link is invalid or has expired" },
      { status: 400 },
    );

  const claims = await verifyRecoveryToken(token);
  if (!claims) return refused();

  const account = await prisma.clientUser.findUnique({
    where: { id: claims.clientUserId },
  });
  if (
    !account ||
    account.clientId !== claims.clientId ||
    account.email.toLowerCase() !== claims.email.toLowerCase() ||
    !recoveryLinkIsLive(claims, account.passwordHash)
  ) {
    return refused();
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // Compare-and-set: of two simultaneous uses of one link only one finds the
  // old hash still in place. A new hash also changes the credential
  // fingerprint, so every earlier portal session is refused by requireClientAuth.
  const updated = await prisma.clientUser.updateMany({
    where: { id: account.id, passwordHash: account.passwordHash },
    data: { passwordHash, mustChangePassword: false },
  });
  if (updated.count !== 1) return refused();

  const portalToken = await signClientPortalJwt({
    clientUserId: account.id,
    clientId: account.clientId,
    email: account.email,
    name: account.name,
    passwordHash,
  });
  return NextResponse.json(
    {
      success: true,
      message: "Password updated",
      token: portalToken,
      clientUser: { id: account.id, email: account.email, name: account.name },
    },
    { status: 200 },
  );
}

// POST /api/portal/invitations/accept - Accept invitation and create ClientUser account,
// or (RA-8613) set a new password from an emailed recovery link
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
      prefix: "portal-invitation-accept",
    });
    if (rateLimited) return rateLimited;

    const csrfError = validateCsrf(request);
    if (csrfError) return csrfError;

    const body = await request.json();
    const { token, password, name, phone } = body;

    if (looksLikeRecoveryToken(token)) {
      return await recoverAccount(token, password);
    }

    if (!token || !password || !name) {
      return NextResponse.json(
        { error: "Token, password, and name are required" },
        { status: 400 },
      );
    }

    if (!isPortalInvitationToken(token)) {
      return NextResponse.json(
        { error: "Invalid invitation token" },
        { status: 404 },
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 },
      );
    }

    // Find invitation
    const invitation = await prisma.portalInvitation.findUnique({
      where: { token },
      include: {
        client: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invalid invitation token" },
        { status: 404 },
      );
    }

    // Check if already accepted
    if (invitation.status === "ACCEPTED") {
      return NextResponse.json(
        { error: "Invitation already accepted" },
        { status: 400 },
      );
    }

    // Check if expired
    const now = new Date();
    if (invitation.status === "EXPIRED" || invitation.expiresAt < now) {
      // RA-8668: record the expiry only while the invitation is still pending
      // and still lapsed. One revoked, accepted or resent since the read above
      // is left as it is; the caller is told "expired" either way.
      if (invitation.status === "PENDING") {
        await markInvitationExpired(invitation.id, now);
      }
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 400 },
      );
    }

    // Check if revoked
    if (invitation.status === "REVOKED") {
      return NextResponse.json(
        { error: "Invitation has been revoked" },
        { status: 400 },
      );
    }

    // Check if ClientUser already exists
    const existingClientUser = await prisma.clientUser.findUnique({
      where: { clientId: invitation.clientId },
    });

    if (existingClientUser) {
      return NextResponse.json(
        { error: "Client account already exists" },
        { status: 400 },
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // RA-8668: claim the invitation, then create the account, in one
    // transaction. The claim only succeeds while the invitation is still
    // PENDING, so one revoked, expired or accepted by another request since
    // the read above creates no account. A failed account creation rolls the
    // claim back and leaves the invitation open.
    const result = await prisma.$transaction(async (tx) => {
      if (!(await claimInvitationForAcceptance(tx, invitation.id))) {
        return null;
      }
      return tx.clientUser.create({
        data: {
          email: invitation.email,
          passwordHash,
          name,
          phone: phone || null,
          clientId: invitation.clientId,
        },
      });
    });

    if (!result) {
      return invitationNoLongerOpen(invitation.id);
    }

    // Issue the portal JWT immediately so signup flows straight into the
    // portal without a second login round-trip.
    const portalToken = await signClientPortalJwt({
      clientUserId: result.id,
      clientId: result.clientId,
      email: result.email,
      name: result.name,
      passwordHash: result.passwordHash,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Account created successfully",
        token: portalToken,
        clientUser: {
          id: result.id,
          email: result.email,
          name: result.name,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 },
    );
  }
}
