/**
 * RA-8394 — one Idempotency-Key per user action, reused for every retry of
 * that action. A new key per call (the old behaviour) lets a double click or
 * a retry after a lost reply save twice, because the server guard dedupes by
 * key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMutationAttempt,
  fetchWithIdempotency,
} from "../fetch-with-idempotency";

function sentKey(mock: ReturnType<typeof vi.fn>, call: number): string | null {
  const init = mock.mock.calls[call][1] as RequestInit;
  return new Headers(init.headers).get("Idempotency-Key");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithIdempotency with a mutation attempt", () => {
  it("sends the same key for a retry after a lost reply", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const attempt = createMutationAttempt("cost-library-create");
    const body = JSON.stringify({ name: "A", region: "QLD" });

    await expect(
      fetchWithIdempotency("/api/cost-libraries", { method: "POST", body, attempt }),
    ).rejects.toThrow("Failed to fetch");
    await fetchWithIdempotency("/api/cost-libraries", { method: "POST", body, attempt });

    expect(sentKey(fetchMock, 0)).toBeTruthy();
    expect(sentKey(fetchMock, 1)).toBe(sentKey(fetchMock, 0));
  });

  it("sends the same key for two concurrent clicks with the same body", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () => new Response("{}", { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const attempt = createMutationAttempt("cost-item-create");
    const body = JSON.stringify({ rate: 10 });

    await Promise.all([
      fetchWithIdempotency("/api/cost-items", { method: "POST", body, attempt }),
      fetchWithIdempotency("/api/cost-items", { method: "POST", body, attempt }),
    ]);

    expect(sentKey(fetchMock, 1)).toBe(sentKey(fetchMock, 0));
  });

  it("keeps the key after a 5xx and a 409 (outcome not final)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const attempt = createMutationAttempt("x");
    const body = "{}";

    for (let i = 0; i < 3; i++) {
      await fetchWithIdempotency("/api/x", { method: "POST", body, attempt });
    }
    expect(sentKey(fetchMock, 1)).toBe(sentKey(fetchMock, 0));
    expect(sentKey(fetchMock, 2)).toBe(sentKey(fetchMock, 0));
  });

  it("starts a new key after success, so a deliberate second create is not replayed", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () => new Response("{}", { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const attempt = createMutationAttempt("x");
    const body = "{}";

    await fetchWithIdempotency("/api/x", { method: "POST", body, attempt });
    await fetchWithIdempotency("/api/x", { method: "POST", body, attempt });

    expect(sentKey(fetchMock, 1)).not.toBe(sentKey(fetchMock, 0));
  });

  it("starts a new key after a final client error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const attempt = createMutationAttempt("x");

    await fetchWithIdempotency("/api/x", { method: "POST", body: "{}", attempt });
    await fetchWithIdempotency("/api/x", { method: "POST", body: "{}", attempt });

    expect(sentKey(fetchMock, 1)).not.toBe(sentKey(fetchMock, 0));
  });

  it("starts a new key when the user changes the form before retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const attempt = createMutationAttempt("x");

    await expect(
      fetchWithIdempotency("/api/x", { method: "POST", body: '{"a":1}', attempt }),
    ).rejects.toThrow();
    await fetchWithIdempotency("/api/x", { method: "POST", body: '{"a":2}', attempt });

    // The server rejects a reused key with a different body (409 forever),
    // so a changed body must carry a new key.
    expect(sentKey(fetchMock, 1)).not.toBe(sentKey(fetchMock, 0));
  });

  it("uses an explicit key unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithIdempotency("/api/x", {
      method: "POST",
      body: "{}",
      idempotencyKey: "fixed-key",
    });

    expect(sentKey(fetchMock, 0)).toBe("fixed-key");
  });

  it("refuses to send without an attempt or an explicit key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      // @ts-expect-error — a call with neither must not type-check
      fetchWithIdempotency("/api/x", { method: "POST", body: "{}" }),
    ).rejects.toThrow(/attempt|idempotencyKey/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
