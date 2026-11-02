import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  applyRateLimit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { client: { findUnique: h.findUnique, updateMany: h.updateMany } },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: h.applyRateLimit }));

import { generatePulseUnsubscribeToken } from "@/lib/pulse/pulse-unsubscribe-token";
import { POST } from "../route";

function request(token: string | null, body?: BodyInit, type?: string) {
  const url = new URL("https://app.example.test/api/pulse/unsubscribe");
  if (token) url.searchParams.set("token", token);
  return new NextRequest(url, {
    method: "POST",
    body,
    headers: type ? { "Content-Type": type } : undefined,
  });
}

const FORM = "application/x-www-form-urlencoded";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PORTAL_SECRET = "test-secret";
  h.applyRateLimit.mockResolvedValue(null);
  h.findUnique.mockResolvedValue({
    id: "client_a",
    userId: "owner_1",
    email: "Homeowner@example.test",
  });
  h.updateMany.mockResolvedValue({ count: 2 });
});

describe("POST /api/pulse/unsubscribe", () => {
  it("opts out every record of the address in this business only", async () => {
    const res = await POST(
      request(
        generatePulseUnsubscribeToken("client_a"),
        "List-Unsubscribe=One-Click",
        FORM,
      ),
    );

    expect(res.status).toBe(200);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "owner_1",
        email: { equals: "Homeowner@example.test", mode: "insensitive" },
      },
      data: { pulseOptOut: true },
    });
  });

  it("opts out the one record when it holds no address", async () => {
    h.findUnique.mockResolvedValue({
      id: "client_a",
      userId: "owner_1",
      email: null,
    });

    await POST(request(generatePulseUnsubscribeToken("client_a")));

    expect(h.updateMany.mock.calls[0][0].where).toEqual({ id: "client_a" });
  });

  it("sends the page's button back to the confirmation", async () => {
    const res = await POST(
      request(generatePulseUnsubscribeToken("client_a"), "source=page", FORM),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/pulse/unsubscribe?done=1");
    expect(h.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not confirm when the record no longer exists", async () => {
    h.findUnique.mockResolvedValue(null);

    const res = await POST(request(generatePulseUnsubscribeToken("client_a")));

    expect(res.status).toBe(404);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a forged token and writes nothing", async () => {
    const res = await POST(request("forged-token"));

    expect(res.status).toBe(400);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a token signed with another secret", async () => {
    const token = generatePulseUnsubscribeToken("client_a");
    process.env.PORTAL_SECRET = "a-different-secret";

    const res = await POST(request(token));

    expect(res.status).toBe(400);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("refuses rather than crashes when the secret is unset", async () => {
    const token = generatePulseUnsubscribeToken("client_a");
    delete process.env.PORTAL_SECRET;
    delete process.env.CLIENT_PORTAL_JWT_SECRET;

    const res = await POST(request(token));

    expect(res.status).toBe(400);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("stops at the rate limit, before any write", async () => {
    h.applyRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: "slow down" }, { status: 429 }),
    );

    const res = await POST(request(generatePulseUnsubscribeToken("client_a")));

    expect(res.status).toBe(429);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("limits by address and by token, and keys on a hash of the token", async () => {
    const token = generatePulseUnsubscribeToken("client_a");

    await POST(request(token));

    const calls = h.applyRateLimit.mock.calls.map((c) => c[1]);
    expect(calls.map((c) => c.prefix)).toEqual([
      "pulse-unsubscribe-ip",
      "pulse-unsubscribe-token",
    ]);
    expect(calls[1].key).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[1].key).not.toContain(token);
  });

  it("never logs the token", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const token = generatePulseUnsubscribeToken("client_a");

    await POST(request(token));

    expect(info).toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain(token);
    info.mockRestore();
  });
});
