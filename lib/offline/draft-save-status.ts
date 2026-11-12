/**
 * RA-8330: tell the visible sync badge whether the last draft save on this
 * page wrote everything. The badge otherwise reads only the offline queue,
 * which a draft save does not use, and showed "Synced" after a failed save.
 */
export const DRAFT_SAVE_STATUS_EVENT = "restoreassist-draft-save-status";

export interface DraftSaveStatusDetail {
  ok: boolean;
}

export function reportDraftSave(ok: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DraftSaveStatusDetail>(DRAFT_SAVE_STATUS_EVENT, {
      detail: { ok },
    }),
  );
}
