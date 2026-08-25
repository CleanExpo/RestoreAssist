import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { sendInviteEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import { apiError, fromException } from "@/lib/api-errors";
import { canonicalEmail, lockEmailIdentity } from "@/lib/email-identity";
import { getIdempotencyKey, withIdempotency } from "@/lib/idempotency";
import { deliverEmailOnce, EmailDeliveryPending } from "@/lib/email-delivery-ledger";

function canInvite(role?: string) {
  // Only ADMIN and MANAGER can create invites
  return role === "ADMIN" || role === "MANAGER";
}

function canViewInvites(role?: string) {
  // Invite tokens are bearer credentials; technicians must never receive them.
  return role === "ADMIN" || role === "MANAGER";
}

class ActiveInviteConflict extends Error {}

const inviteRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["MANAGER", "USER"]),
});

async function ensureOrganizationForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  if (user.organizationId) return user.organizationId;

  // Backward compatible: if an existing user has no org, create one lazily and attach.
  // Re-read and claim the missing organisation atomically. Concurrent first
  // requests must not create multiple owner organisations and leave orphans.
  return prisma.$transaction(async (tx) => {
    const freshUser = await tx.user.findUnique({ where: { id: userId } });
    if (!freshUser) throw new Error("User not found");
    if (freshUser.organizationId) return freshUser.organizationId;

    const org = await tx.organization.create({
      data: {
        name: `${freshUser.name || "Account"} Organisation`,
        ownerId: userId,
      },
    });
    const claimed = await tx.user.updateMany({
      where: { id: userId, organizationId: null },
      data: { organizationId: org.id },
    });
    if (claimed.count !== 1) {
      throw new Error("Organization assignment changed concurrently");
    }
    return org.id;
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  // CLAUDE.md rule 1: re-validate role from DB, not the stale JWT claim.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, organizationId: true },
  });
  if (!dbUser || !canViewInvites(dbUser.role))
    return apiError(request, {
      code: "FORBIDDEN",
      message: "Forbidden",
      status: 403,
    });

  if (!dbUser.organizationId && dbUser.role !== "ADMIN") {
    return apiError(request, {
      code: "FORBIDDEN",
      message: "Your manager membership is no longer active",
      status: 403,
    });
  }
  const orgId =
    dbUser.organizationId ??
    (await ensureOrganizationForUser(session.user.id));

  // Build where clause based on user role
  let whereClause: any = { organizationId: orgId };

  // Managers can only see invites they created
  if (dbUser?.role === "MANAGER") {
    whereClause = {
      organizationId: orgId,
      createdById: session.user.id, // Only invites created by this Manager
    };
  }
  // Admins see all invites in the organization

  const invites = await prisma.userInvite.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
      createdById: true,
      managedById: true,
    },
    take: 500, // CLAUDE.md rule 4
  });

  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req, { requireOrigin: true });
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  // CLAUDE.md rule 1: re-validate role from DB, not the stale JWT claim.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, organizationId: true },
  });
  if (!dbUser || !canInvite(dbUser.role))
    return apiError(req, {
      code: "FORBIDDEN",
      message: "Forbidden",
      status: 403,
    });

  const idempotency = getIdempotencyKey(req);
  if (!idempotency.ok || !idempotency.key) {
    return apiError(req, {
      code: "VALIDATION",
      message: idempotency.ok
        ? "Idempotency-Key is required"
        : idempotency.reason,
      status: 400,
    });
  }

  return withIdempotency(req, session.user.id, async (rawBodyText) => {

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(rawBodyText);
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid request body",
      status: 400,
    });
  }
  const parsedBody = inviteRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Enter a valid email address and role",
      status: 400,
    });
  }
  const email = parsedBody.data.email.trim();
  const role = parsedBody.data.role;
  const normalizedEmail = canonicalEmail(email);

  // Managers can only invite technicians (USER)
  if (dbUser?.role === "MANAGER" && role !== "USER") {
    return apiError(req, {
      code: "FORBIDDEN",
      message: "Managers can only invite technicians",
      status: 403,
    });
  }

  if (!dbUser.organizationId && dbUser.role !== "ADMIN") {
    return apiError(req, {
      code: "FORBIDDEN",
      message: "Your manager membership is no longer active",
      status: 403,
    });
  }
  const orgId =
    dbUser.organizationId ??
    (await ensureOrganizationForUser(session.user.id));

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      email: { equals: normalizedEmail, mode: "insensitive" },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (existingUser) {
    // Prevent transferring ADMIN users - they should manage their own organizations
    if (existingUser.role === "ADMIN") {
      return apiError(req, {
        code: "CONFLICT",
        message: "An account already exists for this email and cannot be invited",
        status: 409,
      });
    }

    // Case 1: User is already in the same organization - update their role if needed
    if (existingUser.organizationId === orgId) {
      if (dbUser?.role === "MANAGER" && existingUser.role !== "USER") {
        return apiError(req, {
          code: "FORBIDDEN",
          message: "Managers cannot change another manager's membership",
          status: 403,
        });
      }
      // Update role if it's different
      const token = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      // Keep the role mutation and its audit invite in one transaction. A
      // failed audit write must not leave a silently changed membership.
      const membershipResult = await prisma
        .$transaction(async (tx) => {
          const updatedUser = await tx.user.update({
            where: {
              id: existingUser.id,
              organizationId: orgId,
              role: existingUser.role,
            },
            data: { role },
          });
          const invite = await tx.userInvite.create({
            data: {
              token,
              email: normalizedEmail,
              role,
              organizationId: orgId,
              createdById: session.user.id,
              managedById: dbUser?.role === "MANAGER" ? session.user.id : null,
              expiresAt,
              usedAt: new Date(),
            },
          });
          return { updatedUser, invite };
        })
        .then((result) => ({ ok: true as const, result }))
        .catch((error: unknown) => ({ ok: false as const, error }));
      if (!membershipResult.ok) {
        const error = membershipResult.error;
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2025"
        ) {
          return apiError(req, {
            code: "CONFLICT",
            message: "Membership changed; reload the team and retry",
            status: 409,
          });
        }
        return fromException(req, error, { stage: "update-existing-member" });
      }
      const { updatedUser, invite } = membershipResult.result;

      // Get inviter's name
      const inviter = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true },
      });

      const inviterName = inviter?.name || "Administrator";

      // Send notification email
      const loginUrl = `${getAppUrl()}/login`;

      try {
        await deliverEmailOnce({
          idempotencyKey: `team-invite-transfer:${session.user.id}:${idempotency.key}`,
          kind: "TEAM_INVITE_TRANSFER",
          recipient: normalizedEmail,
          payloadIdentity: `${existingUser.id}|${role}|${orgId}|${loginUrl}`,
          send: () =>
            sendInviteEmail({
              email: normalizedEmail,
              name: updatedUser.name || email.split("@")[0],
              role,
              loginUrl,
              inviterName,
              isTransfer: true,
              organizationId: orgId,
              idempotencyKey: `team-invite-transfer:${session.user.id}:${idempotency.key}`,
            }),
        });
      } catch (emailError: any) {
        console.error(
          "[invite] Email sending failed:",
          emailError?.message || "Unknown error",
        );
        return NextResponse.json(
          {
            message: "Membership updated, but the notification email failed.",
            error: "Email sending failed",
            user: {
              id: updatedUser.id,
              email: updatedUser.email,
              name: updatedUser.name,
              role: updatedUser.role,
            },
            updated: true,
            partial: true,
          },
          { status: emailError instanceof EmailDeliveryPending ? 409 : 502 },
        );
      }

      return NextResponse.json({
        message:
          existingUser.role === role
            ? "This user is already a member of your organization with this role. Notification sent."
            : "User role has been updated and notification sent.",
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          usedAt: invite.usedAt,
        },
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
        },
        updated: true,
      });
    }

    // Knowing an email address is not authority to move an account between
    // tenants. Cross-organization membership changes require the target user's
    // consent or a separately verified support transfer.
    return apiError(req, {
      code: "CONFLICT",
      message:
        "An account already exists for this email outside your organization. Contact support for a verified transfer.",
      status: 409,
    });
  }

  // RA-1249 — new-user invites now send a link to /invite/[token] rather
  // than creating the account immediately with a temp password. This removes
  // the plaintext-password-in-email risk and gives the invitee a proper
  // acceptance UX where they set their own password.
  const inviter = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  });
  const inviterName = inviter?.name || "Administrator";

  try {
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // No User row is created yet — only the UserInvite. The invitee
    // completes signup via /invite/[token] which creates the User and
    // marks this invite used atomically.
    // Serializable isolation makes the "no active invite" predicate part of
    // the write contract. Without it, two concurrent requests can both see no
    // row and create duplicate live bearer tokens.
    const invite = await prisma.$transaction(
      async (tx) => {
        await lockEmailIdentity(tx, normalizedEmail);
        const userInsideClaim = await tx.user.findFirst({
          where: {
            email: { equals: normalizedEmail, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (userInsideClaim) throw new ActiveInviteConflict();
        const activeInvite = await tx.userInvite.findFirst({
          where: {
            email: normalizedEmail,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (activeInvite) throw new ActiveInviteConflict();
        return tx.userInvite.create({
          data: {
            token,
            email: normalizedEmail,
            role,
            organizationId: orgId,
            createdById: session.user.id,
            managedById: dbUser?.role === "MANAGER" ? session.user.id : null,
            expiresAt,
            usedAt: null,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );

    const appUrl = getAppUrl();
    const inviteLink = `${appUrl}/invite/${token}`;
    const loginUrl = `${appUrl}/login`;

    try {
      await deliverEmailOnce({
        idempotencyKey: `team-invite-new:${session.user.id}:${idempotency.key}`,
        kind: "TEAM_INVITE_NEW",
        recipient: normalizedEmail,
        payloadIdentity: `${invite.id}|${normalizedEmail}|${role}|${inviteLink}`,
        send: () =>
          sendInviteEmail({
            email: normalizedEmail,
            name: email.split("@")[0],
            role,
            inviteLink,
            loginUrl,
            inviterName,
            organizationId: orgId,
            idempotencyKey: `team-invite-new:${session.user.id}:${idempotency.key}`,
          }),
      });
    } catch (emailError: any) {
      console.error("[invite] Email sending failed for invite:", invite.id);
      console.error(
        "[invite] Email error:",
        emailError?.message || "Unknown error",
      );
      // Don't throw — surface the invite link in the response so the
      // creator can share it manually when email is misconfigured.
      return NextResponse.json(
        {
          message:
            "Invite created, but email sending failed. Share the invite link manually.",
          error: "Email sending failed",
          invite: {
            id: invite.id,
            email: invite.email,
            role: invite.role,
            usedAt: invite.usedAt,
          },
          inviteLink, // surface for manual share
          partial: true,
        },
        { status: emailError instanceof EmailDeliveryPending ? 409 : 502 },
      );
    }

    return NextResponse.json({
      message: "Invite sent. The recipient will set their own password.",
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        usedAt: invite.usedAt,
      },
    });
  } catch (error: any) {
    if (error instanceof ActiveInviteConflict) {
      return apiError(req, {
        code: "CONFLICT",
        message: "An active invitation already exists for this email",
        status: 409,
      });
    }
    if (error?.code === "P2034") {
      return apiError(req, {
        code: "CONFLICT",
        message: "Invitation state changed; retry the request",
        status: 409,
      });
    }
    console.error("Error creating invite:", error);
    return fromException(req, error, { stage: "create-invite" });
  }
  });
}
