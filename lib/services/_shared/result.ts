/**
 * Discriminated-union result type for service modules.
 *
 * Service modules in lib/services/** never throw for expected outcomes —
 * they return ServiceResult so the orchestration layer can map reasons to
 * HTTP status codes, audit events, and retry policy.
 *
 * Throws are reserved for truly unexpected errors (bugs, infra outages
 * that bypass our retry envelope).
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */
export type ServiceResult<T, E extends string = string> =
  | { ok: true; data: T }
  | { ok: false; reason: E; detail?: string; retryAfterMs?: number };

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function fail<E extends string>(
  reason: E,
  extras?: { detail?: string; retryAfterMs?: number },
): { ok: false; reason: E; detail?: string; retryAfterMs?: number } {
  return { ok: false, reason, ...extras };
}
