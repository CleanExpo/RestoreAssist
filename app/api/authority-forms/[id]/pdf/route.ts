import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAuthorityFormPDF } from "@/lib/generate-authority-form-pdf";
import { apiError, fromException } from "@/lib/api-errors";
import { AUTHORITY_TEMPLATES } from "@/lib/documents/authority-catalogue";
import { buildProvenanceBlock } from "@/lib/documents/provenance";
import { resolveJobJurisdiction } from "@/lib/documents/job-jurisdiction";

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
      include: {
        template: true,
        signatures: {
          orderBy: { createdAt: "asc" },
        },
        report: {
          select: {
            id: true,
            userId: true,
            assignedManagerId: true,
            assignedAdminId: true,
            claimReferenceNumber: true,
            // The job's country, for the provenance block. Report itself has no
            // country field; the inspection is the only per-job source.
            inspection: { select: { propertyCountry: true } },
          },
        },
      },
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

    // Prepare signature data
    const signatures = form.signatures.map((sig) => ({
      signatoryName: sig.signatoryName,
      signatoryRole: sig.signatoryRole,
      signatureData: draft ? null : sig.signatureData, // Don't include signatures in draft
      signedAt: sig.signedAt,
      signatoryEmail: sig.signatoryEmail,
    }));

    // Regulatory basis for this authority, resolved from the template's registry
    // citations and the job's jurisdiction.
    //
    // A template not in the code catalogue (a row seeded before it existed, or
    // one added directly to the database) yields no block rather than throwing:
    // an authority form must still render. It simply carries no regulatory
    // basis, which is the truthful outcome — the catalogue is what knows which
    // regulations a template cites.
    const spec = AUTHORITY_TEMPLATES.find((t) => t.code === form.template.code);
    const { jurisdiction, mayBeSchemaDefault } = resolveJobJurisdiction({
      inspectionPropertyCountry: form.report.inspection?.propertyCountry,
    });
    const provenance = spec
      ? buildProvenanceBlock(spec, jurisdiction, { mayBeSchemaDefault })
      : null;

    // Generate PDF
    const pdfBytes = await generateAuthorityFormPDF({
      companyName: form.companyName,
      companyLogo: form.companyLogo,
      companyABN: form.companyABN,
      companyPhone: form.companyPhone,
      companyEmail: form.companyEmail,
      companyWebsite: form.companyWebsite,
      companyAddress: form.companyAddress,
      clientName: form.clientName,
      clientAddress: form.clientAddress,
      incidentDate: form.incidentDate,
      incidentBrief: form.incidentBrief,
      claimReferenceNumber: form.report.claimReferenceNumber,
      formName: form.template.name,
      authorityDescription: form.authorityDescription,
      date: new Date(),
      signatures,
      provenance,
    });

    // Return PDF
    const filename = `${form.template.code}-${form.report.claimReferenceNumber || form.id.slice(-6)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error generating authority form PDF:", error);
    return fromException(request, error, { stage: "generate-pdf" });
  }
}
