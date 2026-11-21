/**
 * RA-8495 (DRC S2) — what the office enters when it logs a job.
 *
 * Pure parsing only: the route owns auth, tenancy and the transaction. Any
 * field the client sends that is not named here (jobNumber,
 * jobNumberOrganizationId, organizationId, userId, ...) is never read.
 */
import { ClaimType, JobClientType } from "@prisma/client";
import { sanitizeString } from "@/lib/sanitize";

export const JOB_CLIENT_TYPES = Object.values(JobClientType) as JobClientType[];
export const INTAKE_CLAIM_TYPES = Object.values(ClaimType) as ClaimType[];

export interface OfficeIntakeInput {
  propertyAddress: string;
  propertyPostcode: string;
  policyNumber: string | null;
  claimNumber: string | null;
  clientType: JobClientType;
  insuredName: string | null;
  insuredPhone: string | null;
  insuredEmail: string | null;
  claimType: ClaimType;
  officeNotes: string | null;
}

export type ParseResult =
  | { ok: true; data: OfficeIntakeInput }
  | { ok: false; fields: Record<string, string> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits, spaces, brackets, dashes and a leading plus; 8 to 15 digits in all.
const PHONE_CHARS = /^\+?[0-9 ()-]+$/;
const POSTCODE = /^[0-9]{4}$/;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = sanitizeString(value, max).trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function parseOfficeIntake(body: unknown): ParseResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};

  const propertyAddress = text(b.propertyAddress, 500);
  if (!propertyAddress) fields.propertyAddress = "Job address is required";

  const propertyPostcode = text(b.propertyPostcode, 20);
  if (!propertyPostcode || !POSTCODE.test(propertyPostcode)) {
    fields.propertyPostcode = "Enter the four-digit postcode";
  }

  const clientType = b.clientType;
  if (typeof clientType !== "string" || !JOB_CLIENT_TYPES.includes(clientType as JobClientType)) {
    fields.clientType = "Choose the client type";
  }

  const claimType = b.claimType;
  if (typeof claimType !== "string" || !INTAKE_CLAIM_TYPES.includes(claimType as ClaimType)) {
    fields.claimType = "Choose the claim type";
  }

  const insuredName = text(b.insuredName, 200);

  const insuredPhone = text(b.insuredPhone, 40);
  if (insuredPhone) {
    const digits = insuredPhone.replace(/[^0-9]/g, "").length;
    if (!PHONE_CHARS.test(insuredPhone) || digits < 8 || digits > 15) {
      fields.insuredPhone = "Enter a valid phone number";
    }
  }

  const insuredEmail = text(b.insuredEmail, 254);
  if (insuredEmail && !EMAIL.test(insuredEmail)) {
    fields.insuredEmail = "Enter a valid email address";
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    data: {
      propertyAddress: propertyAddress!,
      propertyPostcode: propertyPostcode!,
      policyNumber: text(b.policyNumber, 100),
      claimNumber: text(b.claimNumber, 100),
      clientType: clientType as JobClientType,
      insuredName,
      insuredPhone,
      insuredEmail: insuredEmail ? insuredEmail.toLowerCase() : null,
      claimType: claimType as ClaimType,
      officeNotes: text(b.officeNotes, 5000),
    },
  };
}

/** Names (never values) of the optional fields the office filled in. */
export function filledFieldNames(data: OfficeIntakeInput): string[] {
  return (Object.keys(data) as (keyof OfficeIntakeInput)[]).filter(
    (k) => data[k] !== null && data[k] !== "",
  );
}
