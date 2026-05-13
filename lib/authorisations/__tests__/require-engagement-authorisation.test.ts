import { describe, expect, it, beforeEach, vi } from "vitest";
import { needsModal, AUTHORISATION_MAX_AGE_DAYS } from "../require-engagement-authorisation";

describe("needsModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  });

  it("returns 'fresh' when no prior Authorisation exists", () => {
    expect(needsModal(null)).toBe("fresh");
  });

  it("returns 'prefilled' when an Authorisation exists within MAX_AGE", () => {
    const verifiedAt = new Date("2026-05-25T00:00:00Z"); // 7 days ago
    expect(needsModal({ verifiedAt } as any)).toBe("prefilled");
  });

  it("returns 'fresh' when an Authorisation exists but is older than MAX_AGE", () => {
    const verifiedAt = new Date(
      Date.now() - (AUTHORISATION_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000,
    );
    expect(needsModal({ verifiedAt } as any)).toBe("fresh");
  });

  it("returns 'prefilled' at exactly MAX_AGE - 1 second", () => {
    const verifiedAt = new Date(
      Date.now() - AUTHORISATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 + 1000,
    );
    expect(needsModal({ verifiedAt } as any)).toBe("prefilled");
  });
});
