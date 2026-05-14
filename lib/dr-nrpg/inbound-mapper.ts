/**
 * DR-NRPG inbound webhook → Inspection mapper.
 *
 * Pure function: takes a verified DR-NRPG webhook payload and produces the
 * Inspection.create() data block. Extracted from
 * `app/api/webhooks/dr-nrpg/route.ts` so the mapping rules (lossType → ClaimType,
 * postcode extraction, NIR number generation, default source) are unit-testable
 * without touching the database or HMAC verification path.
 *
 * Mapping rules:
 *  - propertyAddress: required — the webhook caller already gated on this
 *  - propertyPostcode: extract AU 4-digit postcode at end of address string;
 *                      fallback "0000" with a TODO for manual correction
 *  - claimType: lossType → ClaimType enum (water→WATER, fire→FIRE, etc.);
 *               unknown / missing → null (NOT defaulted to WATER — caller
 *               can review). See [ASSUMPTION] in PR body.
 *  - source: hard-coded "DR_NRPG"
 *  - status: "DRAFT" — inspection requires explicit accept
 *
 * @see prisma/schema.prisma Inspection + ClaimType enum
 */

export type DrNrpgEventType =
  | "job.dispatched"
  | "job.updated"
  | "job.completed"
  | "job.cancelled";

export interface DrNrpgWebhookPayload {
  event: DrNrpgEventType;
  jobId: string;
  claimNumber: string;
  insurer?: string;
  policyHolder?: string;
  propertyAddress?: string;
  lossType?: string;
  status?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** ClaimType values declared in prisma/schema.prisma. */
export type ClaimType =
  | "WATER"
  | "FIRE"
  | "MOULD"
  | "STORM"
  | "CONTENTS"
  | "BIOHAZARD"
  | "ODOUR"
  | "CARPET"
  | "HVAC"
  | "ASBESTOS";

const LOSS_TYPE_MAP: Record<string, ClaimType> = {
  water: "WATER",
  fire: "FIRE",
  mould: "MOULD",
  mold: "MOULD",
  storm: "STORM",
  biohazard: "BIOHAZARD",
};

/** Map a DR-NRPG lossType string to the canonical ClaimType enum value. */
export function mapLossTypeToClaimType(
  lossType: string | undefined | null,
): ClaimType | null {
  if (!lossType) return null;
  return LOSS_TYPE_MAP[lossType.trim().toLowerCase()] ?? null;
}

/** Extract the trailing AU 4-digit postcode from a free-text address. */
export function extractAuPostcode(address: string): string | null {
  const match = address.match(/\b(\d{4})\b\s*$/);
  return match?.[1] ?? null;
}

/**
 * Generate an inspection-number that matches the existing
 * NIR-YYYY-MM-XXXXYYYY convention used elsewhere in the codebase.
 *
 * Caller supplies the random hex (4 chars) so tests are deterministic.
 */
export function buildInspectionNumber(opts: {
  timestamp: Date;
  jobId: string;
  randomHex: string;
}): string {
  const { timestamp, jobId, randomHex } = opts;
  const year = timestamp.getUTCFullYear();
  const month = String(timestamp.getUTCMonth() + 1).padStart(2, "0");
  const suffix = jobId
    .replace(/[^A-Z0-9]/gi, "")
    .slice(-4)
    .toUpperCase()
    .padStart(4, "0");
  return `NIR-${year}-${month}-${randomHex.toUpperCase()}${suffix}`;
}

export interface MappedInspectionInput {
  inspectionNumber: string;
  propertyAddress: string;
  propertyPostcode: string;
  inspectionDate: Date;
  status: "DRAFT";
  source: "DR_NRPG";
  claimType: ClaimType | null;
}

/**
 * Map a verified DR-NRPG payload to an Inspection.create() data block.
 * Returns null if the payload lacks the minimum fields to create an inspection
 * (no propertyAddress). Caller is responsible for attaching `userId` and any
 * relation fields the schema requires.
 */
export function mapPayloadToInspection(opts: {
  payload: DrNrpgWebhookPayload;
  randomHex: string;
}): MappedInspectionInput | null {
  const { payload, randomHex } = opts;
  if (!payload.propertyAddress?.trim()) return null;

  const inspectionDate = new Date(payload.timestamp);
  const postcode = extractAuPostcode(payload.propertyAddress) ?? "0000";

  return {
    inspectionNumber: buildInspectionNumber({
      timestamp: inspectionDate,
      jobId: payload.jobId,
      randomHex,
    }),
    propertyAddress: payload.propertyAddress,
    propertyPostcode: postcode,
    inspectionDate,
    status: "DRAFT",
    source: "DR_NRPG",
    claimType: mapLossTypeToClaimType(payload.lossType),
  };
}
