import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationOwner } from "@/lib/organization-credits";
import { AuthoritySignatoryRole } from "@prisma/client";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET /api/reports/:id/authority-forms
 * Get all authority forms for a report
 */
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
    const userId = session.user.id;

    const { id: reportId } = await params;

    // Verify report access
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        userId: true,
        assignedManagerId: true,
        assignedAdminId: true,
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Check permissions
    if (
      report.userId !== userId &&
      report.assignedManagerId !== userId &&
      report.assignedAdminId !== userId
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    // Fetch all authority forms for this report
    const forms = await prisma.authorityFormInstance.findMany({
      where: { reportId },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
          },
        },
        signatures: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            instanceId: true,
            signatoryName: true,
            signatoryRole: true,
            signatoryEmail: true,
            signatoryPhone: true,
            signatureData: true,
            signatureUrl: true,
            signatureRequestSent: true,
            signatureRequestSentAt: true,
            signatureRequestToken: true,
            ipAddress: true,
            userAgent: true,
            signedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ forms });
  } catch (error) {
    return fromException(request, error, { stage: "authority-forms-get" });
  }
}

/**
 * POST /api/reports/:id/authority-forms
 * Create a new authority form instance for a report
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id: reportId } = await params;

  // RA-1266: creates a form instance plus signature placeholders —
  // retry without idempotency duplicates the form and signatures.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { templateId, authorityDescription, signatoryRoles } = body;

      if (!templateId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Template ID is required",
          status: 400,
        });
      }

      // Verify report access
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: {
          user: {
            select: {
              businessName: true,
              businessLogo: true,
              businessABN: true,
              businessPhone: true,
              businessEmail: true,
              businessAddress: true,
            },
          },
        },
      });

      if (!report) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }

      // Check permissions
      if (
        report.userId !== userId &&
        report.assignedManagerId !== userId &&
        report.assignedAdminId !== userId
      ) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        });
      }

      // Get Admin's business info (for team members, use Admin's info)
      let businessInfo = {
        businessName: report.user.businessName || "",
        businessLogo: report.user.businessLogo || null,
        businessABN: report.user.businessABN || null,
        businessPhone: report.user.businessPhone || null,
        businessEmail: report.user.businessEmail || null,
        businessAddress: report.user.businessAddress || null,
      };

      // For team members, get Admin's business info
      if (session.user.role === "MANAGER" || session.user.role === "USER") {
        const ownerId = await getOrganizationOwner(userId);
        if (ownerId) {
          const owner = await prisma.user.findUnique({
            where: { id: ownerId },
            select: {
              businessName: true,
              businessLogo: true,
              businessABN: true,
              businessPhone: true,
              businessEmail: true,
              businessAddress: true,
            },
          });
          if (owner) {
            businessInfo = {
              businessName: owner.businessName || "",
              businessLogo: owner.businessLogo || null,
              businessABN: owner.businessABN || null,
              businessPhone: owner.businessPhone || null,
              businessEmail: owner.businessEmail || null,
              businessAddress: owner.businessAddress || null,
            };
          }
        }
      }

      // Extract incident brief from technician field report (first 300 chars)
      const incidentBrief = report.technicianFieldReport
        ? report.technicianFieldReport.substring(0, 300) +
          (report.technicianFieldReport.length > 300 ? "..." : "")
        : null;

      // Create authority form instance
      const formInstance = await prisma.authorityFormInstance.create({
        data: {
          templateId,
          reportId,
          companyName: businessInfo.businessName,
          companyLogo: businessInfo.businessLogo,
          companyABN: businessInfo.businessABN,
          companyPhone: businessInfo.businessPhone,
          companyEmail: businessInfo.businessEmail,
          companyAddress: businessInfo.businessAddress,
          companyWebsite: businessInfo.businessEmail
            ? `www.${businessInfo.businessEmail.split("@")[1]}`
            : null,
          clientName: report.clientName,
          clientAddress: report.propertyAddress,
          incidentBrief,
          incidentDate: report.incidentDate,
          authorityDescription:
            authorityDescription ||
            "As per inspection report and scope of works",
          status: "DRAFT",
        },
        include: {
          // Only `formInstance.id` is read downstream; the form is re-fetched
          // below with full template+signatures for the response payload.
          template: { select: { id: true } },
        },
      });

      // Create signature placeholders for required signatories
      if (signatoryRoles && Array.isArray(signatoryRoles)) {
        const signatureData = signatoryRoles.map(
          (role: string, index: number) => ({
            instanceId: formInstance.id,
            signatoryName: role === "CLIENT" ? report.clientName : "",
            signatoryRole: role as AuthoritySignatoryRole,
            signatoryEmail:
              role === "CLIENT"
                ? report.clientContactDetails?.match(
                    /[\w.-]+@[\w.-]+\.\w+/,
                  )?.[0] || null
                : null,
          }),
        );

        await prisma.authorityFormSignature.createMany({
          data: signatureData,
        });
      } else {
        // Default: Create signature for client
        await prisma.authorityFormSignature.create({
          data: {
            instanceId: formInstance.id,
            signatoryName: report.clientName,
            signatoryRole: "CLIENT",
            signatoryEmail:
              report.clientContactDetails?.match(
                /[\w.-]+@[\w.-]+\.\w+/,
              )?.[0] || null,
          },
        });
      }

      // Fetch the complete form with signatures
      const completeForm = await prisma.authorityFormInstance.findUnique({
        where: { id: formInstance.id },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
              formContent: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          signatures: {
            select: {
              id: true,
              instanceId: true,
              signatoryName: true,
              signatoryRole: true,
              signatoryEmail: true,
              signatoryPhone: true,
              signatureData: true,
              signatureUrl: true,
              signatureRequestSent: true,
              signatureRequestSentAt: true,
              signatureRequestToken: true,
              ipAddress: true,
              userAgent: true,
              signedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      return NextResponse.json({ form: completeForm });
    } catch (error) {
      return fromException(request, error, { stage: "authority-forms-post" });
    }
  });
}
