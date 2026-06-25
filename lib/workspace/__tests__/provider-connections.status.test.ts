import { describe, it, expect } from "vitest";
import { CONNECTION_FAILED_STATUS } from "../provider-connections";
describe("ProviderConnection failure status", () => {
  it("uses a schema-valid enum member", () => {
    expect(CONNECTION_FAILED_STATUS).toBe("FAILED");
  });
});
