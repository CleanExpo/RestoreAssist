export const INVOICE_SYNC_FAILURE_MESSAGE =
  "Invoice sync failed. Check the integration connection and try again.";

export function getSyncErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unknown sync error";
}
