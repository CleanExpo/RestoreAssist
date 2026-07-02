import { describe, it, expect, vi } from "vitest";
import { createTenantDbResolver } from "../resolve-tenant-db";

describe("createTenantDbResolver", () => {
  it("reuses one client per workspace (never creates a second — pool safety)", () => {
    const createClient = vi.fn((cs: string) => ({ cs }));
    const r = createTenantDbResolver({ createClient });

    const a1 = r.resolve("w1", "postgres://w1");
    const a2 = r.resolve("w1", "postgres://w1");

    expect(a1).toBe(a2);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("creates a distinct client per workspace", () => {
    const createClient = vi.fn((cs: string) => ({ cs }));
    const r = createTenantDbResolver({ createClient });

    expect(r.resolve("w1", "postgres://w1")).not.toBe(
      r.resolve("w2", "postgres://w2"),
    );
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(r.size()).toBe(2);
  });

  it("evicts the least-recently-used client when over the cap", () => {
    const createClient = vi.fn((cs: string) => ({ cs }));
    const r = createTenantDbResolver({ createClient, maxSize: 2 });

    r.resolve("w1", "cs1");
    r.resolve("w2", "cs2");
    r.resolve("w1", "cs1"); // touch w1 → w2 is now the LRU
    r.resolve("w3", "cs3"); // over cap → evict w2

    expect(r.size()).toBe(2);
    r.resolve("w2", "cs2"); // was evicted → recreated
    expect(createClient).toHaveBeenCalledTimes(4); // w1,w2,w3,w2-again
  });

  it("evicts clients idle longer than the threshold using the injected clock", () => {
    let t = 1000;
    const disconnect = vi.fn();
    const createClient = vi.fn((cs: string) => ({ cs, $disconnect: disconnect }));
    const r = createTenantDbResolver({ createClient, now: () => t });

    r.resolve("w1", "cs1"); // lastUsed = 1000
    t = 6000;
    const evicted = r.evictIdleOlderThan(3000); // idle 5000ms > 3000ms

    expect(evicted).toBe(1);
    expect(r.size()).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(1); // clean disconnect on evict
  });
});
