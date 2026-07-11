/**
 * RA-7031 (RA-1132i) — release flag for the Live Teacher UI.
 *
 * The Live Teacher backend (session + /turn SSE + audit) is live and tested, but
 * the UI is gated OFF until a pilot tenant is switched on (RA-1132 Phase 1).
 * Defaults OFF; only an explicit truthy env value opens it. Client-readable, so
 * it is a NEXT_PUBLIC_ variable (inlined at build time).
 *
 * This is a RELEASE control, not an entitlement: /api/live-teacher/turn still
 * enforces the subscription gate and BYOK Anthropic key server-side. Both the
 * flag and those server gates must be open before a technician reaches a turn.
 */
export function isLiveTeacherEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_LIVE_TEACHER,
): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}
