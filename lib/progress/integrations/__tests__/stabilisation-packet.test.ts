import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARRIERS,
  buildStabilisationPacket,
  submitToCarrier,
  type FetchDelegate,
  type StabilisationPacket,
  type TransitionData,
} from "../stabilisation-packet";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fakeTransition(
  overrides: Partial<TransitionData> = {},
): TransitionData {
  return {
    id: "tr_1",
    claimProgressId: "cp_1",
    transitionKey: "attest_stabilisation",
    transitionedAt: new Date("2026-04-26T10:00:00Z"),
    integrityHash: "h" + "0".repeat(63),
    guardSnapshot: { ok: true },
    attestor: {
      userId: "u_1",
      role: "TECHNICIAN",
      name: "Alex Tech",
      email: "alex@example.com",
    },
    evidenceManifest: [
      { type: "PHOTO", id: "ev_1", hash: "abc" },
      { type: "SWMS", id: "ev_2", hash: "def" },
    ],
    origin: "https://restoreassist.app",
    metadata: { claimNumber: "C-1234" },
    ...overrides,
  };
}

function fakePacket(
  overrides: Partial<StabilisationPacket> = {},
): StabilisationPacket {
  return {
    transitionId: "tr_1",
    claimProgressId: "cp_1",
    transitionedAt: "2026-04-26T10:00:00.000Z",
    origin: "https://restoreassist.app",
    attestor: {
      userId: "u_1",
      role: "TECHNICIAN",
      name: "Alex Tech",
      email: "alex@example.com",
    },
    guardSnapshot: { ok: true },
    integrityHash: "h" + "0".repeat(63),
    evidenceManifest: [{ type: "PHOTO", id: "ev_1" }],
    metadata: { claimNumber: "C-1234" },
    ...overrides,
  };
}

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  process.env.GUIDEWIRE_SANDBOX_URL = "https://gw.example.test/intake";
  process.env.YOUI_API_URL = "https://youi.example.test/intake";
  process.env.HOLLARD_API_URL = "https://hollard.example.test/intake";
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.GUIDEWIRE_SANDBOX_URL;
  delete process.env.YOUI_API_URL;
  delete process.env.HOLLARD_API_URL;
  vi.restoreAllMocks();
});

// ─── buildStabilisationPacket ────────────────────────────────────────────────

describe("buildStabilisationPacket", () => {
  it("assembles a typed packet from a committed attest_stabilisation row", async () => {
    const delegate: FetchDelegate = {
      loadTransition: vi.fn().mockResolvedValue(fakeTransition()),
    };

    const r = await buildStabilisationPacket("tr_1", delegate);

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.packet.transitionId).toBe("tr_1");
    expect(r.packet.claimProgressId).toBe("cp_1");
    expect(r.packet.transitionedAt).toBe("2026-04-26T10:00:00.000Z");
    expect(r.packet.attestor.email).toBe("alex@example.com");
    expect(r.packet.evidenceManifest).toHaveLength(2);
    expect(r.packet.integrityHash.length).toBeGreaterThan(0);
  });

  it("rejects an unknown transition", async () => {
    const delegate: FetchDelegate = {
      loadTransition: vi.fn().mockResolvedValue(null),
    };

    const r = await buildStabilisationPacket("tr_missing", delegate);

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toBe("transition not found");
  });

  it("rejects a non-attest_stabilisation transition key", async () => {
    const delegate: FetchDelegate = {
      loadTransition: vi
        .fn()
        .mockResolvedValue(fakeTransition({ transitionKey: "approve_scope" })),
    };

    const r = await buildStabilisationPacket("tr_1", delegate);

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/unsupported transitionKey: approve_scope/);
  });

  it("never throws when the delegate throws", async () => {
    const delegate: FetchDelegate = {
      loadTransition: vi.fn().mockRejectedValue(new Error("DB down")),
    };

    const r = await buildStabilisationPacket("tr_1", delegate);

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/loadTransition threw/);
  });

  it("falls back to {} when guardSnapshot is null", async () => {
    const delegate: FetchDelegate = {
      loadTransition: vi
        .fn()
        .mockResolvedValue(fakeTransition({ guardSnapshot: null })),
    };

    const r = await buildStabilisationPacket("tr_1", delegate);

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.packet.guardSnapshot).toEqual({});
  });
});

// ─── submitToCarrier — happy paths ──────────────────────────────────────────

