export const INVOICE_SYNC_FAILURE_MESSAGE =
  "Invoice sync failed. Check the integration connection and try again.";
export const INTEGRATION_IMPORT_FAILURE_MESSAGE = "Import failed";

export function getSyncErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unknown sync error";
}
