/**
 * Labour-hire per-job attestation — RA-1388 / Motion M-13.
 *
 * Accounting paper labour-hire capture matrix. Populated when an
 * attestation is created with `attestationType === "LABOUR_HIRE_SELF"`.
 *
 * Captures:
 *   - hours worked
 *   - Fair Work award classification
 *   - Super SG rate (12% mandatory from 1 Jul 2025)
 *   - Portable Long Service Leave applicability by AU state
 *   - Safety induction evidence reference
 *
 * Fair Work compliance check lives here as a pure function so the future
 * attestation-write API can validate before commit. No DB access, no
 * Prisma import — keeps the lib swappable and unit-testable.
 *
 * Board reference: .claude/board-2026-04-18/00-board-minutes.md §8 M-13.
 */

/**
 * AU states with portable LSL schemes that apply to labour-hire workers
 * in restoration / construction / cleaning. NSW (Long Service Corporation),
 * VIC (CoINVEST + Cbus Personal Super), QLD (QLeave), ACT (ACT LSL Authority),
 * TAS (TasBuild) — fee-paying schemes the engaging entity must register with.
 *
 * SA, WA, NT — no general portable LSL scheme as of 2026-04-26 (industry-
 * specific only); engaging entity records `null` for these.
 */
export const LABOUR_HIRE_PORTABLE_LSL_STATES = [
  "NSW",
  "VIC",
  "QLD",
  "ACT",
  "TAS",
] as const;

export type LabourHirePortableLslState =
  (typeof LABOUR_HIRE_PORTABLE_LSL_STATES)[number];

const LSL_STATE_SET = new Set<string>(LABOUR_HIRE_PORTABLE_LSL_STATES);

/**
 * Statutory Super Guarantee rate effective from 1 July 2025: 12% (0.12).
 * Validation rejects rates below this; rates above are accepted (employer
 * may pay above SG).
 */
export const LABOUR_HIRE_SG_MIN_RATE = 0.12;

/**
 * Hard cap on hours per attestation row — sanity check, prevents typos
 * (e.g. someone entering 4500 instead of 45.00). One labour-hire row is
 * one job; 168h covers a full week even on dual-shift incident response.
 */
export const LABOUR_HIRE_MAX_HOURS = 168;

// ─── Input shape ─────────────────────────────────────────────────────────────

export interface LabourHireAttestationInput {
  hours?: number | string | null;
  awardClass?: string | null;
  superRate?: number | string | null;
  /** AU state code uppercase, or null when scheme does not apply. */
  portableLslState?: string | null;
  /** Reference (id) to an evidence row holding induction proof. */
  inductionEvidenceId?: string | null;
}

// ─── Validation result ───────────────────────────────────────────────────────

export type LabourHireValidationResult =
  | { ok: true; normalised: NormalisedLabourHire }
  | { ok: false; errors: LabourHireValidationError[] };

export interface NormalisedLabourHire {
  hours: number;
  awardClass: string;
  superRate: number;
  portableLslState: LabourHirePortableLslState | null;
  inductionEvidenceId: string;
}

export interface LabourHireValidationError {
  field: keyof LabourHireAttestationInput;
  code:
    | "MISSING"
    | "INVALID_NUMBER"
    | "OUT_OF_RANGE"
    | "BELOW_SG_MIN"
    | "INVALID_STATE";
  message: string;
}

// ─── Validator ───────────────────────────────────────────────────────────────

/**
 * Fair Work compliance check for a labour-hire attestation. Pure: no DB
 * calls, no I/O. Caller commits the row only when `ok: true`.
 */
export function validateLabourHireAttestation(
  input: LabourHireAttestationInput,
): LabourHireValidationResult {
  const errors: LabourHireValidationError[] = [];

  // hours
  const hours = parseNumber(input.hours);
  if (hours === null) {
    errors.push({
      field: "hours",
      code: input.hours == null || input.hours === "" ? "MISSING" : "INVALID_NUMBER",
      message: "hours is required and must be a number",
    });
  } else if (hours <= 0 || hours > LABOUR_HIRE_MAX_HOURS) {
    errors.push({
      field: "hours",
      code: "OUT_OF_RANGE",
      message: `hours must be > 0 and <= ${LABOUR_HIRE_MAX_HOURS}`,
    });
  }

  // award class
  const awardClass =
    typeof input.awardClass === "string" ? input.awardClass.trim() : "";
  if (!awardClass) {
    errors.push({
      field: "awardClass",
      code: "MISSING",
      message: "awardClass is required (Fair Work classification)",
    });
  }

  // super rate
  const superRate = parseNumber(input.superRate);
  if (superRate === null) {
    errors.push({
      field: "superRate",
      code: input.superRate == null || input.superRate === "" ? "MISSING" : "INVALID_NUMBER",
      message: "superRate is required and must be a number",
    });
  } else if (superRate < LABOUR_HIRE_SG_MIN_RATE) {
    errors.push({
      field: "superRate",
      code: "BELOW_SG_MIN",
      message: `superRate must be >= ${LABOUR_HIRE_SG_MIN_RATE} (Super Guarantee minimum from 1 Jul 2025)`,
    });
  }

  // portable LSL state — optional, but if present must be one of the
  // listed states.
  let portableLslState: LabourHirePortableLslState | null = null;
  if (input.portableLslState != null && input.portableLslState !== "") {
    const upper = String(input.portableLslState).toUpperCase().trim();
    if (!LSL_STATE_SET.has(upper)) {
      errors.push({
        field: "portableLslState",
        code: "INVALID_STATE",
        message: `portableLslState must be one of ${LABOUR_HIRE_PORTABLE_LSL_STATES.join(", ")} or null`,
      });
    } else {
      portableLslState = upper as LabourHirePortableLslState;
    }
  }

  // induction evidence — required: every labour-hire engagement must
  // attach evidence of induction (WHS Act §19 due diligence).
  const induction =
    typeof input.inductionEvidenceId === "string"
      ? input.inductionEvidenceId.trim()
      : "";
  if (!induction) {
    errors.push({
      field: "inductionEvidenceId",
      code: "MISSING",
      message: "inductionEvidenceId is required (WHS induction proof)",
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    normalised: {
      hours: hours as number,
      awardClass,
      superRate: superRate as number,
      portableLslState,
      inductionEvidenceId: induction,
    },
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
