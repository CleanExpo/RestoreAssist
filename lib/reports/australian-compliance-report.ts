/**
 * RA-8600: the report PDF's reader for AustralianComplianceRecord, the record
 * the "Australian Compliance" section of a new inspection saves. Pure, so it
 * can be tested without a PDF.
 *
 * Print rule: only what the technician recorded. An empty field prints no row,
 * never "N/A" and never an invented value.
 *
 * Booleans: `asbestosRiskAcknowledged` and `workHalted` default to false in the
 * schema, so a stored false cannot be told apart from "never answered". They
 * print only when true. `separateInvoiceRequired` defaults to true, so it prints
 * only beside a recorded removal quote, which it qualifies.
 *
 * Duplicates (RA-8600 criterion 2): the report's other party rows come from the
 * Report and User tables (claim number, attending technician's name). None of
 * them holds the technician's certification or licence, or the loss adjuster,
 * so this record is the only source for those rows and nothing prints twice.
 * Insurer name, claim number, state and year built here are copies of values
 * stored elsewhere (RA-8335) and are deliberately not printed from this record.
 */
import { formatMoney } from "@/lib/locale/format";

export interface AustralianComplianceReportRecord {
  lossAdjusterName?: string | null;
  lossAdjusterReference?: string | null;
  technicianCertification?: string | null;
  technicianLicenseNumber?: string | null;
  asbestosRiskAcknowledged?: boolean | null;
  friableAssessment?: string | null;
  workHalted?: boolean | null;
  licensedAssessorName?: string | null;
  licensedAssessorLicense?: string | null;
  /** Prisma Decimal arrives as an object with toString(); numbers and strings also accepted. */
  removalQuoteAud?: number | string | { toString(): string } | null;
  separateInvoiceRequired?: boolean | null;
}

// The labels the technician chose from (NIRClaimAssessmentPanel), so the report
// says what was selected and nothing more.
const CERTIFICATION_LABEL: Record<string, string> = {
  WRT: "WRT - Water Damage",
  ASD: "ASD - Applied Structural Drying",
  CMS: "CMS - Commercial Drying",
  HST: "HST - Health & Safety",
  OCT: "OCT - Odour Control",
  CCT: "CCT - Carpet Cleaning",
  MRS: "MRS - Mould Remediation",
  OTHER: "Other",
};

function filled(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function quoteText(v: AustralianComplianceReportRecord["removalQuoteAud"]): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "object" ? v.toString() : v);
  if (!Number.isFinite(n)) return null;
  // The column is AUD by name, whatever the organisation's country.
  return formatMoney(Math.round(n * 100), "AU");
}

/** Rows for the report's job parties block (Section 1). */
export function complianceJobPartyRows(
  r: AustralianComplianceReportRecord | null | undefined,
): Array<[string, string]> {
  if (!r) return [];
  const rows: Array<[string, string]> = [];
  const cert = filled(r.technicianCertification);
  if (cert) rows.push(["Technician Certification:", CERTIFICATION_LABEL[cert] ?? cert]);
  const licence = filled(r.technicianLicenseNumber);
  if (licence) rows.push(["Technician Licence No.:", licence]);
  const adjuster = filled(r.lossAdjusterName);
  if (adjuster) rows.push(["Loss Adjuster:", adjuster]);
  const adjusterRef = filled(r.lossAdjusterReference);
  if (adjusterRef) rows.push(["Loss Adjuster Reference:", adjusterRef]);
  return rows;
}

/** Rows for the asbestos hazard section. Empty when nothing was recorded. */
export function complianceAsbestosRows(
  r: AustralianComplianceReportRecord | null | undefined,
): Array<[string, string]> {
  if (!r) return [];
  const rows: Array<[string, string]> = [];
  if (r.asbestosRiskAcknowledged === true) rows.push(["Asbestos risk acknowledged:", "Yes"]);
  const friable = filled(r.friableAssessment);
  if (friable) rows.push(["Friable assessment:", friable]);
  if (r.workHalted === true) rows.push(["Work halted:", "Yes"]);
  const assessor = filled(r.licensedAssessorName);
  if (assessor) rows.push(["Licensed assessor:", assessor]);
  const assessorLicence = filled(r.licensedAssessorLicense);
  if (assessorLicence) rows.push(["Assessor licence No.:", assessorLicence]);
  const quote = quoteText(r.removalQuoteAud);
  if (quote) {
    rows.push(["Removal quote:", quote]);
    if (typeof r.separateInvoiceRequired === "boolean") {
      rows.push(["Separate invoice required:", r.separateInvoiceRequired ? "Yes" : "No"]);
    }
  }
  return rows;
}
