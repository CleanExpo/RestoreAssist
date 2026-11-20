/**
 * Shared `?since=` / ISO query parsing for ops and automation routes.
 */

export type ParseIsoQueryResult =
  | { ok: true; value: Date | null }
  | { ok: false; reason: string };

export function parseIsoQueryParam(
  raw: string | null,
  paramName = "since",
): ParseIsoQueryResult {
  if (raw == null || raw.trim() === "") {
    return { ok: true, value: null };
  }
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) {
    return { ok: false, reason: `Invalid ${paramName} — use an ISO-8601 timestamp` };
  }
  return { ok: true, value: d };
}