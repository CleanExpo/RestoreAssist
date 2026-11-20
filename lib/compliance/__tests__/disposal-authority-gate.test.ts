import { describe, it, expect } from "vitest";
import {
  scopeItemRequiresDisposalAuthority,
  DISPOSAL_AUTHORITY_AUDIT_ACTION,
} from "../disposal-authority-gate";

describe("disposal-authority-gate", () => {
  it("detects disposal scope item types", () => {
    expect(scopeItemRequiresDisposalAuthority("remove_carpet")).toBe(true);
    expect(scopeItemRequiresDisposalAuthority("install_dehumidification")).toBe(
      false,
    );
  });

  it("uses a stable audit action constant", () => {
    expect(DISPOSAL_AUTHORITY_AUDIT_ACTION).toBe("DISPOSAL_AUTHORITY_RECORDED");
  });
});
