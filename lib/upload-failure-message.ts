import { apiErrorMessage } from "@/lib/api-error-message";

/**
 * RA-8603: the user-facing message for a failed upload response. A failed
 * reply may not be JSON (a hosting "body too large" page, a proxy error), so
 * the body is read as text and parsed defensively; anything unreadable falls
 * back to `fallback` instead of throwing a parse error that hides the failure.
 */
export async function uploadFailureMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return fallback;
  }
  try {
    return apiErrorMessage(JSON.parse(text)) ?? fallback;
  } catch {
    return fallback;
  }
}
