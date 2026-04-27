import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

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
  return withIdempotency(request, userId, async () => {
    try {
      const originalClient = await prisma.client.findFirst({
        where: { id, userId },
      });

      if (!originalClient) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Client not found",
          status: 404,
        });
      }

      const duplicatedClient = await prisma.client.create({
        data: {
          name: `${originalClient.name} (Copy)`,
          email: originalClient.email,
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
