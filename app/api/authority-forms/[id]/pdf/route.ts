import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  AUTHORITY_FORM_RENDER_INCLUDE,
  renderAuthorityFormPdf,
} from "@/lib/documents/render-authority-form";

/**
 * GET /api/authority-forms/:id/pdf
 * Generate and download authority form PDF
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

    const { id: formId } = await params;
    const { searchParams } = new URL(request.url);
    const draft = searchParams.get("draft") === "true";

    // Fetch form with all data
    const form = await prisma.authorityFormInstance.findUnique({
      where: { id: formId },
      include: AUTHORITY_FORM_RENDER_INCLUDE,
    });

    if (!form) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Form not found",
        status: 404,
      });
    }

    // Check permissions
    if (
      form.report.userId !== session.user.id &&
      form.report.assignedManagerId !== session.user.id &&
      form.report.assignedAdminId !== session.user.id
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    // Assembly, provenance and generation all live in the shared renderer: the
    // two evidence exports build the same PDF and must not build it differently.
    const { bytes, filename } = await renderAuthorityFormPdf(form, { draft });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": bytes.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error generating authority form PDF:", error);
    return fromException(request, error, { stage: "generate-pdf" });
  }
}
