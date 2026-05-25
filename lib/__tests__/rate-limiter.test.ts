import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rateLimitDb = vi.hoisted(() => {
  type Hit = {
    id: string;
    key: string;
    createdAt: Date;
    expiresAt: Date;
  };

  const hits = new Map<string, Hit>();
  let nextId = 1;
  let failStore = false;

  const matchesWhere = (
    hit: Hit,
    where?: {
      key?: string;
      createdAt?: { gte?: Date };
      expiresAt?: { lt?: Date };
    },
  ) => {
    if (!where) return true;
    if (where.key && hit.key !== where.key) return false;
    if (where.createdAt?.gte && hit.createdAt < where.createdAt.gte) {
      return false;
    }
    if (where.expiresAt?.lt && hit.expiresAt >= where.expiresAt.lt) {
      return false;
    }
    return true;
  };

  const rateLimitHit = {
    async create({
      data,
    }: {
      data: { key: string; expiresAt: Date };
      select?: { id: boolean };
    }) {
      if (failStore) throw new Error("store unavailable");
      const id = `hit_${nextId++}`;
      const hit = {
        id,
        key: data.key,
        createdAt: new Date(),
        expiresAt: data.expiresAt,
      };
      hits.set(id, hit);
      return { id };
    },
    async count({
      where,
    }: {
      where?: { key?: string; createdAt?: { gte?: Date } };
    }) {
      if (failStore) throw new Error("store unavailable");
      return Array.from(hits.values()).filter((hit) =>
        matchesWhere(hit, where),
      ).length;
    },
    async findFirst({
      where,
    }: {
      where?: { key?: string; createdAt?: { gte?: Date } };
      orderBy?: { createdAt: "asc" };
      select?: { createdAt: boolean };
    }) {
      if (failStore) throw new Error("store unavailable");
      const [oldest] = Array.from(hits.values())
        .filter((hit) => matchesWhere(hit, where))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return oldest ? { createdAt: oldest.createdAt } : null;
    },
    async delete({ where }: { where: { id: string } }) {
      if (failStore) throw new Error("store unavailable");
      hits.delete(where.id);
      return {};
    },
    async deleteMany(args?: { where?: { expiresAt?: { lt: Date } } }) {
      if (failStore) throw new Error("store unavailable");
      if (!args?.where) {
        const count = hits.size;
        hits.clear();
        return { count };
      }

      let count = 0;
      for (const [id, hit] of hits) {
        if (matchesWhere(hit, args.where)) {
          hits.delete(id);
          count++;
        }
      }
      return { count };
    },
  };

  return {
    hits,
    setFailStore(value: boolean) {
      failStore = value;
    },
    rateLimitHit,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitHit: rateLimitDb.rateLimitHit,
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({ rateLimitHit: rateLimitDb.rateLimitHit }),
  },
}));

import { __resetRateLimitStore, applyRateLimit } from "../rate-limiter";

function makeReq(ip = "203.0.113.10"): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("applyRateLimit", () => {
  beforeEach(async () => {
    rateLimitDb.setFailStore(false);
    await __resetRateLimitStore();
  });

  it("persists route rate-limit hits in the durable store", async () => {
    const opts = { prefix: "test", key: "user_1", maxRequests: 2 };

    await expect(applyRateLimit(makeReq(), opts)).resolves.toBeNull();
    await expect(applyRateLimit(makeReq(), opts)).resolves.toBeNull();
    const limited = await applyRateLimit(makeReq(), opts);

    expect(limited?.status).toBe(429);
    expect(rateLimitDb.hits.size).toBe(2);
  });

  it("falls back to memory when the durable store is unavailable", async () => {
    rateLimitDb.setFailStore(true);
    const opts = { prefix: "fallback", key: "user_1", maxRequests: 1 };

    await expect(applyRateLimit(makeReq(), opts)).resolves.toBeNull();
    const limited = await applyRateLimit(makeReq(), opts);

    expect(limited?.status).toBe(429);
  });

  it("fails closed when requested and the durable store is unavailable", async () => {
    rateLimitDb.setFailStore(true);

    const limited = await applyRateLimit(makeReq(), {
      prefix: "closed",
      key: "user_1",
      maxRequests: 5,
      failClosedOnUpstashError: true,
    });

    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBe("900");
  });
});
