import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPulseOneClickUnsubscribeUrl,
  buildPulseUnsubscribeUrl,
  generatePulseUnsubscribeToken,
  readPulseUnsubscribeToken,
  pulseAddressTag,
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

  it("binds a token to the address it was sent to", () => {
    const token = generatePulseUnsubscribeToken("client_abc", " Home@Example.test ");
    expect(readPulseUnsubscribeToken(token)).toEqual({
      clientId: "client_abc",
      addressTag: pulseAddressTag("home@example.test"),
      organizationId: null,
    });
    expect(pulseAddressTag("other@example.test")).not.toBe(
      pulseAddressTag("home@example.test"),
    );
    expect(token).not.toContain(Buffer.from("home@example.test").toString("base64"));
  });

  it("still reads a link already in an inbox, with no address tag", () => {
    const token = generatePulseUnsubscribeToken("client_abc");
    expect(readPulseUnsubscribeToken(token)).toEqual({
      clientId: "client_abc",
      addressTag: null,
      organizationId: null,
    });
  });

  it("refuses a bound token with its address tag changed", () => {
    const token = generatePulseUnsubscribeToken("client_abc", "home@example.test");
    const parts = Buffer.from(token, "base64url").toString("utf8").split(":");
    parts[2] = pulseAddressTag("other@example.test");
    const forged = Buffer.from(parts.join(":")).toString("base64url");
    expect(readPulseUnsubscribeToken(forged)).toBeNull();
  });

  it("refuses a bound signature reused without its tag", () => {
    const token = generatePulseUnsubscribeToken("client_abc", "home@example.test");
    const parts = Buffer.from(token, "base64url").toString("utf8").split(":");
    const forged = Buffer.from([parts[0], parts[1], parts[3]].join(":")).toString("base64url");
    expect(readPulseUnsubscribeToken(forged)).toBeNull();
  });

  it("binds a token to the organisation the job belonged to", () => {
    const token = generatePulseUnsubscribeToken(
      "client_abc",
      "home@example.test",
      "org_1",
    );
    expect(readPulseUnsubscribeToken(token)).toEqual({
      clientId: "client_abc",
      addressTag: pulseAddressTag("home@example.test"),
      organizationId: "org_1",
    });
  });

  it("refuses an organisation-bound token with its org changed", () => {
    const token = generatePulseUnsubscribeToken(
      "client_abc",
      "home@example.test",
      "org_1",
    );
    const parts = Buffer.from(token, "base64url").toString("utf8").split(":");
    parts[3] = "org_other";
    const forged = Buffer.from(parts.join(":")).toString("base64url");
    expect(readPulseUnsubscribeToken(forged)).toBeNull();
  });

  it("builds an app unsubscribe URL", () => {
    const url = buildPulseUnsubscribeUrl("client_abc", "home@example.test");
    expect(url).toMatch(/^https:\/\/app\.example\.com\/pulse\/unsubscribe\?token=/);
    const token = new URL(url).searchParams.get("token");
    expect(token && verifyPulseUnsubscribeToken(token)).toBe("client_abc");
  });

  it.each(["", "/relative", "http://app.example.com", "not a url"])(
    "refuses to build either link from the app URL %j",
    (value) => {
      process.env.NEXT_PUBLIC_APP_URL = value;
      expect(() => buildPulseUnsubscribeUrl("client_abc", "h@example.test")).toThrow(/https/);
      expect(() => buildPulseOneClickUnsubscribeUrl("client_abc", "h@example.test")).toThrow(/https/);
    },
  );
});
