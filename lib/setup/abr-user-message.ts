/** Map ABR job error codes to owner-facing setup copy (RA-P1-7). */
export function abrHydrationUserMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "CONFIG_ERROR":
      return "Australian Business Register lookup is not configured on this environment. Enter your details manually and contact support if this persists.";
    case "MALFORMED":
      return "That ABN did not pass validation. Check the number and try again.";
    case "NOT_FOUND":
      return "No active business was found for that ABN. Check the number or enter details manually.";
    case "UPSTREAM_ERROR":
      return "We couldn't reach the Business Register right now. Enter your details manually and we'll retry in the background.";
    default:
      return "We couldn't complete the Business Register lookup. Enter your details manually.";
  }
}
