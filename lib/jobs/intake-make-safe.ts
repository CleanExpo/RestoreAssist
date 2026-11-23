/**
 * RA-8515 — what the intake page says about the make-safe checklist after a
 * save. The route answers makeSafeSeeded true or false; a replayed save can
 * answer null when the seeding outcome was not recorded. Null (or anything
 * else) is unknown, never "seeded", so the office is asked to check.
 */
export type MakeSafeState = "seeded" | "not-seeded" | "unknown";

export function makeSafeStateFromResponse(value: unknown): MakeSafeState {
  if (value === true) return "seeded";
  if (value === false) return "not-seeded";
  return "unknown";
}
