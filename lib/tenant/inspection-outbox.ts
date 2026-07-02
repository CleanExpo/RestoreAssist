/**
 * One-way sync outbox for the tenant-DB read-shadow pilot.
 *
 * Each material `Inspection` write emits an outbox entry that the sync worker
 * replays into the workspace's tenant DB. The entry is keyed by inspection id +
 * version (its `updatedAt`), so re-emitting the same state — a retry, a duplicate
 * event — dedupes to a single tenant write. Pure + store-injected so idempotency
 * is unit-testable; production passes a durable store (a `has/add` over a table).
 */
export type OutboxOp = "upsert" | "delete";

export interface OutboxEntry {
  workspaceId: string;
  inspectionId: string;
  op: OutboxOp;
  /** Idempotency key: `${id}:${updatedAt}` for upsert, `${id}:delete` for delete. */
  dedupeKey: string;
  /** Row snapshot to replicate on upsert; null on delete. */
  payload: Record<string, unknown> | null;
}

interface InspectionInput extends Record<string, unknown> {
  id: string;
  updatedAt: Date | string;
}

function versionOf(updatedAt: Date | string): string {
  return updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt);
}

export function buildInspectionOutboxEntry(input: {
  workspaceId: string;
  inspection: InspectionInput;
  op?: OutboxOp;
}): OutboxEntry {
  const op = input.op ?? "upsert";
  const { id } = input.inspection;
  return {
    workspaceId: input.workspaceId,
    inspectionId: id,
    op,
    dedupeKey:
      op === "delete" ? `${id}:delete` : `${id}:${versionOf(input.inspection.updatedAt)}`,
    payload: op === "delete" ? null : { ...input.inspection },
  };
}

/** Minimal dedupe store — a Set satisfies it; production backs it with a table. */
export interface DedupeStore {
  has(key: string): boolean;
  add(key: string): unknown;
}

/** Record the entry; returns false (no-op) if its dedupeKey was already seen. */
export function recordOutbox(entry: OutboxEntry, store: DedupeStore): boolean {
  if (store.has(entry.dedupeKey)) return false;
  store.add(entry.dedupeKey);
  return true;
}
