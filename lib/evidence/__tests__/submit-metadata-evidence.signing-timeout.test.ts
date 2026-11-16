/**
 * RA-8388 review findings, at the submit seam.
 *
 * 1. "A device that cannot sign is invisible": everything
 *    `submitMetadataEvidence` does before the POST is local to the device.
 *    A failure there used to surface as whatever the platform threw, which
 *    the form could not tell from a failed network call.
 * 2. "No time limit on the evidence POST": the POST had no `signal` and no
 *    timer, so a half-open connection left the promise pending for ever.
 *
 * Signing is real WebCrypto throughout; only `fetch` is replaced.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  submitMetadataEvidence,
  type MetadataEvidenceDraft,
  type SignedRequestBytes,
} from "../submit-metadata-evidence";
import type { DeviceKeyRecord } from "../device-signing";

async function makeKey(): Promise<DeviceKeyRecord> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    keyId: "abcdef0123456789",
    privateKey: pair.privateKey,
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----",
    createdAt: new Date("2026-11-16T00:00:00.000Z").toISOString(),
    registered: true,
  };
}

const DRAFT: MetadataEvidenceDraft = {
  inspectionId: "ins_nir_2026_11_b3f306",
  workflowStepId: "step_moisture_survey",
  evidenceClass: "MOISTURE_READING",
  title: "Living room south wall",
  notes: null,
  structuredData: { moistureLevel: 18.4, surfaceType: "Plasterboard" },
  capturedAt: "2026-11-17T01:02:03.000Z",
  deviceType: "WEB_BROWSER",
};

function created(): Response {
  return new Response(JSON.stringify({ evidenceItem: { id: "ev_1" } }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

/** Settle a promise into a value the test can inspect without awaiting it. */
function track<T>(promise: Promise<T>) {
  const state: { settled: "pending" | "resolved" | "rejected"; error?: any } = {
    settled: "pending",
  };
  promise.then(
    () => {
      state.settled = "resolved";
    },
    (error) => {
      state.settled = "rejected";
      state.error = error;
    },
  );
  return state;
}

