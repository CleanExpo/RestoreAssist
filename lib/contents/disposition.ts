/**
 * RA-8501 (DRC S8) — the one owner of how a contents item's disposition reads.
 *
 * The stored value is `ContentsPackOutItem.packOutDecision`
 * (CLEAN_ONSITE / PACK_OUT / TOTAL_LOSS). Contractors talk about the same
 * decision as "restorable" or "non-restorable" (DRC: "Res / Non Res"). No
 * Australian standard defines that vocabulary (RA-8485 research pack), so the
 * stored values stay as they are and every screen and export reads its words
 * from here. Letting each contractor rename the labels is a follow-up: it needs
 * a per-organisation setting that does not exist yet.
 */

export type PackOutDecisionValue = "CLEAN_ONSITE" | "PACK_OUT" | "TOTAL_LOSS";

export type DispositionGroup = "Restorable" | "Non-restorable" | "Not decided";

export const PACK_OUT_DECISIONS: readonly PackOutDecisionValue[] = [
  "CLEAN_ONSITE",
  "PACK_OUT",
  "TOTAL_LOSS",
];

const LABELS: Record<PackOutDecisionValue, string> = {
  CLEAN_ONSITE: "Restorable - clean on site",
  PACK_OUT: "Restorable - pack out",
  TOTAL_LOSS: "Non-restorable",
};

const GROUPS: Record<PackOutDecisionValue, DispositionGroup> = {
  CLEAN_ONSITE: "Restorable",
  PACK_OUT: "Restorable",
  TOTAL_LOSS: "Non-restorable",
};

function known(value: unknown): value is PackOutDecisionValue {
  return (
    typeof value === "string" &&
    (PACK_OUT_DECISIONS as readonly string[]).includes(value)
  );
}

/** The words shown for a stored disposition. Anything unrecognised reads as not decided. */
export function dispositionLabel(value: unknown): string {
  return known(value) ? LABELS[value] : "Not decided";
}

/** Restorable or Non-restorable, the contractor's two-way split. */
export function dispositionGroup(value: unknown): DispositionGroup {
  return known(value) ? GROUPS[value] : "Not decided";
}

/** Options for a disposition picker, in display order. */
export const DISPOSITION_OPTIONS: readonly {
  value: PackOutDecisionValue;
  label: string;
}[] = PACK_OUT_DECISIONS.map((value) => ({ value, label: LABELS[value] }));
