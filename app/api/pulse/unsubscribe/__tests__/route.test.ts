import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  applyRateLimit: vi.fn(),
  memberIds: vi.fn(),
  recordLock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: {
      findUnique: h.findUnique,
      findMany: h.findMany,
      updateMany: h.updateMany,
    },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: h.applyRateLimit }));
vi.mock("@/lib/pulse/opt-out", () => ({
  pulseOrganisationMemberIds: (...args: unknown[]) => h.memberIds(...args),
  recordPulseAddressLock: (...args: unknown[]) => h.recordLock(...args),
}));

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
  h.memberIds.mockResolvedValue([]);
  h.recordLock.mockResolvedValue({ organizationId: null, addressTag: null });
});

describe("POST /api/pulse/unsubscribe", () => {
  it("an unpinned two-org owner link does not lock the oldest owned organisation", async () => {
    const token = generatePulseUnsubscribeToken(
      "client_a",
      "homeowner@example.test",
      null,
    );

    const res = await POST(request(token, "List-Unsubscribe=One-Click", FORM));

    expect(res.status).toBe(200);
    expect(h.recordLock).not.toHaveBeenCalled();
    expect(h.memberIds).not.toHaveBeenCalled();
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: "client_a", userId: "owner_1" },
      data: { pulseOptOut: true },
    });
  });

  it("an unbound link opts out only the named person, not the live address", async () => {
    const res = await POST(
      request(
        generatePulseUnsubscribeToken("client_a"),
        "List-Unsubscribe=One-Click",
        FORM,
      ),
    );

    expect(res.status).toBe(200);
    expect(h.updateMany).toHaveBeenCalledTimes(1);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: "client_a", userId: "owner_1" },
      data: { pulseOptOut: true },
    });
    expect(h.recordLock).not.toHaveBeenCalled();
    expect(h.memberIds).not.toHaveBeenCalled();
  });

  it("accepts a bound link when the record still holds that address", async () => {
    const res = await POST(
      request(
        generatePulseUnsubscribeToken("client_a", "homeowner@example.test"),
      ),
    );

    expect(res.status).toBe(200);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: "client_a", userId: "owner_1" },
      data: { pulseOptOut: true },
    });
    expect(h.updateMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ["owner_1"] },
        email: { equals: "Homeowner@example.test", mode: "insensitive" },
      },
      data: { pulseOptOut: true },
    });
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.recordLock).not.toHaveBeenCalled();
  });

  it("locks the token's organisation, not the owner's live firm", async () => {
    h.memberIds.mockResolvedValue(["owner_1", "staff_b"]);

    const res = await POST(
      request(
        generatePulseUnsubscribeToken(
          "client_a",
          "homeowner@example.test",
          "org_sent",
        ),
      ),
    );

    expect(res.status).toBe(200);
    expect(h.memberIds).toHaveBeenCalledWith("org_sent");
    expect(h.recordLock).toHaveBeenCalledWith({
      ownerUserId: "owner_1",
      addressTag: expect.any(String),
      sourceClientId: "client_a",
      organizationId: "org_sent",
    });
  });

  describe("a bound link after the record's address changed", () => {
    const stale = () =>
      generatePulseUnsubscribeToken("client_a", "old@example.test");

    beforeEach(() => {
      h.findUnique.mockResolvedValue({
        id: "client_a",
        userId: "owner_1",
        email: "replacement@example.test",
      });
    });

    it("never opts out the replacement address", async () => {
      h.findMany.mockResolvedValue([
        { id: "client_a", email: "replacement@example.test" },
      ]);

      const res = await POST(request(stale()));

      expect(res.status).toBe(200);
      expect(h.updateMany).toHaveBeenCalledTimes(1);
      expect(h.updateMany).toHaveBeenCalledWith({
        where: { id: "client_a", userId: "owner_1" },
        data: { pulseOptOut: true },
      });
      expect(h.recordLock).not.toHaveBeenCalled();
    });

    it("still opts out other records in this business holding the old address", async () => {
      h.findMany.mockResolvedValue([
        { id: "client_a", email: "replacement@example.test" },
        { id: "client_b", email: "OLD@example.test" },
      ]);

      await POST(request(stale()));

      expect(h.findMany.mock.calls[0][0].where.userId).toEqual({
        in: ["owner_1"],
      });
      expect(h.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["client_b"] }, userId: { in: ["owner_1"] } },
        data: { pulseOptOut: true },
      });
    });
  });

  it("opts out the one record when it holds no address", async () => {
    h.findUnique.mockResolvedValue({
      id: "client_a",
      userId: "owner_1",
      email: null,
    });

    await POST(request(generatePulseUnsubscribeToken("client_a")));

    expect(h.updateMany.mock.calls[0][0].where).toEqual({
      id: "client_a",
      userId: "owner_1",
    });
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
