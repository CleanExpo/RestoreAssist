import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { extendAndEmailPortalInvitation } from "@/lib/portal/extend-and-email-invitation";

// GET /api/portal/invitations - List invitations for current contractor
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.userType === "client") {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const where: any = {
      userId: session.user.id,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    if (status) {
      where.status = status;
    }

    const invitations = await prisma.portalInvitation.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return fromException(request, error, {
      stage: "portal/invitations:list",
    });
  }
}

// POST /api/portal/invitations - Send portal invitation to client
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.userType === "client") {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const body = await request.json();
    const { clientId } = body;

    if (!clientId) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Client ID is required",
        status: 400,
      });
    }

    // Verify client belongs to this contractor
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        userId: session.user.id,
      },
    });

    if (!client) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Client not found",
        status: 404,
      });
    }

    // Check if client already has a ClientUser account
    const existingClientUser = await prisma.clientUser.findUnique({
      where: { clientId },
    });

    if (existingClientUser) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Client already has portal access",
        status: 400,
      });
    }

    // RA-1367 — the old pattern was:
    //   1. findFirst({ status: PENDING })
    //   2. if exists, reject
    //   3. create
    // Two concurrent POSTs could both see "no existing" in step 1, both
    // pass step 2, and both create in step 3 — duplicate PENDING invites
    // for the same (email, clientId). Spamming the client's inbox and
    // cluttering the dashboard.
    //
    // Fix: wrap the read-then-create in a $transaction with Serializable
    // isolation. Either both steps commit together (no duplicate possible)
    // or the losing call's transaction aborts with a P2034 conflict which
    // we translate to the same 400 the caller would have seen anyway.
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    let invitation;
    try {
      invitation = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.portalInvitation.findFirst({
            where: {
              clientId,
              status: "PENDING",
              expiresAt: { gt: new Date() },
            },
          });
          if (existing) {
            const duplicate = new Error("DUPLICATE_INVITE") as Error & {
              invitationId?: string;
            };
            duplicate.invitationId = existing.id;
            throw duplicate;
          }
          return await tx.portalInvitation.create({
            data: {
              email: client.email,
              clientId,
              userId: session.user.id,
              expiresAt,
            },
            include: {
              client: {
                select: { name: true, email: true },
              },
              user: {
                select: {
                  name: true,
                  businessName: true,
                  organizationId: true,
                },
              },
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "DUPLICATE_INVITE" || msg.includes("P2034")) {
        const invitationId =
          err instanceof Error &&
          "invitationId" in err &&
          typeof (err as { invitationId?: unknown }).invitationId === "string"
            ? (err as { invitationId: string }).invitationId
            : undefined;

        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "Active invitation already exists for this client",
              eventId: Math.random().toString(36).slice(2, 10),
            },
            invitation: invitationId ? { id: invitationId } : undefined,
          },
          { status: 409 },
        );
      }
      throw err;
    }

    const contractorName =
      invitation.user.businessName || invitation.user.name || "RestoreAssist";

    const emailResult = await extendAndEmailPortalInvitation({
      invitationId: invitation.id,
      token: invitation.token,
      email: invitation.email,
      clientName: invitation.client.name,
      contractorName,
      organizationId: invitation.user.organizationId ?? null,
      kind: "invite",
    });

    if (!emailResult.ok) {
      if (emailResult.reason === "email_not_configured") {
        return NextResponse.json(
          {
            error: {
              code: "UPSTREAM_FAILED",
              message: "Email service not configured — invitation saved; resend when email is ready",
              eventId: Math.random().toString(36).slice(2, 10),
            },
            invitation: {
              id: invitation.id,
              email: invitation.email,
              token: invitation.token,
              expiresAt: invitation.expiresAt,
              createdAt: invitation.createdAt,
            },
            emailSent: false,
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        {
          error: {
            code: "UPSTREAM_FAILED",
            message:
              emailResult.detail ?? "Failed to send invitation email — use Resend to try again",
            eventId: Math.random().toString(36).slice(2, 10),
          },
          invitation: {
            id: invitation.id,
            email: invitation.email,
            token: invitation.token,
            expiresAt: invitation.expiresAt,
            createdAt: invitation.createdAt,
          },
          emailSent: false,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          token: invitation.token,
          expiresAt: emailResult.data.expiresAt,
          createdAt: invitation.createdAt,
        },
        emailSent: true,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating invitation:", error);
    return fromException(request, error, {
      stage: "portal/invitations:create",
    });
  }
}
