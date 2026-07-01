import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * Export user data as JSON
 * Includes all reports, clients, and settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Rate limit: 3 data exports per 15 minutes per IP
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 3,
      prefix: "user-export",
    });
    if (rateLimited) return rateLimited;

    // Fetch all user data in parallel
    const [user, reports, clients, inspections, estimates] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          businessName: true,
          businessAddress: true,
          businessABN: true,
          businessPhone: true,
          businessEmail: true,
          createdAt: true,
          // Exclude sensitive fields
        },
      }),
      prisma.report.findMany({
        where: { userId: session.user.id },
        // RA-1333: capped at 1000 to prevent OOM on large accounts.
        // Nested lineItems removed — a full join on 10k reports × estimates
        // × lineItems can produce 100MB+ JSON and OOM the Vercel function.
        take: 1000,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
            },
          },
          estimates: {
            select: {
              id: true,
              title: true,
              status: true,
              totalExGST: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.client.findMany({
        where: { userId: session.user.id },
        take: 10000, // CLAUDE.md rule 4
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          company: true,
          notes: true,
          status: true,
          createdAt: true,
        },
      }),
      (prisma.inspection as any).findMany({
        where: { userId: session.user.id },
        take: 10000, // CLAUDE.md rule 4
        include: {
          affectedAreas: true,
          moistureReadings: true,
          environmentalReadings: true,
          photos: true,
        },
      }),
      prisma.estimate.findMany({
        where: { userId: session.user.id },
        take: 10000, // CLAUDE.md rule 4
        include: {
          lineItems: true,
        },
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: "1.0",
      user: {
        ...user,
        // Remove password and sensitive data
      },
      reports: reports.map((report) => ({
        ...report,
        // Sanitize any sensitive fields
      })),
      clients,
      inspections,
      estimates,
      metadata: {
        totalReports: reports.length,
        totalClients: clients.length,
        totalInspections: inspections.length,
        totalEstimates: estimates.length,
      },
    };

    // Return as downloadable JSON
    const filename = `restoreassist-export-${new Date().toISOString().split("T")[0]}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "export" });
  }
}
