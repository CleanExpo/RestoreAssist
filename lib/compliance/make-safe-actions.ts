import { normalizeClaimType } from "@/lib/evidence/claim-type";
import { ASBESTOS_PRESUMPTION_YEAR } from "@/lib/compliance/asbestos-era";
import { MAKE_SAFE_SEED_NOTE } from "@/lib/compliance/make-safe-compliance";

/**
 * The standard Stabilisation (make-safe) list: water, mould and every job
 * that is not fire. Unchanged since RA-1136a; existing rows and quick-fill
 * presets are keyed on these ids.
 */
export const MAKE_SAFE_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
] as const;

/**
 * RA-8327: the fire list. Power, gas and the occupant briefing mean the same
 * thing on a fire job, so they keep the standard ids (the SWMS generator reads
 * power_isolated and gas_isolated by id). Mould containment and water source
 * are replaced by the structure, the openings and asbestos.
 */
export const FIRE_MAKE_SAFE_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "structure_safe",
  "openings_secured",
  "occupant_briefing",
  "asbestos_presumed",
] as const;

export type StandardMakeSafeActionName = (typeof MAKE_SAFE_ACTIONS)[number];
export type FireMakeSafeActionName = (typeof FIRE_MAKE_SAFE_ACTIONS)[number];
export type MakeSafeActionName =
  | StandardMakeSafeActionName
  | FireMakeSafeActionName;

export type MakeSafeListKind = "standard" | "fire";

/** The one place the checklist, the gate and every error message read labels. */
export const MAKE_SAFE_ACTION_LABELS: Record<MakeSafeActionName, string> = {
  power_isolated: "Power isolated (electrical hazard)",
  gas_isolated: "Gas supply isolated (gas leak hazard)",
  mould_containment: "Mould containment barriers erected",
  water_stopped: "Water source stopped/diverted",
  occupant_briefing: "Occupant safety briefing documented",
  structure_safe: "Structure safe to enter, or engineer clearance obtained",
  openings_secured:
    "Openings secured (doors, windows and fire-damaged roof or walls boarded or covered)",
  asbestos_presumed: `Asbestos presumed present until tested where the building was built before ${ASBESTOS_PRESUMPTION_YEAR.AU} (Australia) or ${ASBESTOS_PRESUMPTION_YEAR.NZ} (New Zealand)`,
};

const LISTS: Record<MakeSafeListKind, readonly MakeSafeActionName[]> = {
  standard: MAKE_SAFE_ACTIONS,
  fire: FIRE_MAKE_SAFE_ACTIONS,
};

/** Ids on one list and not the other: the ones that say which list a job holds. */
const ONLY_ON: Record<MakeSafeListKind, ReadonlySet<string>> = {
  standard: new Set(
    MAKE_SAFE_ACTIONS.filter(
      (a) => !(FIRE_MAKE_SAFE_ACTIONS as readonly string[]).includes(a),
    ),
  ),
  fire: new Set(
    FIRE_MAKE_SAFE_ACTIONS.filter(
      (a) => !(MAKE_SAFE_ACTIONS as readonly string[]).includes(a),
    ),
  ),
};

export function makeSafeActionsFor(
  kind: MakeSafeListKind,
): readonly MakeSafeActionName[] {
  return LISTS[kind];
}

export function isMakeSafeActionOn(
  kind: MakeSafeListKind,
  action: string,
): action is MakeSafeActionName {
  return (LISTS[kind] as readonly string[]).includes(action);
}

/**
 * When the fire list shipped (RA-8327). A fire job whose standard list was
 * created before this moment, and recorded on, keeps gating on that list.
 */
export const FIRE_LIST_INTRODUCED_AT = new Date("2026-11-12T00:00:00.000Z");

/** A stored row as the list decision needs it. Load `notes` and `createdAt`. */
export interface StoredMakeSafeRow {
  action: string;
  applicable: boolean;
  completed: boolean;
  notes?: string | null;
  createdAt?: Date | string | null;
}

/**
 * The one owner of "untouched intake seed" for a single row: N/A, not
 * completed, carrying the seed note. Anything else is a person's record,
 * including an N/A saved with no note or with a technician's note.
 */
export function isUntouchedSeedRow(row: StoredMakeSafeRow): boolean {
  return (
    !row.applicable && !row.completed && row.notes === MAKE_SAFE_SEED_NOTE
  );
}

/** True when there are rows and every one is the untouched intake seed. */
export function isIntakeSeed(rows: readonly StoredMakeSafeRow[]): boolean {
  return rows.length > 0 && rows.every(isUntouchedSeedRow);
}

