import { describe, expect, it } from "vitest";
import {
  getSyncErrorMessage,
  INTEGRATION_IMPORT_FAILURE_MESSAGE,
  INVOICE_SYNC_FAILURE_MESSAGE,
} from "../sync-error";

describe("sync error helpers", () => {
  it("provides a generic invoice sync failure message for clients", () => {
    expect(INVOICE_SYNC_FAILURE_MESSAGE).toBe(
      "Invoice sync failed. Check the integration connection and try again.",
    );
  });

  it("provides a generic per-record import failure message for clients", () => {
    expect(INTEGRATION_IMPORT_FAILURE_MESSAGE).toBe("Import failed");
  });

  it("extracts internal error messages for logs only", () => {
    expect(getSyncErrorMessage(new Error("provider exploded"))).toBe(
      "provider exploded",
    );
    expect(getSyncErrorMessage("raw string")).toBe("Unknown sync error");
  });
});