describe("submitToCarrier — happy paths per carrier", () => {
  it("guidewire: returns claimReference from a 200 JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ claimReference: "GW-9001" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const r = await submitToCarrier(fakePacket(), "guidewire");

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.carrierRef).toBe("GW-9001");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["X-Idempotency-Key"]).toBe("tr_1:guidewire");
  });

  it("youi: returns caseId", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ caseId: "Y-77" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof globalThis.fetch;

    const r = await submitToCarrier(fakePacket(), "youi");

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.carrierRef).toBe("Y-77");
    expect(r.status).toBe(201);
  });

  it("hollard: returns claimNumber", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ claimNumber: "H-AAA-001" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof globalThis.fetch;

    const r = await submitToCarrier(fakePacket(), "hollard");

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.carrierRef).toBe("H-AAA-001");
  });
});

// ─── submitToCarrier — env / config ─────────────────────────────────────────

describe("submitToCarrier — env / config", () => {
  it("returns 'carrier endpoint not configured' when guidewire env is missing", async () => {
    delete process.env.GUIDEWIRE_SANDBOX_URL;

    const r = await submitToCarrier(fakePacket(), "guidewire");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toBe("carrier endpoint not configured");
  });

  it("returns the same error for youi when YOUI_API_URL is empty", async () => {
    process.env.YOUI_API_URL = "   ";

    const r = await submitToCarrier(fakePacket(), "youi");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toBe("carrier endpoint not configured");
  });

  it("returns the same error for hollard when HOLLARD_API_URL is missing", async () => {
    delete process.env.HOLLARD_API_URL;

    const r = await submitToCarrier(fakePacket(), "hollard");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toBe("carrier endpoint not configured");
  });
});

// ─── submitToCarrier — idempotency ──────────────────────────────────────────

describe("submitToCarrier — idempotency", () => {
  it("uses the transitionId as the idempotency-key suffix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await submitToCarrier(fakePacket({ transitionId: "abc" }), "guidewire");

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["X-Idempotency-Key"]).toBe("abc:guidewire");
  });

  it("idempotency keys are scoped per carrier (same transition, different keys)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await submitToCarrier(fakePacket({ transitionId: "abc" }), "guidewire");
    await submitToCarrier(fakePacket({ transitionId: "abc" }), "hollard");

    expect(fetchMock.mock.calls[0][1].headers["X-Idempotency-Key"]).toBe(
      "abc:guidewire",
    );
    expect(fetchMock.mock.calls[1][1].headers["X-Idempotency-Key"]).toBe(
      "abc:hollard",
    );
  });

  it("a replay of the same transitionId produces the same key (caller uses it as a dedupe ticket)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await submitToCarrier(fakePacket({ transitionId: "tr_dup" }), "guidewire");
    await submitToCarrier(fakePacket({ transitionId: "tr_dup" }), "guidewire");

    expect(fetchMock.mock.calls[0][1].headers["X-Idempotency-Key"]).toBe(
      fetchMock.mock.calls[1][1].headers["X-Idempotency-Key"],
    );
  });
});

// ─── submitToCarrier — error paths ──────────────────────────────────────────

describe("submitToCarrier — error paths", () => {
  it("never throws on a network error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(
        new Error("ECONNRESET"),
      ) as unknown as typeof globalThis.fetch;

    const r = await submitToCarrier(fakePacket(), "guidewire");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/network error/);
  });

  it("returns ok:false with status when carrier returns 5xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Internal", {
        status: 500,
      }),
    ) as unknown as typeof globalThis.fetch;

    const r = await submitToCarrier(fakePacket(), "youi");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/non-2xx/);
    expect(r.status).toBe(500);
  });

  it("returns ok:false when the carrier response is not JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html>oops</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    ) as unknown as typeof globalThis.fetch;

    const r = await submitToCarrier(fakePacket(), "guidewire");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/not valid JSON/);
  });

  it("returns ok:false when JSON has no recognisable id field", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ unrelated: "field" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof globalThis.fetch;

    const r = await submitToCarrier(fakePacket(), "guidewire");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/missing reference id/);
  });
});

// ─── module exports sanity ───────────────────────────────────────────────────

describe("module exports", () => {
  it("exports the 3 carrier keys in stable order", () => {
    expect(CARRIERS).toEqual(["guidewire", "youi", "hollard"]);
  });
});
