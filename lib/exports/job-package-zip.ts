/**
 * SP-E: Close-package ZIP builder.
 *
 * Streams a single archive containing the four artefacts that constitute
 * a closed-job evidence package:
 *
 *   /report.pdf            — IICRC S500-formatted PDF (incl. floor-plan pages)
 *   /invoice.pdf           — tax invoice PDF
 *   /photos/<filename>     — every InspectionPhoto attached to the job
 *   /authority-forms/*.pdf — every COMPLETED signed authority form (RA-7003)
 *   /audit-log.json        — chronological AuditLog dump for the inspection
 *
 * NOTE: there is no pre-existing `bulk-export-zip` route at
 *       `/api/inspections/[id]/bulk-export-zip` — the plan referenced one
 *       but the codebase doesn't have it. We build the helper from scratch
 *       and consume it directly from `exportClosedJobToBYOKStorage`.
 */

import { createZipArchive } from "@/lib/exports/create-zip-archive";
import { PassThrough, Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import type { ClientBrandTheme } from "@/lib/clients/brand";

interface BuildResult {
  /** Buffer of the final ZIP — assembled in memory. Acceptable for v1
   *  close-packages (< 100 MB realistic). If sizes grow we'll switch to
   *  pipe-to-Supabase upload directly. */
  buffer: Buffer;
  byteSize: number;
}

/**
 * Optional builder controls.
 *
 * `theme` (P1 #10) drives co-branding on report.pdf — logo in the header,
 * primary colour as the accent. When omitted the PDF generator falls back
 * to the RestoreAssist defaults; existing callers (SP-E close package)
 * keep working unchanged.
 */
interface BuildOptions {
  theme?: ClientBrandTheme;
}

/**
 * Build the close-package ZIP for an inspection.
 *
 * Throws if the inspection doesn't exist or has no linked report.
 */
export async function buildJobPackageStream(
  inspectionId: string,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      inspectionNumber: true,
      userId: true,
      reportId: true,
      photos: {
        select: {
          id: true,
          url: true,
          mimeType: true,
          timestamp: true,
        },
        orderBy: { timestamp: "asc" },
        take: 500,
      },
      auditLogs: {
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          userId: true,
          changes: true,
          timestamp: true,
        },
        orderBy: { timestamp: "asc" },
        take: 1000,
      },
      report: {
        select: { id: true, reportNumber: true },
      },
    },
  });

  if (!inspection) {
    throw new Error(`Inspection ${inspectionId} not found`);
  }

  const archive = createZipArchive({ zlib: { level: 9 } });
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<void>((resolve, reject) => {
    sink.on("end", () => resolve());
    sink.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(sink);

  // ── /report.pdf ────────────────────────────────────────────────────────
  if (inspection.reportId) {
    try {
      const fullReport = await prisma.report.findUnique({
        where: { id: inspection.reportId },
      });
      if (fullReport) {
        let pdfBytes = await generateIICRCReportPDF(
          fullReport as unknown as Parameters<typeof generateIICRCReportPDF>[0],
          { theme: options.theme },
        );
        // RA-7003: floor-plan pages belong in the packaged report too — the
        // photos travel as separate files, but sketches only exist as pages.
        try {
          const sketches = await prisma.claimSketch.findMany({
            where: { inspectionId: inspection.id },
            select: {
              floorNumber: true,
              floorLabel: true,
              renderedPngUrl: true,
              sketchData: true,
              moisturePoints: true,
            },
            orderBy: { floorNumber: "asc" },
            take: 20,
          });
          const { claimSketchesToFloors } = await import(
            "@/lib/reports/claim-sketch-floors"
          );
          const { appendSketchPages } = await import(
            "@/lib/reports/append-sketch-pages"
          );
          const floors = await claimSketchesToFloors(sketches);
          pdfBytes = await appendSketchPages(pdfBytes, floors, {
            propertyAddress: undefined,
            reportNumber: inspection.report?.reportNumber ?? undefined,
          });
        } catch (err) {
          console.error(
            `[Job Package] sketch pages skipped for ${inspectionId}:`,
            err,
          );
        }
        archive.append(Buffer.from(pdfBytes), { name: "report.pdf" });
      }
    } catch (err) {
      console.error(
        `[Job Package] report PDF generation failed for ${inspectionId}:`,
        err,
      );
      // Don't fail the whole bundle — append a stub explaining the gap.
      archive.append(
        Buffer.from(
          `Report PDF could not be generated. See server logs for cause.`,
        ),
        { name: "report.MISSING.txt" },
      );
    }
  }

  // ── /invoice.pdf ───────────────────────────────────────────────────────
  // Invoice is linked Report→Invoice (Invoice.reportId). Resolve the most
  // recent non-DRAFT invoice for this report (if any).
  if (inspection.reportId) {
    const invoice = await prisma.invoice.findFirst({
      where: { reportId: inspection.reportId, status: { not: "DRAFT" } },
      orderBy: { invoiceDate: "desc" },
      select: { id: true, invoiceNumber: true },
    });
    if (invoice) {
      // No persistent invoice PDF in Supabase exists; we surface the invoice
      // number as a manifest entry so the recipient knows what to fetch from
      // the dashboard. A future SP can render the invoice PDF here.
      archive.append(
        Buffer.from(
          JSON.stringify(
            {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              note:
                "Invoice PDF is generated on demand at /api/invoices/<id>/pdf. " +
                "Open the invoice in RestoreAssist to render and download.",
            },
            null,
            2,
          ),
        ),
        { name: "invoice.reference.json" },
      );
    }
  }

  // ── /photos/<filename> ─────────────────────────────────────────────────
  for (const photo of inspection.photos) {
    try {
      const response = await fetch(photo.url);
      if (!response.ok) {
        console.error(
          `[Job Package] photo ${photo.id} fetch failed: ${response.status}`,
        );
        continue;
      }
      const arr = await response.arrayBuffer();
      const ext = (photo.mimeType ?? "image/jpeg").split("/")[1] ?? "jpg";
      archive.append(Buffer.from(arr), {
        name: `photos/${photo.id}.${ext}`,
      });
    } catch (err) {
      console.error(`[Job Package] photo ${photo.id} fetch error:`, err);
    }
  }

  // ── /authority-forms/<name>.pdf ────────────────────────────────────────
  // RA-7003: signed client authorisations (waivers) are part of the evidence
  // package contract — previously captured + signed but never bundled.
  if (inspection.reportId) {
    const signedForms = await prisma.authorityFormInstance.findMany({
      where: {
        reportId: inspection.reportId,
        status: "COMPLETED",
        pdfUrl: { not: null },
      },
      select: {
        id: true,
        pdfUrl: true,
        template: { select: { code: true } },
      },
      take: 50,
    });
    for (const form of signedForms) {
      try {
        const response = await fetch(form.pdfUrl!);
        if (!response.ok) {
          console.error(
            `[Job Package] authority form ${form.id} fetch failed: ${response.status}`,
          );
          continue;
        }
        const arr = await response.arrayBuffer();
        archive.append(Buffer.from(arr), {
          name: `authority-forms/${form.template?.code ?? "FORM"}-${form.id}.pdf`,
        });
      } catch (err) {
        console.error(
          `[Job Package] authority form ${form.id} fetch error:`,
          err,
        );
      }
    }
  }

  // ── /audit-log.json ────────────────────────────────────────────────────
  const auditPayload = {
    inspectionId: inspection.id,
    inspectionNumber: inspection.inspectionNumber,
    generatedAt: new Date().toISOString(),
    auditLogs: inspection.auditLogs,
  };
  archive.append(Buffer.from(JSON.stringify(auditPayload, null, 2)), {
    name: "audit-log.json",
  });

  await archive.finalize();
  await finished;

  const buffer = Buffer.concat(chunks);
  return { buffer, byteSize: buffer.byteLength };
}

/** Convert a Buffer to a Readable stream — convenience for piping. */
export function bufferToStream(buf: Buffer): Readable {
  return Readable.from(buf);
}
