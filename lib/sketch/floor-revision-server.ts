/**
 * RA-8056 — the stored floor's revision: a SHA-256 of its drawing
 * (`ClaimSketch.sketchData`), keys sorted so Postgres JSONB key order never
 * changes it. The server's own record of Vision room ids is left out: the
 * import route writes it without changing any room, and that write must not
 * make the editor refuse its own next save. Every other change to the
 * drawing (rooms, walls, pins in the blob, field-complete) is a new revision.
 *
 * Server only (node:crypto). The editor treats the value as opaque.
 */
import { createHash } from "node:crypto";
import { stableStringify } from "@/lib/sketch/roomplan-custody-queue";
import { SKETCH_META_KEY } from "@/lib/sketch/sketch-field-status";

function withoutServerRoomMemory(sketchData: unknown): unknown {
  if (!sketchData || typeof sketchData !== "object" || Array.isArray(sketchData)) {
    return sketchData ?? null;
  }
  const root = sketchData as Record<string, unknown>;
  const meta = root[SKETCH_META_KEY];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return root;
  const { aiSuggestedRoomIds: _serverMemory, ...rest } = meta as Record<
    string,
    unknown
  >;
  const { [SKETCH_META_KEY]: _meta, ...withoutMeta } = root;
  // A meta object that held only the room memory hashes as no meta at all,
  // so recording Vision ids on a floor without meta changes nothing.
  return Object.keys(rest).length > 0
    ? { ...withoutMeta, [SKETCH_META_KEY]: rest }
    : withoutMeta;
}

export function floorRevisionOf(sketchData: unknown): string {
  return createHash("sha256")
    .update(stableStringify(withoutServerRoomMemory(sketchData)))
    .digest("hex");
}
