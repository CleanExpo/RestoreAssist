import { normalizeClaimType } from "@/lib/evidence/claim-type";
import { ASBESTOS_PRESUMPTION_YEAR } from "@/lib/compliance/asbestos-era";

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

/** A stored row as the list decision needs it. */
export interface StoredMakeSafeRow {
  action: string;
  applicable: boolean;
  completed: boolean;
}

/**
 * Which list this job is checked against.
 *
 * 1. A list the technician has recorded on keeps the job: a row unique to one
 *    list that is applicable or completed fixes that list, and so does any
 *    recorded row when only one list's rows are stored. This is what keeps
 *    live jobs reading the way they did (a fire job assessed on the standard
 *    list before RA-8327 stays on it), and keeps a recorded fire list when a
 *    later assessment route overwrites claimType.
 * 2. Otherwise the claim type decides: fire claims get the fire list.
 * 3. With no claim type, the seeded rows name the list; with none, standard.
 *
 * An all-N/A list is not a record (RA-7739 reads it as "not assessed"), so an
 * untouched intake seed never pins a job to the wrong list.
 */
export function makeSafeListKindFor(input: {
  claimType?: string | null;
  rows?: readonly StoredMakeSafeRow[];
}): MakeSafeListKind {
  const rows = input.rows ?? [];
  const recorded = rows.filter((r) => r.applicable || r.completed);
  if (recorded.some((r) => ONLY_ON.fire.has(r.action))) return "fire";
  if (recorded.some((r) => ONLY_ON.standard.has(r.action))) return "standard";
  if (recorded.length > 0) {
    // Only shared actions (power, gas, occupants) recorded: the list seeded
    // alongside them is the one the technician was working on.
    const seededFire = hasRowUniqueTo("fire", rows);
    const seededStandard = hasRowUniqueTo("standard", rows);
    if (seededFire !== seededStandard) return seededFire ? "fire" : "standard";
  }

  const claim = normalizeClaimType(input.claimType);
  if (claim === "FIRE_SMOKE") return "fire";
  if (claim) return "standard";

  if (rows.some((r) => ONLY_ON.fire.has(r.action))) return "fire";
  return "standard";
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