/** The rejection of a promise, or null when it resolved. */
function rejectionOf(promise: Promise<unknown>): Promise<any> {
  return promise.then(
    () => null,
    (error) => error,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("a local failure before the POST is a typed signing error", () => {
  it("wraps a key set-up failure and sends nothing", async () => {
    const fetchImpl = vi.fn(async () => created());
    const error = await rejectionOf(
      submitMetadataEvidence(DRAFT, {
        userId: "user_dani",
        ensureKey: () =>
          Promise.reject(
            new DOMException("Ed25519 is not supported", "NotSupportedError"),
          ),
        rotateKey: async () => {},
        signedCache: new Map(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DeviceSigningError");
    expect(error.stage).toBe("key");
    expect(error.message).toContain("NotSupportedError");
    // No unsigned fallback: a device that cannot sign sends nothing at all.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("wraps a failure to sign the manifest, sends nothing, caches nothing", async () => {
    const fetchImpl = vi.fn(async () => created());
    const key = await makeKey();
    const signedCache = new Map<string, SignedRequestBytes>();
    const error = await rejectionOf(
      submitMetadataEvidence(DRAFT, {
        userId: "user_dani",
        // A record whose private key the platform will refuse to sign with.
        ensureKey: async () => ({ ...key, privateKey: {} as CryptoKey }),
        rotateKey: async () => {},
        signedCache,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );

    expect(error.name).toBe("DeviceSigningError");
    expect(error.stage).toBe("sign");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(signedCache.size).toBe(0);
  });

  it("carries the registration status, and nothing from the draft or the user", async () => {
    const refused = Object.assign(
      new Error("Device key registration failed (500)"),
      { name: "DeviceKeyRegistrationError", status: 500 },
    );
    const error = await rejectionOf(
      submitMetadataEvidence(DRAFT, {
        userId: "user_dani",
        ensureKey: () => Promise.reject(refused),
        rotateKey: async () => {},
        signedCache: new Map(),
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
    );

    expect(error.name).toBe("DeviceSigningError");
    expect(error.message).toBe(
      "Device signing failed at key: DeviceKeyRegistrationError (500)",
    );
    expect(error.cause).toBe(refused);
  });

  it("wraps a failed key rotation after the server refused the key", async () => {
    const key = await makeKey();
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 403 }));
    const error = await rejectionOf(
      submitMetadataEvidence(DRAFT, {
        userId: "user_dani",
        ensureKey: async () => key,
        rotateKey: () => Promise.reject(new Error("IndexedDB write failed")),
        signedCache: new Map(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );

    expect(error.name).toBe("DeviceSigningError");
    expect(error.stage).toBe("rotate");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("lets a key-registration NETWORK failure through unwrapped", async () => {
    // The registration call itself not getting through is a connection
    // problem, not a device that cannot sign.
    const offline = Object.assign(
      new Error("Device key registration request failed"),
      { name: "DeviceKeyNetworkError" },
    );
    const error = await rejectionOf(
      submitMetadataEvidence(DRAFT, {
        userId: "user_dani",
        ensureKey: () => Promise.reject(offline),
        rotateKey: async () => {},
        signedCache: new Map(),
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
    );

    expect(error).toBe(offline);
  });

  it("leaves a thrown evidence POST as the network error it is", async () => {
    const key = await makeKey();
    const error = await rejectionOf(
      submitMetadataEvidence(DRAFT, {
        userId: "user_dani",
        ensureKey: async () => key,
        rotateKey: async () => {},
        signedCache: new Map(),
        fetchImpl: (async () => {
          throw new TypeError("Failed to fetch");
        }) as unknown as typeof fetch,
      }),
    );

    expect(error).toBeInstanceOf(TypeError);
    expect(error.name).toBe("TypeError");
  });
});

describe("the evidence POST has a time limit", () => {
  it("rejects 30 seconds after a POST that never answers, and aborts it", async () => {
    const key = await makeKey();
    const signedCache = new Map<string, SignedRequestBytes>();
    const seen: RequestInit[] = [];
    let markSent: () => void = () => {};
    const sent = new Promise<void>((resolve) => {
      markSent = resolve;
    });
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      seen.push(init);
      markSent();
      return new Promise<Response>(() => {});
    });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const state = track(
      submitMetadataEvidence(DRAFT, {
        userId: "user_dani",
        ensureKey: async () => key,
        rotateKey: async () => {},
        signedCache,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    await sent;

    await vi.advanceTimersByTimeAsync(29_999);
    expect(state.settled).toBe("pending");

    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe("rejected");
    expect(state.error.name).toBe("RequestTimeoutError");
    expect(state.error.timedOut).toBe(true);
    expect(seen[0].signal).toBeInstanceOf(AbortSignal);
    expect((seen[0].signal as AbortSignal).aborted).toBe(true);
    // The signed bytes stay cached, so the retry replays them exactly.
    expect(signedCache.size).toBe(1);
  });

  it("applies the same limit when the answer's body never finishes arriving", async () => {
    const key = await makeKey();
    let markSent: () => void = () => {};
    const sent = new Promise<void>((resolve) => {
      markSent = resolve;
    });
    const stalled = {
      status: 201,
      ok: true,
      headers: new Headers(),
      json: () => new Promise(() => {}),
    } as unknown as Response;
    const fetchImpl = vi.fn(async () => {
      markSent();
      return stalled;
    });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const state = track(
      submitMetadataEvidence(DRAFT, {
        userId: "user_dani",
        ensureKey: async () => key,
        rotateKey: async () => {},
        signedCache: new Map(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    await sent;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(state.settled).toBe("rejected");
    expect(state.error.name).toBe("RequestTimeoutError");
  });

  it("replays the same key and bytes after a timeout, without signing again", async () => {
    const key = await makeKey();
    const ensureKey = vi.fn(async () => key);
    const signedCache = new Map<string, SignedRequestBytes>();
    const sentRequests: Array<{ key: string; body: string }> = [];
    let markSent: () => void = () => {};
    const sent = new Promise<void>((resolve) => {
      markSent = resolve;
    });
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      sentRequests.push({
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
        body: String(init.body),
      });
      if (sentRequests.length === 1) {
        markSent();
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(created());
    });
    const deps = {
      userId: "user_dani",
      ensureKey,
      rotateKey: async () => {},
      signedCache,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const first = track(submitMetadataEvidence(DRAFT, deps));
    await sent;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(first.settled).toBe("rejected");

    const second = await submitMetadataEvidence(DRAFT, deps);
    expect(second.ok).toBe(true);
    expect(sentRequests).toHaveLength(2);
    expect(sentRequests[1].key).toBe(sentRequests[0].key);
    expect(sentRequests[1].body).toBe(sentRequests[0].body);
    expect(ensureKey).toHaveBeenCalledTimes(1);
  });

  it("leaves no timer running after an answer arrives", async () => {
    // A control, green before and after: it pins that the limit is cleared.
    const key = await makeKey();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const result = await submitMetadataEvidence(DRAFT, {
      userId: "user_dani",
      ensureKey: async () => key,
      rotateKey: async () => {},
      signedCache: new Map(),
      fetchImpl: (async () => created()) as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ evidenceItem: { id: "ev_1" } });
    expect(vi.getTimerCount()).toBe(0);
  });
});
