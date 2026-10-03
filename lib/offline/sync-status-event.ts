/** Wake the visible sync badge after a queue changes on this page. */
export const SYNC_QUEUE_CHANGED_EVENT = "restoreassist-sync-queue-changed";
let pending: ReturnType<typeof setTimeout> | null = null;

export function notifySyncQueueChanged(): void {
  if (typeof window === "undefined" || pending) return;
  pending = setTimeout(() => {
    pending = null;
    // The page (or a test environment) can be gone by the time this fires.
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(SYNC_QUEUE_CHANGED_EVENT));
  }, 50);
}