function createdBeforeFireList(row: StoredMakeSafeRow): boolean {
  if (row.createdAt == null) return false; // unknown date: not legacy
  const at = new Date(row.createdAt).getTime();
  return Number.isFinite(at) && at < FIRE_LIST_INTRODUCED_AT.getTime();
}

/**
 * A fire job that already holds a standard list recorded before RA-8327:
 * standard-only rows exist and are all dated before the fire list, no
 * fire-only row exists, and a person has recorded at least one row. Unknown
 * dates fail this, so the stricter fire list wins.
 */
function holdsLegacyStandardList(rows: readonly StoredMakeSafeRow[]): boolean {
  const standardOnly = rows.filter((r) => ONLY_ON.standard.has(r.action));
  if (standardOnly.length === 0 || hasRowUniqueTo("fire", rows)) return false;
  if (!standardOnly.every(createdBeforeFireList)) return false;
  return rows.some((r) => !isUntouchedSeedRow(r));
}

/** No claim type recorded yet. Any recorded value, known or not, is not blank. */
export function isBlankClaimType(claimType: string | null | undefined): boolean {
  return claimType == null || claimType.trim() === "";
}

export interface MakeSafeListDecision<
  R extends StoredMakeSafeRow = StoredMakeSafeRow,
> {
  kind: MakeSafeListKind;
  /** The actions the gate checks and the checklist edits. */
  actions: readonly MakeSafeActionName[];
  /** Recorded rows unique to the other list: shown read-only, never counted. */
  history: R[];
}

/**
 * Which list this job is checked against. The one owner of the rule: the
 * gate, the intake seed and the route all read its answer, and the checklist
 * draws the list the route names.
 *
 * - The job's current claim type decides. A known non-fire claim (water,
 *   mould, storm and so on) gates on the standard list; a fire claim gates on
 *   the fire list. A blank claim type counts as fire when the job has a fire
 *   assessment (the same rule the walkthrough uses), otherwise standard.
 * - Exception: a fire job that already holds a standard list recorded before
 *   RA-8327 keeps gating on it, so live jobs read as they did.
 * - Rows recorded on the other list come back as history. They never count
 *   toward the gate, so a reclassification never makes the gate easier.
 */
export function decideMakeSafeList<R extends StoredMakeSafeRow>(input: {
  claimType?: string | null;
  hasFireAssessment?: boolean;
  rows?: readonly R[];
}): MakeSafeListDecision<R> {
  const rows = input.rows ?? [];
  const fireClaim =
    normalizeClaimType(input.claimType) === "FIRE_SMOKE" ||
    (isBlankClaimType(input.claimType) && input.hasFireAssessment === true);
  const kind: MakeSafeListKind =
    fireClaim && !holdsLegacyStandardList(rows) ? "fire" : "standard";
  const other: MakeSafeListKind = kind === "fire" ? "standard" : "fire";
  const history = rows.filter(
    (r) => ONLY_ON[other].has(r.action) && !isUntouchedSeedRow(r),
  );
  return { kind, actions: LISTS[kind], history };
}

/** True when the rows already hold a row unique to this list. */
export function hasRowUniqueTo(
  kind: MakeSafeListKind,
  rows: readonly { action: string }[],
): boolean {
  return rows.some((r) => ONLY_ON[kind].has(r.action));
}

export interface MakeSafeActionState {
  applicable: boolean;
  completed: boolean;
  notes: string;
}

/** Keyed by the actions on the job's list; the standard list for presets. */
export type MakeSafeChecklistState = Partial<
  Record<MakeSafeActionName, MakeSafeActionState>
>;

/** At least one applicable+completed row — required for submit (RA-7739). */
export function buildMakeSafePreset(
  completedApplicable: MakeSafeActionName[],
  kind: MakeSafeListKind = "standard",
): MakeSafeChecklistState {
  const done = new Set(completedApplicable);
  return Object.fromEntries(
    makeSafeActionsFor(kind).map((action) => {
      const active = done.has(action);
      return [
        action,
        {
          applicable: active,
          completed: active,
          notes: active ? "Documented during site attendance." : "",
        },
      ];
    }),
  ) as MakeSafeChecklistState;
}

export function buildMakeSafePatchBody(state: MakeSafeChecklistState) {
  return {
    actions: (Object.keys(state) as MakeSafeActionName[]).flatMap((action) => {
      const row = state[action];
      if (!row) return [];
      return [
        {
          action,
          applicable: row.applicable,
          completed: row.completed,
          notes: row.notes || undefined,
        },
      ];
    }),
  };
}

export async function persistMakeSafeChecklist(
  inspectionId: string,
  state: MakeSafeChecklistState,
): Promise<void> {
  const res = await fetch(`/api/inspections/${inspectionId}/make-safe`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildMakeSafePatchBody(state)),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`,
    );
  }
}
