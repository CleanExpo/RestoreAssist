/**
 * RA-8330: tell the visible sync badge whether a draft save wrote everything.
 * The badge otherwise reads only the offline queue, which a draft save does
 * not use, and showed "Synced" after a failed save.
 *
 * RA-8358: the outcome belongs to one inspection. Every report names the
 * draft it is for, so a later success on a different inspection cannot clear
 * a failure that is still unsaved.
 *
 * RA-8360: every report also names the account that pressed Save Draft, so a
 * failure that lands after sign-out is not shown to the next account.
 *
 * Only the badge state lives here. The unsaved draft itself stays in the form.
 */
export const DRAFT_SAVE_STATUS_EVENT = "restoreassist-draft-save-status";
export const ACTIVE_DRAFT_EVENT = "restoreassist-active-draft";

/** Which draft a save or a screen is about. */
export interface DraftRef {
  /** The saved inspection, once it exists. */
  inspectionId: string | null;
  /**
   * One form on screen. Used only while the draft has no inspection yet, so a
   * failure before the inspection was created still has an owner.
   */
  formKey: string;
}

export interface DraftSaveStatusDetail extends DraftRef {
  ok: boolean;
  /** The signed-in user who made the save, when known. */
  userId: string | null;
}

/** The key one draft's badge state is stored under. */
export function draftKey(draft: DraftRef): string {
  return draft.inspectionId ?? `form:${draft.formKey}`;
}

/** True when `entry` is the draft `ref` points at. */
export function isSameDraft(entry: DraftRef, ref: DraftRef): boolean {
  if (entry.inspectionId && entry.inspectionId === ref.inspectionId) return true;
  // A failure from before the inspection existed belongs to the form that made it.
  return entry.inspectionId === null && entry.formKey === ref.formKey;
}

/**
 * The one owner of the badge outcome for a Save Draft press. The attempt
 * returns true only when everything saved. Any other exit (an early return
 * that forgot a value, a validation stop, a thrown error) reports a failed
 * save, so no exit path can leave the badge on "Synced" by omission.
 *
 * `draft` is read after the attempt, so a save that created the inspection
 * reports under the new inspection id. `userId` is read before the attempt:
 * the save was made as that account even if the session changes meanwhile.
 */
export async function trackDraftSave(
  attempt: () => Promise<boolean | void>,
  draft: () => DraftRef,
  userId: string | null,
): Promise<boolean> {
  let ok = false;
  try {
    ok = (await attempt()) === true;
  } catch {
    ok = false;
  } finally {
    reportDraftSave(ok, draft(), userId);
  }
  return ok;
}

export function reportDraftSave(ok: boolean, draft: DraftRef, userId: string | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DraftSaveStatusDetail>(DRAFT_SAVE_STATUS_EVENT, {
      detail: { ok, inspectionId: draft.inspectionId, formKey: draft.formKey, userId },
    }),
  );
}

// ─── The draft on screen ──────────────────────────────────────────────────────
// Kept at module level as well as sent as an event: a form mounts (and runs its
// effects) before the provider above it subscribes, so the provider reads the
// current value when it subscribes.

let activeDraft: DraftRef | null = null;

export function getActiveDraft(): DraftRef | null {
  return activeDraft;
}

/** A form announces the draft it shows; pass null when it leaves the screen. */
export function setActiveDraft(draft: DraftRef | null): void {
  activeDraft = draft;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DraftRef | null>(ACTIVE_DRAFT_EVENT, { detail: draft }));
}

/** Clear only if `formKey` still owns the active draft (another form may have mounted). */
export function clearActiveDraft(formKey: string): void {
  if (activeDraft?.formKey === formKey) setActiveDraft(null);
}
