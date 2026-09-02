/**
 * One renderer for an authority form's PDF, shared by every surface that needs
 * one.
 *
 * WHY. `AuthorityFormInstance.pdfUrl` is read in four places and written in
 * none. Nothing in the codebase assigns it — the only writer of a column by that
 * name is app/api/invoices/[id]/pdf/route.ts, which is the Invoice model. So the
 * two evidence exports, both of which filter `pdfUrl: { not: null }`, matched
 * zero rows on every job that has ever run:
 *
 *   lib/exports/job-package-zip.ts             — the /authority-forms/ folder
 *   app/api/reports/[id]/export-package/route  — the appended signed pages
 *
 * RA-7003's stated contract is that signed client authorisations are part of the
 * evidence package. They were captured, signed, and then silently left out of
 * every export. A homeowner's written consent to apply a chemical, or to dispose
 * of their property, was absent from the pack that documents the job.
 *
 * WHY RENDER RATHER THAN STORE. The alternative is to upload a PDF at signing
 * time and finally populate `pdfUrl`. Rendering here is better on three counts:
 * there is no external upload in the signing path to fail; the exports stop
 * making an outbound HTTP request to fetch their own data back; and, decisively,
 * the provenance block is computed at render time from the registry, so a stored
 * PDF would freeze a regulatory basis that can go out of date while the job is
 * still open.
 *
 * The route and both exports call this. Assembling the same PDF three times
 * from three copies of the include and the provenance lookup is the "one fact,
 * several surfaces" shape this codebase keeps paying for.
 */

import { generateAuthorityFormPDF } from "@/lib/generate-authority-form-pdf";
import { AUTHORITY_TEMPLATES } from "@/lib/documents/authority-catalogue";
import { buildProvenanceBlock } from "@/lib/documents/provenance";
import { resolveJobJurisdiction } from "@/lib/documents/job-jurisdiction";

/**
 * The Prisma include every caller must use. Exported so the three call sites
 * cannot drift into fetching different shapes for the same render — the defect
 * that put two different evidence gates in this repo under one name.
 */
export const AUTHORITY_FORM_RENDER_INCLUDE = {
  template: true,
  signatures: { orderBy: { createdAt: "asc" } },
  report: {
    select: {
      id: true,
      userId: true,
      assignedManagerId: true,
      assignedAdminId: true,
      claimReferenceNumber: true,
      // Report has no country column; the inspection is the only per-job source.
      inspection: { select: { propertyCountry: true } },
    },
  },
} as const;

export interface AuthorityFormRenderSource {
  id: string;
  companyName: string;
  companyLogo?: string | null;
  companyABN?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  companyAddress?: string | null;
  clientName: string;
  clientAddress: string;
  incidentDate?: Date | null;
  incidentBrief?: string | null;
  authorityDescription: string;
  template: { code: string; name: string };
  signatures: Array<{
    signatoryName: string;
    signatoryRole: string;
    signatureData: string | null;
    signedAt: Date | null;
    signatoryEmail?: string | null;
  }>;
  report: {
    claimReferenceNumber?: string | null;
    inspection?: { propertyCountry?: string | null } | null;
  };
}

export interface RenderedAuthorityForm {
  bytes: Uint8Array;
  /** What the browser should call the download. */
  filename: string;
}

export async function renderAuthorityFormPdf(
  form: AuthorityFormRenderSource,
  options: { draft?: boolean; now?: Date } = {},
): Promise<RenderedAuthorityForm> {
  const draft = options.draft === true;

  const signatures = form.signatures.map((sig) => ({
    signatoryName: sig.signatoryName,
    signatoryRole: sig.signatoryRole,
    // A draft is the form before it is signed. Rendering the captured strokes
    // into it would produce a document that looks executed and is not.
    signatureData: draft ? null : sig.signatureData,
    signedAt: sig.signedAt,
    signatoryEmail: sig.signatoryEmail,
  }));

  // A template absent from the code catalogue (a row seeded before it existed,
  // or added straight to the database) yields no block rather than throwing: an
  // authority form must still render. It then carries no regulatory basis, which
  // is the truthful outcome — the catalogue is what knows which regulations a
  // template cites.
  const spec = AUTHORITY_TEMPLATES.find((t) => t.code === form.template.code);
  const { jurisdiction, mayBeSchemaDefault } = resolveJobJurisdiction({
    inspectionPropertyCountry: form.report.inspection?.propertyCountry,
  });
  const provenance = spec
    ? buildProvenanceBlock(spec, jurisdiction, { mayBeSchemaDefault })
    : null;

  const bytes = await generateAuthorityFormPDF({
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
    date: options.now ?? new Date(),
    signatures,
    provenance,
  });

  return {
    bytes,
    filename: `${form.template.code}-${
      form.report.claimReferenceNumber || form.id.slice(-6)
    }.pdf`,
  };
}
