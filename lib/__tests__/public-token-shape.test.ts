import { describe, expect, it } from "vitest";
import {
  isPortalInvitationToken,
  isUserInviteToken,
} from "../public-token-shape";

describe("public token shape helpers", () => {
  it("accepts 24-byte hex user invite tokens", () => {
    expect(isUserInviteToken("a".repeat(48))).toBe(true);
  });

  it("rejects malformed user invite tokens", () => {
    expect(isUserInviteToken("a".repeat(47))).toBe(false);
    expect(isUserInviteToken("g".repeat(48))).toBe(false);
    expect(isUserInviteToken("../not-a-token")).toBe(false);
  });

  it("accepts Prisma cuid portal invitation tokens", () => {
    expect(isPortalInvitationToken("clw7w0e9u000008l6f2n3qx9z")).toBe(true);
  });

  it("rejects malformed portal invitation tokens", () => {
    expect(isPortalInvitationToken("lw7w0e9u000008l6f2n3qx9z")).toBe(false);
    expect(isPortalInvitationToken("c".repeat(24))).toBe(false);
    expect(isPortalInvitationToken("c../../etc/passwd0000000")).toBe(false);
  });
});
