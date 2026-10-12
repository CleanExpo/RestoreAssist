/**
 * Client-side helpers for the job controls on the inspection detail page.
 *
 * Client-safe: no server-only imports. The API routes stay the authority;
 * these only decide what the page offers and how a refusal is shown.
 */
import { apiErrorMessage } from "@/lib/api-error-message";

/**
 * D-028: the assigned technician creates and updates field data on the job;
 * the dispute pack, deleting readings and the client progress-update toggle
 * stay with the job owner and with managers and admins. A role USER caller
 * keeps these controls only on a job they own (a solo technician). An unknown
 * role or owner hides them until both are known.
 */
export function canUseOwnerJobActions(input: {
  role: string | null | undefined;
  callerId: string | null | undefined;
  ownerId: string | null | undefined;
}): boolean {
  const { role, callerId, ownerId } = input;
  if (role === "ADMIN" || role === "MANAGER") return true;
  if (role !== "USER") return false;
  return Boolean(callerId) && callerId === ownerId;
}

/**
 * The message to show for a failed fetch. Reads the structured envelope
 * (`{ error: { code, message } }`) and the legacy `{ error: "..." }` shape, so
 * an object is never rendered as "[object Object]"; a body that is not JSON
 * falls back to `fallback`.
 */
export async function failedResponseMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  return apiErrorMessage(body) ?? fallback;
}
