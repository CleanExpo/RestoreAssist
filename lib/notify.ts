/**
 * Single-surface toast helpers for user-facing feedback.
 *
 * Why this exists: after the RA-1548 apiError envelope, many call sites still
 * do `toast.error(data.error)`. That object used to crash React; SafeToaster
 * now renders it, but handlers that then call `data.error.includes(...)` throw,
 * and the surrounding `catch` fires a second generic toast. Users see two
 * toasts for one failure.
 *
 * Rules:
 *   - Always coerce through toastDisplayMessage (never pass raw objects)
 *   - Use a stable `id` so a second error for the same action replaces the
 *     first instead of stacking
 *   - Prefer notifyError once; do not also toast in catch after a handled
 *     !response.ok branch
 */
import toast from "react-hot-toast";
import { toastDisplayMessage } from "@/lib/api-error-message";

const ERROR_TOAST_ID = "ra-app-error";
const SUCCESS_TOAST_ID = "ra-app-success";

export function notifyError(
  message: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const text = toastDisplayMessage(message, fallback);
  toast.error(text, { id: ERROR_TOAST_ID });
  return text;
}

export function notifySuccess(message: string): void {
  toast.success(message, { id: SUCCESS_TOAST_ID });
}
