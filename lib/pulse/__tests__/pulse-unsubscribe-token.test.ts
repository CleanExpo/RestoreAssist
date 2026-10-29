import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPulseUnsubscribeUrl,
  generatePulseUnsubscribeToken,
  verifyPulseUnsubscribeToken,
} from "../pulse-unsubscribe-token";

beforeEach(() => {
  process.env.PORTAL_SECRET = "test-portal-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
});

describe("pulse unsubscribe token", () => {
  it("round-trips client id", () => {
    const token = generatePulseUnsubscribeToken("client_abc");
    expect(verifyPulseUnsubscribeToken(token)).toBe("client_abc");
  });

  it("rejects tampered tokens", () => {
    const token = generatePulseUnsubscribeToken("client_abc");
    const tampered = `${token.slice(0, -4)}aaaa`;
    expect(verifyPulseUnsubscribeToken(tampered)).toBeNull();
  });

  it("builds an app unsubscribe URL", () => {
    const url = buildPulseUnsubscribeUrl("client_abc");
    expect(url).toMatch(/^https:\/\/app\.example\.com\/pulse\/unsubscribe\?token=/);
    const token = new URL(url).searchParams.get("token");
    expect(token && verifyPulseUnsubscribeToken(token)).toBe("client_abc");
  });
});
