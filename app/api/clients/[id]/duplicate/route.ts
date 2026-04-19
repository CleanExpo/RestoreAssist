import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json(
          { error: "Client not found" },
          { status: 404 },
        );
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
      console.error("Error duplicating client:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
