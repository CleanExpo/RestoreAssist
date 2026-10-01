import { expect, vi } from "vitest";

export const SYNTHETIC_OFFLINE_OWNER = {
  userId: "synthetic-offline-user",
  organizationId: "synthetic-offline-org",
  workspaceId: "synthetic-offline-workspace",
  workspaceOwnerId: "synthetic-offline-user",
};

/**
 * Standalone component tests omit NirOfflineProvider. Reproduce its verified
 * session setup using the real boundary; only the server response is synthetic.
 * Keep context requests separate from each test's operation-fetch assertions.
 */
export async function beginOfflineIdentity(operationFetch: typeof fetch) {
  const locksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: vi.fn(async (_name, _options, work) => work()) },
  });
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/auth/offline-context") {
      return Promise.resolve(new Response(JSON.stringify({ owner: SYNTHETIC_OFFLINE_OWNER })));
    }
    return operationFetch(input, init);
  });

  // Import after vi.resetModules so components and fixture share one context.
  const boundary = await import("@/lib/offline/account-boundary");
  boundary.setOfflineSession(SYNTHETIC_OFFLINE_OWNER.userId);
  expect(await boundary.refreshOfflineOwner()).toEqual(SYNTHETIC_OFFLINE_OWNER);

  return () => {
    boundary.clearOfflineContext(false);
    if (locksDescriptor) Object.defineProperty(navigator, "locks", locksDescriptor);
    else Reflect.deleteProperty(navigator, "locks");
  };
}
