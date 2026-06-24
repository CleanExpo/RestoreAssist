import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { apiError, fromException } from "@/lib/api-errors";
import {
  brandLogoUrlSchema,
  brandPrimaryColorSchema,
} from "@/lib/clients/brand";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        reports: {
          select: {
            id: true,
            title: true,
            status: true,
            totalCost: true,
            createdAt: true,
            updatedAt: true,
            reportNumber: true,
            waterCategory: true,
            waterClass: true,
            affectedArea: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { reports: true },
        },
      },
    });

    if (!client) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Client not found",
        status: 404,
      });
    }

    // Calculate client statistics
    const totalRevenue = client.reports.reduce(
      (sum: number, report: { totalCost: number | null }) =>
        sum + (report.totalCost || 0),
      0,
    );
    const lastJob =
      client.reports.length > 0 ? client.reports[0].createdAt : null;

    return NextResponse.json({
      ...client,
      totalRevenue,
      lastJob: lastJob ? new Date(lastJob).toLocaleDateString() : "Never",
      reportsCount: client._count.reports,
    });
  } catch (error) {
    return fromException(request, error, { stage: "client-get" });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;
    const body = await request.json();
    const name = sanitizeString(body.name, 200);
    const email = sanitizeString(body.email, 320).toLowerCase();
    const phone = sanitizeString(body.phone, 50);
    const address = sanitizeString(body.address, 500);
    const company = sanitizeString(body.company, 200);
    const contactPerson = sanitizeString(body.contactPerson, 200);
    const notes = sanitizeString(body.notes, 5000);
    const status = body.status;

    if (!name || !email) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Name and email are required",
        status: 400,
      });
    }

    // P1 #10 — client co-brand fields. Both optional; explicit null clears
    // the value. Validation rejects HTTP / relative URLs and any color
    // that isn't 6-char hex with leading `#`.
    let brandLogoUrl: string | null | undefined = undefined;
    if (body.brandLogoUrl === null) {
      brandLogoUrl = null;
    } else if (typeof body.brandLogoUrl === "string") {
      const parsed = brandLogoUrlSchema.safeParse(body.brandLogoUrl);
      if (!parsed.success) {
        return apiError(request, {
          code: "VALIDATION",
          message: parsed.error.issues[0]?.message ?? "Invalid brandLogoUrl",
          status: 400,
        });
      }
      brandLogoUrl = parsed.data;
    }

    let brandPrimaryColor: string | null | undefined = undefined;
    if (body.brandPrimaryColor === null) {
      brandPrimaryColor = null;
    } else if (typeof body.brandPrimaryColor === "string") {
      const parsed = brandPrimaryColorSchema.safeParse(body.brandPrimaryColor);
      if (!parsed.success) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            parsed.error.issues[0]?.message ?? "Invalid brandPrimaryColor",
          status: 400,
        });
      }
      brandPrimaryColor = parsed.data;
    }

    // Check if client exists and belongs to user
    const existingClient = await prisma.client.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingClient) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Client not found",
        status: 404,
      });
    }

    // Check if email is being changed and if it conflicts with another client
    if (email !== existingClient.email) {
      const emailConflict = await prisma.client.findFirst({
        where: {
          email,
          userId: session.user.id,
          id: { not: id },
        },
      });

      if (emailConflict) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Client with this email already exists",
          status: 409,
        });
      }
    }

    const client = await prisma.client.update({
      where: { id, userId: session.user.id },
      data: {
        name,
        email,
        phone,
        address,
        company,
        contactPerson,
        notes,
        status,
        // P1 #10 — only set when the field appeared in the payload, so an
        // omitted field leaves the existing value untouched. An explicit
        // null clears it (back to RA defaults at render time).
        ...(brandLogoUrl !== undefined ? { brandLogoUrl } : {}),
        ...(brandPrimaryColor !== undefined ? { brandPrimaryColor } : {}),
      },
      include: {
        _count: {
          select: { reports: true },
        },
      },
    });

    return NextResponse.json({
      ...client,
      totalRevenue: 0,
      lastJob: "Never",
      reportsCount: client._count.reports,
    });
  } catch (error) {
    return fromException(request, error, { stage: "client-put" });
  }
}

/**
 * RA-1267 / CLAUDE.md rule 18: PATCH alias.
 * PUT is preserved for backwards compatibility with existing dashboard
 * code; PATCH is the REST-correct verb for partial updates and is what
 * new code should use. Both delegate to the same handler.
 */
export const PATCH = PUT;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // Check if client exists and belongs to user
    const existingClient = await prisma.client.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingClient) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Client not found",
        status: 404,
      });
    }

    // Check if client has reports
    const reportCount = await prisma.report.count({
      where: { clientId: id },
    });

    if (reportCount > 0) {
      return apiError(request, {
        code: "CONFLICT",
        message:
          "Cannot delete client with existing reports. Please archive instead.",
        status: 409,
      });
    }

    await prisma.client.delete({
      where: { id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "client-delete" });
  }
}
