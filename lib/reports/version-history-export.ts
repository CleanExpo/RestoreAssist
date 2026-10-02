/** Keep invalidated source snapshots in the owner's audit trail, not in exports. */
export function versionHistoryForExport(history: unknown[]): unknown[] {
  return history.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const { invalidatedDraftSnapshot: _privateSnapshot, ...publicEntry } = entry as Record<string, unknown>;
    return publicEntry;
  });
}
