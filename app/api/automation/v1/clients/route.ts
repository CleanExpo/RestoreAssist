import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { assertAutomationV1Auth } from "@/lib/automation/v1-auth";

/** GET /api/automation/v1/clients — org client directory for automation (W4-4). */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await assertAutomationV1Auth(request, session);
    if (!auth.ok) {
      return apiError(request, {
        code: auth.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        message: auth.reason,
        status: auth.status,
      });
    }

    const clients = await prisma.client.findMany({
      where: { user: { organizationId: auth.organizationId } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      schemaVersion: "1.0",
      data: clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: c.company,
        updatedAt: c.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return fromException(request, error, { stage: "automation-v1-clients" });
  }
}