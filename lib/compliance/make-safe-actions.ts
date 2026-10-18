export const MAKE_SAFE_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
] as const;

export type MakeSafeActionName = (typeof MAKE_SAFE_ACTIONS)[number];

export interface MakeSafeActionState {
  applicable: boolean;
  completed: boolean;
  notes: string;
}

export type MakeSafeChecklistState = Record<
  MakeSafeActionName,
  MakeSafeActionState
>;

/** At least one applicable+completed row — required for submit (RA-7739). */
export function buildMakeSafePreset(
  completedApplicable: MakeSafeActionName[],
): MakeSafeChecklistState {
  const done = new Set(completedApplicable);
  return Object.fromEntries(
    MAKE_SAFE_ACTIONS.map((action) => {
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
    actions: MAKE_SAFE_ACTIONS.map((action) => ({
      action,
      applicable: state[action].applicable,
      completed: state[action].completed,
      notes: state[action].notes || undefined,
    })),
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
