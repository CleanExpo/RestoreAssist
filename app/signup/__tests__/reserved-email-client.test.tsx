// @vitest-environment jsdom
/**
 * RA-8156 — signup form rejects reserved email before network.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reservedEmailSignUpMessage } from "@/lib/auth/reserved-email-user-message";

describe("signup reserved email client guard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reserved helper blocks .test before fetch", () => {
    const msg = reservedEmailSignUpMessage("owner@firm.test");
    expect(msg).toMatch(/reserved|cannot/i);
  });

  it("does not block real domains", () => {
    expect(reservedEmailSignUpMessage("owner@acme.com.au")).toBeNull();
  });
});
