/**
 * RA-8330: tell the visible sync badge whether the last draft save on this
 * page wrote everything. The badge otherwise reads only the offline queue,
 * which a draft save does not use, and showed "Synced" after a failed save.
 */
export const DRAFT_SAVE_STATUS_EVENT = "restoreassist-draft-save-status";

export interface DraftSaveStatusDetail {
  ok: boolean;
}

/**
 * The one owner of the badge outcome for a Save Draft press. The attempt
 * returns true only when everything saved. Any other exit (an early return
 * that forgot a value, a validation stop, a thrown error) reports a failed
 * save, so no exit path can leave the badge on "Synced" by omission.
 */
export async function trackDraftSave(
  attempt: () => Promise<boolean | void>,
): Promise<boolean> {
  let ok = false;
  try {
    ok = (await attempt()) === true;
  } catch {
    ok = false;
  } finally {
    reportDraftSave(ok);
  }
  return ok;
}

export function reportDraftSave(ok: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DraftSaveStatusDetail>(DRAFT_SAVE_STATUS_EVENT, {
      detail: { ok },
    }),
  );
}
