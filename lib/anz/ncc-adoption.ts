/**
 * National Construction Code adoption, by jurisdiction and by date.
 *
 * WHY THIS IS NOT A CONSTANT. The NCC is published by the ABCB, but it takes
 * legal effect only when a state or territory adopts it, and they do so on
 * different dates — occasionally not at all. Treating "the NCC edition" as one
 * global string is wrong in both directions at once: as at this file's
 * verification date, a Victorian job is governed by NCC 2025 while a NSW job of
 * the same day is still governed by NCC 2022 Amendment 2, and the Northern
 * Territory has not adopted NCC 2025 in any form.
 *
 * Verified 2026-08-31 against ncc.abcb.gov.au:
 *   - "NCC 2025 was published on 1 May 2026" and is adopted progressively
 *     (ncc.abcb.gov.au/ncc-2025/ncc-2025-state-and-territory-adoption-information)
 *   - NCC 2022 Amendment 1 adopted from 1 May 2025; Amendment 2 from 29 July 2025,
 *     superseding Amendment 1 (ncc.abcb.gov.au/editions-national-construction-code)
 *
 * SCOPE OF THE MODEL. Steps begin at NCC 2022. The per-jurisdiction adoption dates
 * for NCC 2022 itself (2023) are deliberately NOT modelled: no job this product
 * scopes predates them, and inventing dates that have not been verified would be
 * exactly the failure this file exists to fix. `EPOCH` means "before the first
 * modelled transition", not "since the beginning of time".
 */

export type AustralianState =
  | "ACT"
  | "NSW"
  | "NT"
  | "QLD"
  | "SA"
  | "TAS"
  | "VIC"
  | "WA";

export interface NccAdoptionStep {
  /** The edition in force from `from` until the next step. */
  edition: string;
  /** ISO date (YYYY-MM-DD) the step takes effect in this jurisdiction. */
  from: string;
}

/** Sentinel for "in force before the first transition this table models". */
const EPOCH = "0000-01-01";

/**
 * Amendment history common to every jurisdiction. The ABCB adopted both
 * amendments nationally on the same dates, so they are shared rather than
 * repeated per state.
 */
const NATIONAL_BASE: NccAdoptionStep[] = [
  { edition: "NCC 2022", from: EPOCH },
  { edition: "NCC 2022 Amendment 1", from: "2025-05-01" },
  { edition: "NCC 2022 Amendment 2", from: "2025-07-29" },
];

/**
 * When each jurisdiction adopts NCC 2025. `null` means it has not adopted it and
 * no date has been announced — that is a real answer, not missing data.
 *
 * South Australia is split: the Plumbing Code (PCA) applies from 1 May 2026 but
 * the Building Code (BCA) not until 1 May 2027. RestoreAssist scopes building
 * reinstatement, so the BCA date governs here; the PCA date is recorded in
 * `SA_PCA_ADOPTION` rather than dropped.
 */
const NCC_2025_ADOPTION: Record<AustralianState, string | null> = {
  ACT: "2026-05-01",
  NSW: "2027-05-01",
  NT: null,
  QLD: "2027-05-01",
  SA: "2027-05-01",
  TAS: "2026-05-01",
  VIC: "2026-05-01",
  WA: "2026-05-01",
};

/** SA adopts the Plumbing Code a year ahead of the Building Code. */
export const SA_PCA_ADOPTION = "2026-05-01";

/** ACT and WA run a 12-month transition during which the prior edition remains available. */
export const TRANSITION_12_MONTHS: ReadonlySet<AustralianState> = new Set<AustralianState>([
  "ACT",
  "WA",
]);

function stepsFor(state: AustralianState): NccAdoptionStep[] {
  const adopted = NCC_2025_ADOPTION[state];
  if (adopted === null) return NATIONAL_BASE;
  return [...NATIONAL_BASE, { edition: "NCC 2025", from: adopted }];
}

export function isAustralianState(value: string): value is AustralianState {
  return value in NCC_2025_ADOPTION;
}

export function listAustralianStates(): AustralianState[] {
  return Object.keys(NCC_2025_ADOPTION) as AustralianState[];
}

/**
 * The NCC edition legally in force in `state` on `asAt` (ISO date, default today).
 * e.g. VIC on 2026-08-31 → "NCC 2025"; NSW the same day → "NCC 2022 Amendment 2";
 * NT on any date → "NCC 2022 Amendment 2", because it has not adopted NCC 2025.
 */
export function resolveNccEdition(
  state: AustralianState,
  asAt: string = new Date().toISOString().slice(0, 10),
): string {
  const steps = stepsFor(state);
  let current = steps[0].edition;
  for (const step of steps) {
    if (step.from <= asAt) current = step.edition;
  }
  return current;
}

/**
 * The edition in force in EVERY jurisdiction on `asAt` — the strongest statement
 * that is true nationally.
 *
 * Used when a job has no state recorded. It deliberately understates rather than
 * overstates: during a split adoption it returns the older edition, so a citation
 * built from it is correct everywhere, if less precise than it could be. The
 * opposite default would assert NCC 2025 compliance for a NSW job two years early.
 * Prefer `resolveNccEdition(state)` wherever the state is known.
 */
export function nationalFloorEdition(
  asAt: string = new Date().toISOString().slice(0, 10),
): string {
  const editions = listAustralianStates().map((s) => resolveNccEdition(s, asAt));
  // Ordered oldest → newest; the floor is the first one any jurisdiction is still on.
  const order = [
    "NCC 2022",
    "NCC 2022 Amendment 1",
    "NCC 2022 Amendment 2",
    "NCC 2025",
  ];
  for (const candidate of order) {
    if (editions.includes(candidate)) return candidate;
  }
  return order[order.length - 1];
}
