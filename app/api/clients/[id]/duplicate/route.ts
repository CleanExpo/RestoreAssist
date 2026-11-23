import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveClientReach } from "@/lib/auth/assert-tenancy";

/**
 * RA-8535: copy a client into a new record of the caller's own.
 *
 * The copy needs its own email. A client is unique on (owner, email), so a copy
 * that kept the original's email was refused by the database every time. The
 * new email comes in the body and is checked without case against the
 * caller's clients, as POST /api/clients does.
 *
 * The original is found with the list's reach: anyone who can see a client in
 * the list may copy it into their own records, and nobody else.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Sign in required",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: prevents creating two duplicates on double-click.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: { email?: unknown };
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const email =
        typeof body?.email === "string" ? body.email.trim().slice(0, 320) : "";
      if (!email) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Enter an email for the copy. Each client needs its own email.",
          status: 400,
          fields: { email: "Enter an email for the copy" },
        });
      }

      const reach = await resolveClientReach(session);
      if (!reach.ok) {
        return apiError(request, {
          code: "UNAUTHORIZED",
          message: reach.reason,
          status: reach.status,
        });
      }
      const originalClient = await prisma.client.findFirst({
        where: { AND: [{ id }, reach.data] },
      });

      if (!originalClient) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Client not found",
          status: 404,
        });
      }

      const emailTaken = await prisma.client.findFirst({
        where: { userId, email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (emailTaken) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Client with this email already exists",
          status: 409,
          fields: { email: "Client with this email already exists" },
        });
      }

      const duplicatedClient = await prisma.client.create({
        data: {
          name: `${originalClient.name} (Copy)`,
          email,
          phone: originalClient.phone,
          address: originalClient.address,
          company: originalClient.company,
          contactPerson: originalClient.contactPerson,
          notes: originalClient.notes,
          status: originalClient.status,
          userId,
        },
      });

      return NextResponse.json(duplicatedClient, { status: 201 });
    } catch (error) {
      return fromException(request, error, { stage: "clients-duplicate" });
    }
  });
}
