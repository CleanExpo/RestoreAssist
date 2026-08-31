/**
 * Verbatim fingerprints from the licensed standards — the single list.
 *
 * WHY THIS FILE EXISTS. These sentences were duplicated in
 * scripts/check-no-verbatim-standards.ts and scripts/check-marketing-verbatim.ts,
 * with a comment in each telling the reader to keep the two in sync and nothing
 * enforcing it. Two copies of a detection list drift, and the drift is silent: the
 * gate that misses a fingerprint still reports a pass. One list, imported twice.
 *
 * WHY IT LIVES IN scripts/. Both gates scan for these strings. check-no-verbatim
 * scans lib, app, components and data; check-marketing-verbatim scans
 * docs/marketing, docs/distribution, docs/youtube-scripts, tools/remotion and
 * data/content. Neither scans scripts/, so the list can sit here without a gate
 * flagging its own detection strings. Do not move it into lib/.
 *
 * WHAT THESE ARE. Short, distinctive sentences, quoted only as detection
 * fingerprints — a tripwire, not redistributed content, and not an exhaustive
 * detector. Adding a fingerprint strengthens both gates at once.
 *
 * WHAT THIS DOES NOT COVER. A fingerprint list catches copied prose it has seen.
 * It cannot catch prose it has not. The output-side n-gram check in
 * lib/standards/copyright-guard.ts is the complementary control: it catches
 * partial reuse this list would miss.
 */
export const STANDARDS_FINGERPRINTS: readonly string[] = [
  "Mitigation following water damage events should begin as soon as safely possible",
  "establish drying goals that would be expected to inhibit microbial growth and return materials",
] as const;
