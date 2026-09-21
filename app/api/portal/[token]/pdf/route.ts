import { NextRequest, NextResponse } from "next/server";
import { resolvePortalAccess } from "@/lib/portal/resolve-portal-inspection";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { generateConsumerReportPdf } from "@/lib/portal/consumer-report";

// Public token downloads intentionally exclude reviewer-only classifications,
// environmental measurements and raw moisture readings.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
    prefix: "portal-token-pdf",
  });
  if (rateLimited) return rateLimited;

  const { token } = await params;
  // Account tokens first, HMAC second (RA-4861). A valid ClientPortalAccount
  // on a DRAFT / missing report is unfinished — not expired (RA-7575).
  const resolved = await resolvePortalAccess(token);
  if (resolved.kind === "invalid") {
    return NextResponse.json(
      { error: "Link has expired or is invalid" },
      { status: 401 },
    );
  }
  if (resolved.kind === "unready") {
    return NextResponse.json(
      { error: "Report is not yet ready for download" },
      { status: 400 },
    );
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: resolved.inspectionId },
    select: {
      inspectionNumber: true,
      propertyAddress: true,
      createdAt: true,
      status: true,
      technicianName: true,
      affectedAreas: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true },
      },
      scopeItems: {
        where: { isSelected: true },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true },
      },
      report: {
        select: {
          title: true,
          status: true,
          user: { select: { businessName: true, name: true } },
        },
      },
    },
  });

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.report?.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Report is not yet ready for download" },
      { status: 400 },
    );
  }

  const report = inspection.report;
  const pdfBytes = await generateConsumerReportPdf({
    title: report.title,
    inspectionNumber: inspection.inspectionNumber,
    propertyAddress: inspection.propertyAddress,
    status: inspection.status,
    date: inspection.createdAt,
    affectedAreaCount: inspection.affectedAreas.length,
    scopeItemCount: inspection.scopeItems.length,
    contractorName: report.user.businessName ?? report.user.name,
  });

  const filename = `client-report-${inspection.inspectionNumber}.pdf`.replace(
    /[^a-zA-Z0-9.\-_]/g,
    "-",
  );
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
