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
 * Per-jurisdiction steps layered on top of NATIONAL_BASE. An empty list means the
 * jurisdiction has not moved off NCC 2022 and no date has been announced — that is
 * a real answer, not missing data (the Northern Territory).
 *
 * Adoption is NOT monotonic. Tasmania adopted NCC 2025 on 1 May 2026 and then
 * REVERTED to NCC 2022 Amendment 2 five weeks later, so this is a list of steps
 * per state rather than a single adoption date. Any model that assumes a
 * jurisdiction only ever moves forward gets Tasmania wrong for eleven months.
 *
 * South Australia is split: the Plumbing Code (PCA) applies from 1 May 2026 but
 * the Building Code (BCA) not until 1 May 2027. RestoreAssist scopes building
 * reinstatement, so the BCA date governs here; the PCA date is recorded in
 * `SA_PCA_ADOPTION` rather than dropped.
 */
const STATE_STEPS: Record<AustralianState, NccAdoptionStep[]> = {
  ACT: [{ edition: "NCC 2025", from: "2026-05-01" }],
  NSW: [{ edition: "NCC 2025", from: "2027-05-01" }],
  // No announced adoption date. Not missing data — the NT has not adopted NCC 2025.
  NT: [],
  QLD: [{ edition: "NCC 2025", from: "2027-05-01" }],
  SA: [{ edition: "NCC 2025", from: "2027-05-01" }],
  // Tasmania: adopted, then reversed by primary legislation.
  //   1 May 2026  — NCC 2025 commences (the Building Amendment Bill had not yet
  //                 passed both Houses, so the national date took effect).
  //   5 June 2026 — Building Amendment Act 2026 (Tas) No. 6 of 2026 receives Royal
  //                 Assent and commences, substituting the Building Act 2016 s 4(1)
  //                 definition to fix the applicable edition at NCC 2022 as amended
  //                 by Amendment 2. NCC 2025 ceases to apply statewide.
  //   1 May 2027  — the definition points at the latest published edition again, so
  //                 NCC 2025 applies with no further instrument needed.
  // Note: a project approved under NCC 2025 during the five-week window completes
  // under NCC 2025 (Building Act 2016 s 11(5)). That is per-project transitional
  // relief, not a jurisdiction-wide edition, so it is not modelled here.
  TAS: [
    { edition: "NCC 2025", from: "2026-05-01" },
    { edition: "NCC 2022 Amendment 2", from: "2026-06-05" },
    { edition: "NCC 2025", from: "2027-05-01" },
  ],
  VIC: [{ edition: "NCC 2025", from: "2026-05-01" }],
  WA: [{ edition: "NCC 2025", from: "2026-05-01" }],
};

/** SA adopts the Plumbing Code a year ahead of the Building Code. */
export const SA_PCA_ADOPTION = "2026-05-01";

/** ACT and WA run a 12-month transition during which the prior edition remains available. */
export const TRANSITION_12_MONTHS: ReadonlySet<AustralianState> = new Set<AustralianState>([
  "ACT",
  "WA",
]);

function stepsFor(state: AustralianState): NccAdoptionStep[] {
  return [...NATIONAL_BASE, ...STATE_STEPS[state]];
}

export function isAustralianState(value: string): value is AustralianState {
  return value in STATE_STEPS;
}

export function listAustralianStates(): AustralianState[] {
  return Object.keys(STATE_STEPS) as AustralianState[];
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
  // Steps are chronological, so the LAST step whose date has arrived wins. This is
  // what makes a reversion (Tasmania) work: a later step may name an older edition.
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
