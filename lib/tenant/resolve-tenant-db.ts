/**
 * Per-tenant DB client resolver for the tenant-DB read-shadow pilot.
 *
 * Official Prisma guidance: "Creating multiple instances of `PrismaClient` can
 * exhaust your database connection pool, especially in serverless or edge
 * environments." So we keep at most one client per workspace, cap the total with
 * an LRU, and evict idle clients (disconnecting cleanly). The client type and the
 * client factory are injected, so the cache/eviction logic is unit-testable
 * without a live database; production wires a real PrismaClient factory.
 */
export interface TenantDbResolverOptions<T> {
  /** Build a client bound to a tenant connection string (e.g. a PrismaClient). */
  createClient: (connectionString: string) => T;
  /** Max cached clients before LRU eviction. Default 10. */
  maxSize?: number;
  /** Injectable clock (ms) for idle eviction. Default Date.now. */
  now?: () => number;
}

export interface TenantDbResolver<T> {
  /** Return the cached client for the workspace, creating it once if needed. */
  resolve(workspaceId: string, connectionString: string): T;
  /** Number of live cached clients. */
  size(): number;
  /** Disconnect + drop clients idle longer than idleMs; returns the count evicted. */
  evictIdleOlderThan(idleMs: number): number;
}

export function createTenantDbResolver<T>(
  opts: TenantDbResolverOptions<T>,
): TenantDbResolver<T> {
  const { createClient } = opts;
  const maxSize = opts.maxSize ?? 10;
  const now = opts.now ?? (() => Date.now());
  // Map insertion order models LRU recency: least-recent first, most-recent last.
  const cache = new Map<string, { client: T; lastUsed: number }>();

  const disconnect = (client: T) => {
    const d = (client as { $disconnect?: () => unknown }).$disconnect;
    if (typeof d === "function") d.call(client);
  };

  const touch = (
    workspaceId: string,
    entry: { client: T; lastUsed: number },
  ) => {
    entry.lastUsed = now();
    cache.delete(workspaceId);
    cache.set(workspaceId, entry); // re-insert at the most-recent end
  };

  return {
    resolve(workspaceId, connectionString) {
      const existing = cache.get(workspaceId);
      if (existing) {
        touch(workspaceId, existing);
        return existing.client;
      }
      const client = createClient(connectionString);
      cache.set(workspaceId, { client, lastUsed: now() });
      while (cache.size > maxSize) {
        const lruKey = cache.keys().next().value as string;
        const lru = cache.get(lruKey)!;
        cache.delete(lruKey);
        disconnect(lru.client);
      }
      return client;
    },
    size() {
      return cache.size;
    },
    evictIdleOlderThan(idleMs) {
      const cutoff = now() - idleMs;
      let evicted = 0;
      for (const [key, entry] of [...cache]) {
        if (entry.lastUsed < cutoff) {
          cache.delete(key);
          disconnect(entry.client);
          evicted++;
        }
      }
      return evicted;
    },
  };
}
