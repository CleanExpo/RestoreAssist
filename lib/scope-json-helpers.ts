/**
 * RA-1366 — versioned JSON blob helpers for Scope.siteVariables +
 * Scope.equipmentParameters.
 *
 * Problem: the two columns are `String? @db.Text` containing JSON.
 * Readers across the app parse them raw; if we ever change the shape
 * (add a required field, rename one), the existing rows become silent
 * landmines — readers get `undefined` for fields that have moved.
 *
 * Strategy: lazy upgrade.
 * - Readers tolerate missing `_v` (treat as v0 — trust the current
 *   shape of existing rows). They attach `_v: 1` in-memory so callers
 *   never see an un-versioned object.
 * - Writers always emit `_v: 1`.
 * - Future v2: bump writers to `_v: 2` AND add a v0/v1 → v2 upgrader
 *   inside the parse helper. No data migration required at that point.
 *
 * The two shapes are semantically independent but the wire-format
 * concerns are identical, so we share a generic helper.
 */

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Parse a stored JSON blob and ensure it carries `_v`. Null input →
 * null output. Parse errors are swallowed (returns null) — callers
 * that need to distinguish "missing" vs "malformed" should check
 * the raw column themselves and only then call this.
 *
 * Generic on the stored shape; caller supplies `T` as the expected
 * record type.
 */
export function parseVersionedScopeJson<T extends Record<string, unknown>>(
  raw: string | null | undefined,
): (T & { _v: number }) | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as T | (T & { _v?: number });
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as T & { _v?: number };
    // Default missing `_v` to 0 — "pre-versioning, trust the live shape".
    const version = typeof record._v === "number" ? record._v : 0;
    return { ...record, _v: version } as T & { _v: number };
  } catch {
    return null;
  }
}

/**
 * Serialise a versioned JSON blob for storage. Injects
 * `_v: CURRENT_SCHEMA_VERSION` into the payload so every row ever
 * written from this point forward is self-describing.
 *
 * Caller can pass an object WITH or WITHOUT `_v` — we always overwrite
 * with the current constant to guarantee consistency.
 */
export function serializeVersionedScopeJson<T extends Record<string, unknown>>(
  value: T | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const withVersion = { ...value, _v: CURRENT_SCHEMA_VERSION };
  return JSON.stringify(withVersion);
}

// ── Domain aliases for readability at call sites ─────────────────────────────

/**
 * `siteVariables` shape (as of v1): site conditions + environmental
 * measurements the estimator / scoping engine consumes. Open-ended
 * intentionally — individual consumers know which keys they care about.
 */
export interface SiteVariables extends Record<string, unknown> {
  affectedAreaM2?: number;
  s760ChecklistCompleted?: boolean;
  // other keys vary by scope type (WATER, MOULD, ASBESTOS, etc.)
}

/** `equipmentParameters` shape (as of v1): equipment sizing inputs. */
export interface EquipmentParameters extends Record<string, unknown> {
  labourMinutes?: number;
  equipmentDays?: number;
  // other keys vary by equipment type
}

export const parseSiteVariables = (raw: string | null | undefined) =>
  parseVersionedScopeJson<SiteVariables>(raw);

export const parseEquipmentParameters = (raw: string | null | undefined) =>
  parseVersionedScopeJson<EquipmentParameters>(raw);

export const serializeSiteVariables = (v: SiteVariables | null | undefined) =>
  serializeVersionedScopeJson<SiteVariables>(v);

export const serializeEquipmentParameters = (
  v: EquipmentParameters | null | undefined,
) => serializeVersionedScopeJson<EquipmentParameters>(v);
