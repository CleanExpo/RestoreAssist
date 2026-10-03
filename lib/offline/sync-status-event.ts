/** Wake the visible sync badge after a queue changes on this page. */
export const SYNC_QUEUE_CHANGED_EVENT = "restoreassist-sync-queue-changed";
let pending: ReturnType<typeof setTimeout> | null = null;

export function notifySyncQueueChanged(): void {
  if (typeof window === "undefined" || pending) return;
  pending = setTimeout(() => {
    pending = null;
    // The page (or a test's jsdom) can be torn down while this timer waits.
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(SYNC_QUEUE_CHANGED_EVENT));
  }, 50);
}
