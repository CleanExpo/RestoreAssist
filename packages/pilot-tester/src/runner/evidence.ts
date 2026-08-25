import { createHash } from "node:crypto";

/**
 * Stable JSON is used only for evidence binding. Object key insertion order is
 * not allowed to change a digest, while array order remains significant.
 */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
