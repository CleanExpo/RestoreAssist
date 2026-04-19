import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

/** Escape special HTML characters to prevent XSS in email bodies */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Lazy initialize Resend to avoid build errors if API key is missing
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      "RESEND_API_KEY not configured - email sending will be skipped",
    );
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
}

// GET /api/portal/invitations - List invitations for current contractor
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.userType === "client") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    });

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 },
    );
  }
}

// POST /api/portal/invitations - Send portal invitation to client
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.userType === "client") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, message } = body;

    if (!clientId) {
      return NextResponse.json(
        { error: "Client ID is required" },
        { status: 400 },
      );
    }

    // Verify client belongs to this contractor
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        userId: session.user.id,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Check if client already has a ClientUser account
    const existingClientUser = await prisma.clientUser.findUnique({
      where: { clientId },
    });

    if (existingClientUser) {
      return NextResponse.json(
        { error: "Client already has portal access" },
        { status: 400 },
      );
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
            throw new Error("DUPLICATE_INVITE");
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
                select: { name: true, businessName: true },
              },
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "DUPLICATE_INVITE" || msg.includes("P2034")) {
        return NextResponse.json(
          { error: "Active invitation already exists for this client" },
          { status: 400 },
        );
      }
      throw err;
    }

    // Send invitation email
    const baseUrl = process.env.NEXTAUTH_URL || "https://restoreassist.app";
    const inviteUrl = `${baseUrl}/portal/signup?token=${invitation.token}`;
    const contractorName =
      invitation.user.businessName || invitation.user.name || "RestoreAssist";

    const resend = getResend();
    if (resend) {
      try {
        await resend.emails.send({
          from: "RestoreAssist <noreply@restoreassist.app>",
          to: invitation.email,
          subject: `${contractorName} has invited you to view your restoration project`,
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You've been invited to the Client Portal</h2>
            <p>Hi ${escapeHtml(client.name)},</p>
            <p>${escapeHtml(contractorName)} has invited you to access the Client Portal where you can:</p>
            <ul>
              <li>View your restoration project reports</li>
              <li>Review and approve scope of work</li>
              <li>Track project status and progress</li>
              <li>Download important documents</li>
            </ul>
            ${message ? `<p><strong>Message from ${escapeHtml(contractorName)}:</strong><br/>${escapeHtml(message)}</p>` : ""}
            <p style="margin: 30px 0;">
              <a href="${inviteUrl}" style="background-color: #8A6B4E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Accept Invitation & Create Account
              </a>
            </p>
            <p style="font-size: 12px; color: #666;">
              This invitation expires in 7 days. If you did not expect this invitation, you can safely ignore this email.
            </p>
            <p style="font-size: 12px; color: #666;">
              Link not working? Copy and paste this URL into your browser:<br/>
              ${inviteUrl}
            </p>
          </div>
        `,
        });
      } catch (emailError) {
        console.error("Failed to send invitation email:", emailError);
        // Don't fail the request if email fails - invitation is still created
      }
    }

    return NextResponse.json(
      {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating invitation:", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 },
    );
  }
}
