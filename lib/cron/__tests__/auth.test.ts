import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/server so this stays a pure unit test of the auth logic (NextResponse
// is the only runtime value verifyCronAuth uses from it).
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
    }),
  },
}));

import { verifyCronAuth } from "../auth";

// verifyCronAuth only reads request.headers.get("authorization").
const reqWith = (authorization: string | null) =>
  ({
    headers: {
      get: (k: string) => (k === "authorization" ? authorization : null),
    },
  }) as never;

describe("verifyCronAuth (RA-6679 fail-closed)", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    delete process.env.CRON_SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("fails CLOSED when CRON_SECRET is unset — even with `Bearer ` (the old bypass)", () => {
    delete process.env.CRON_SECRET;
    const res = verifyCronAuth(reqWith("Bearer "));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("fails closed when CRON_SECRET is empty string", () => {
    process.env.CRON_SECRET = "";
    expect(verifyCronAuth(reqWith("Bearer "))!.status).toBe(401);
  });

  it("rejects a wrong token when the secret is set", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(verifyCronAuth(reqWith("Bearer wrong"))!.status).toBe(401);
  });

  it("passes (returns null) with the correct Bearer token", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(verifyCronAuth(reqWith("Bearer s3cret"))).toBeNull();
  });
});
