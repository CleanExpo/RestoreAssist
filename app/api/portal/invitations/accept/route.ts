import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { applyRateLimit } from "@/lib/rate-limiter";
import { sanitizeString } from "@/lib/sanitize";

// POST /api/portal/invitations/accept - Accept invitation and create ClientUser account
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      prefix: "portal-invite-accept",
    });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { token, password } = body;
    // RA-6800: sanitize user-supplied strings before writing to DB
    const name = sanitizeString(body.name, 200);
    const phone =
      typeof body.phone === "string"
        ? sanitizeString(body.phone, 50)
        : undefined;

    if (!token || !password || !name) {
      return NextResponse.json(
        { error: "Token, password, and name are required" },
        { status: 400 },
      );
    }

    // RA-6800: align with main app minimum (NIST SP 800-63B / OWASP 2024)
    if (password.length < 12) {
      return NextResponse.json(
        { error: "Password must be at least 12 characters long" },
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
    if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) {
      await prisma.portalInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
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

    // Create ClientUser and update invitation in a transaction.
    // RA-6800: catch P2002 from concurrent requests racing past the
    // existingClientUser check — return 409 instead of raw 500.
    let result: { id: string; email: string; name: string | null };
    try {
      result = await prisma.$transaction(async (tx) => {
        const clientUser = await tx.clientUser.create({
          data: {
            email: invitation.email,
            passwordHash,
            name,
            phone: phone ?? null,
            clientId: invitation.clientId,
          },
        });

        await tx.portalInvitation.update({
          where: { id: invitation.id },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
          },
        });

        return clientUser;
      });
    } catch (txErr) {
      const code =
        (txErr as { code?: string; cause?: { code?: string } })?.code ??
        (txErr as { cause?: { code?: string } })?.cause?.code;
      if (code === "P2002") {
        return NextResponse.json(
          { error: "Client account already exists" },
          { status: 409 },
        );
      }
      throw txErr;
    }

    return NextResponse.json(
      {
        success: true,
        message: "Account created successfully",
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
