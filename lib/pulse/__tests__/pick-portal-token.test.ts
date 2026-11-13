import { describe, expect, it } from "vitest";
import { pickPortalToken, type PulsePortalAccount } from "../pick-portal-token";

const acct = (token: string, inspectionId: string | null, day: number): PulsePortalAccount => ({
  token,
  inspectionId,
  createdAt: new Date(Date.UTC(2026, 9, day)),
});

// Newest first, as the dispatcher fetches them.
describe("pickPortalToken (WP-02)", () => {
  it("an email about job A carries A's link even when B's link is newer", () => {
    const accounts = [acct("tok-B", "B", 10), acct("tok-A", "A", 1)];
    expect(pickPortalToken(accounts, "A")).toBe("tok-A");
  });

  it("falls back to a link issued before binding (no job recorded)", () => {
    const accounts = [acct("tok-B", "B", 10), acct("tok-legacy", null, 1)];
    expect(pickPortalToken(accounts, "A")).toBe("tok-legacy");
  });

  it("never uses another job's link when nothing fits", () => {
    expect(pickPortalToken([acct("tok-B", "B", 10)], "A")).toBeNull();
  });

  it("prefers the bound link over a newer legacy one", () => {
    const accounts = [acct("tok-legacy", null, 10), acct("tok-A", "A", 1)];
    expect(pickPortalToken(accounts, "A")).toBe("tok-A");
  });
});
