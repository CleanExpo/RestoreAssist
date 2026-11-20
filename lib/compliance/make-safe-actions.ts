import { normalizeClaimType } from "@/lib/evidence/claim-type";
import { ASBESTOS_PRESUMPTION_YEAR } from "@/lib/compliance/asbestos-era";
import { MAKE_SAFE_SEED_NOTE } from "@/lib/compliance/make-safe-compliance";
import { apiErrorMessage } from "@/lib/api-error-message";

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

/** A stored row as the list decision needs it. Load `notes` with it. */
export interface StoredMakeSafeRow {
  action: string;
  applicable: boolean;
  completed: boolean;
  notes?: string | null;
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
 * - Only the job's current claim type decides. A fire claim gates on the fire
 *   list; every other recorded claim type (water, mould, storm and so on)
 *   gates on the standard list. A blank claim type counts as fire when the job
 *   has a fire assessment, otherwise standard. Stored rows and their dates
 *   never change the list, so there is no exception to game.
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
  const kind: MakeSafeListKind = fireClaim ? "fire" : "standard";
  const other: MakeSafeListKind = kind === "fire" ? "standard" : "fire";
  const history = rows.filter(
    (r) => ONLY_ON[other].has(r.action) && !isUntouchedSeedRow(r),
  );
  return { kind, actions: LISTS[kind], history };
}

/** One action on the job's list, as completion is judged. */
export interface MakeSafeItem {
  action: MakeSafeActionName;
  applicable: boolean;
  completed: boolean;
  /** False when no row was ever saved; it then reads as open. */
  stored: boolean;
}

export interface MakeSafeCompletion<R extends StoredMakeSafeRow = StoredMakeSafeRow>
  extends MakeSafeListDecision<R> {
  /** One item per action on the job's list, in list order. */
  items: MakeSafeItem[];
  /** Applicable items not completed, including actions with no row. */
  open: MakeSafeItem[];
}

/**
 * The one owner of "is make-safe complete". Every reader that judges
 * completion (submit gate, stabilisation attestation, adjuster review, report
 * gaps) reads this answer. Only the job's own list counts: a missing row is an
 * open item, and history rows never block.
 */
export function judgeMakeSafe<R extends StoredMakeSafeRow>(input: {
  claimType?: string | null;
  hasFireAssessment?: boolean;
  rows?: readonly R[];
}): MakeSafeCompletion<R> {
  const decision = decideMakeSafeList(input);
  const byAction = new Map((input.rows ?? []).map((r) => [r.action, r]));
  const items = decision.actions.map((action): MakeSafeItem => {
    const row = byAction.get(action);
    return row
      ? { action, applicable: row.applicable, completed: row.completed, stored: true }
      : { action, applicable: true, completed: false, stored: false };
  });
  const open = items.filter((i) => i.applicable && !i.completed);
  return { ...decision, items, open };
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
      apiErrorMessage(body) ?? `HTTP ${res.status}`,
    );
  }
}
