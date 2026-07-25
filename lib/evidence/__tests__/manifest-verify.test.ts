/**
 * RA-7090 slice 2 review round 1 (MUST-FIX 5c): DIRECT unit tests for the
 * verifier. Review noted the `return true` mutation in
 * verifyManifestSignature was caught by exactly ONE route test — the crypto
 * primitives deserve their own negatives that do not depend on route wiring.
 *
 * Also covers MUST-FIX 2: gps and capturedAt binding.
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  checkManifestBinding,
  parseSignedManifest,
  verifyManifestSignature,
  MAX_CAPTURE_CLOCK_SKEW_MS,
  MAX_CAPTURE_BACKDATE_MS,
} from "../manifest-verify";
import { canonicalizeManifest } from "../manifest-canonical";
import type { SignedEvidenceManifest } from "../manifest-canonical";

const KEYS = crypto.generateKeyPairSync("ed25519");
const PEM = KEYS.publicKey.export({ format: "pem", type: "spki" }).toString();
const OTHER_KEYS = crypto.generateKeyPairSync("ed25519");
const OTHER_PEM = OTHER_KEYS.publicKey
  .export({ format: "pem", type: "spki" })
  .toString();
const EC_PEM = crypto
  .generateKeyPairSync("ec", { namedCurve: "P-256" })
  .publicKey.export({ format: "pem", type: "spki" })
  .toString();

const SERVER_HASH = "a".repeat(64);

function manifest(
  overrides: Partial<SignedEvidenceManifest> = {},
): SignedEvidenceManifest {
  return {
    inspectionId: "i1",
    workflowStepId: "step1",
    evidenceClass: "PHOTO_DAMAGE",
    capturedAt: "2026-07-25T00:00:00.000Z",
    gps: { lat: -33.8688, lng: 151.2093, accuracy: 5 },
    userId: "u1",
    deviceKeyId: "abcdef0123456789",
    sha256: SERVER_HASH,
    ...overrides,
  };
}

function sign(m: SignedEvidenceManifest, key = KEYS.privateKey): string {
  return crypto
    .sign(null, Buffer.from(canonicalizeManifest(m), "utf8"), key)
    .toString("base64");
}

const BASE_CONTEXT = {
  inspectionId: "i1",
  evidenceClass: "PHOTO_DAMAGE",
  userId: "u1",
  workflowStepId: "step1" as string | null,
  fileSha256: SERVER_HASH,
  now: new Date("2026-07-25T01:00:00.000Z"),
};

describe("verifyManifestSignature — positive control", () => {
  it("verifies a correct signature", () => {
    const m = manifest();
    expect(verifyManifestSignature(m, sign(m), PEM)).toBe(true);
  });
});

describe("verifyManifestSignature — negatives", () => {
  it("rejects a signature made with a DIFFERENT key", () => {
    const m = manifest();
    expect(
      verifyManifestSignature(m, sign(m, OTHER_KEYS.privateKey), PEM),
    ).toBe(false);
  });

  it("rejects a signature over DIFFERENT content", () => {
    const signature = sign(manifest());
    expect(
      verifyManifestSignature(manifest({ sha256: "b".repeat(64) }), signature, PEM),
    ).toBe(false);
  });

  it.each([
    ["a truncated signature", Buffer.alloc(63).toString("base64")],
    ["an over-long signature", Buffer.alloc(65).toString("base64")],
    ["an empty signature", ""],
    ["non-base64 junk", "!!!! not base64 !!!!"],
    ["a base64 string of the wrong length", Buffer.from("short").toString("base64")],
  ])("rejects %s", (_label, signature) => {
    expect(verifyManifestSignature(manifest(), signature, PEM)).toBe(false);
  });

  it("rejects a valid signature checked against a P-256 (non-Ed25519) key", () => {
    const m = manifest();
    expect(verifyManifestSignature(m, sign(m), EC_PEM)).toBe(false);
  });

  it("rejects a malformed PEM without throwing", () => {
    const m = manifest();
    expect(verifyManifestSignature(m, sign(m), "not a pem")).toBe(false);
  });

  it("rejects when the key is a valid Ed25519 key that did not sign", () => {
    const m = manifest();
    expect(verifyManifestSignature(m, sign(m), OTHER_PEM)).toBe(false);
  });
});

describe("parseSignedManifest", () => {
  it("accepts a well-formed manifest", () => {
    const result = parseSignedManifest(JSON.stringify(manifest()));
    expect(result.ok).toBe(true);
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["a JSON array", JSON.stringify([1, 2])],
    ["a JSON string", JSON.stringify("nope")],
    ["null", JSON.stringify(null)],
  ])("rejects %s", (_label, raw) => {
    expect(parseSignedManifest(raw).ok).toBe(false);
  });

  it.each([
    "inspectionId",
    "evidenceClass",
    "capturedAt",
    "userId",
    "deviceKeyId",
    "sha256",
  ])("rejects a manifest missing %s", (field) => {
    const m = manifest() as unknown as Record<string, unknown>;
    delete m[field];
    expect(parseSignedManifest(JSON.stringify(m)).ok).toBe(false);
  });

  it("rejects a manifest with no gps object or malformed coordinates", () => {
    const noGps = manifest() as unknown as Record<string, unknown>;
    delete noGps.gps;
    expect(parseSignedManifest(JSON.stringify(noGps)).ok).toBe(false);

    expect(
      parseSignedManifest(
        JSON.stringify({
          ...manifest(),
          gps: { lat: "-33.8", lng: 151.2, accuracy: null },
        }),
      ).ok,
    ).toBe(false);
  });

  it("accepts null coordinates (permission denied is legitimate)", () => {
    const result = parseSignedManifest(
      JSON.stringify(
        manifest({ gps: { lat: null, lng: null, accuracy: null } }),
      ),
    );
    expect(result.ok).toBe(true);
  });
});

describe("checkManifestBinding — MUST-FIX 2: gps and capturedAt", () => {
  it("passes when everything agrees", () => {
    const result = checkManifestBinding(manifest(), {
      ...BASE_CONTEXT,
      capturedLat: -33.8688,
      capturedLng: 151.2093,
      capturedAt: "2026-07-25T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
  });

  it("REJECTS Sydney-signed coordinates submitted with Melbourne form fields", () => {
    // The exploit review demonstrated: manifest signed in Sydney, form
    // fields say Melbourne, record persisted MELBOURNE while claiming
    // signed status — and the dispute pack prints the persisted value.
    const result = checkManifestBinding(manifest(), {
      ...BASE_CONTEXT,
      capturedLat: -37.8136,
      capturedLng: 144.9631,
    });
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("message");
    expect((result as { message: string }).message).toContain(
      "different capture location",
    );
  });

  it("rejects a mismatched latitude alone and a mismatched longitude alone", () => {
    expect(
      checkManifestBinding(manifest(), {
        ...BASE_CONTEXT,
        capturedLat: -37.8136,
        capturedLng: 151.2093,
      }).ok,
    ).toBe(false);
    expect(
      checkManifestBinding(manifest(), {
        ...BASE_CONTEXT,
        capturedLat: -33.8688,
        capturedLng: 144.9631,
      }).ok,
    ).toBe(false);
  });

  it("rejects form coordinates when the manifest signed NO location", () => {
    const result = checkManifestBinding(
      manifest({ gps: { lat: null, lng: null, accuracy: null } }),
      { ...BASE_CONTEXT, capturedLat: -33.8688, capturedLng: 151.2093 },
    );
    expect(result.ok).toBe(false);
  });

  it("treats an ABSENT form field as no conflict (undefined ≠ null)", () => {
    // The client simply did not send capturedLat/Lng; the signed values are
    // used verbatim by the route.
    expect(checkManifestBinding(manifest(), BASE_CONTEXT).ok).toBe(true);
  });

  // Round 2 item 6: exact float equality happened to work for today's client
  // (String(lat) round-trips through parseFloat) but any client sending
  // toFixed(6) would have 400'd on EVERY signed capture.
  describe("float-safe comparison", () => {
    it("accepts a toFixed(6)-rounded form value against a full-precision manifest", () => {
      const m = manifest({
        gps: { lat: -33.86880012, lng: 151.20930049, accuracy: 5 },
      });
      const result = checkManifestBinding(m, {
        ...BASE_CONTEXT,
        capturedLat: parseFloat((-33.86880012).toFixed(6)),
        capturedLng: parseFloat((151.20930049).toFixed(6)),
      });
      expect(result.ok).toBe(true);
    });

    it("accepts a float that differs only below the comparison precision", () => {
      const result = checkManifestBinding(manifest(), {
        ...BASE_CONTEXT,
        capturedLat: -33.8688 + 1e-12,
        capturedLng: 151.2093 - 1e-12,
      });
      expect(result.ok).toBe(true);
    });

    it("STILL rejects a difference above the comparison precision", () => {
      // ~11 metres — a real location discrepancy, not float noise.
      const result = checkManifestBinding(manifest(), {
        ...BASE_CONTEXT,
        capturedLat: -33.8689,
        capturedLng: 151.2093,
      });
      expect(result.ok).toBe(false);
    });
  });

  it("rejects a capturedAt that disagrees with the signed manifest", () => {
    const result = checkManifestBinding(manifest(), {
      ...BASE_CONTEXT,
      capturedAt: "2026-07-24T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).toContain(
      "different capture time",
    );
  });

  it("accepts an equivalent capturedAt written in a different timezone offset", () => {
    // Same instant, different representation — binding compares instants.
    const result = checkManifestBinding(manifest(), {
      ...BASE_CONTEXT,
      capturedAt: "2026-07-25T10:00:00.000+10:00",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a future-dated capture beyond clock skew", () => {
    const result = checkManifestBinding(
      manifest({ capturedAt: "2026-07-26T00:00:00.000Z" }),
      BASE_CONTEXT,
    );
    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).toContain("future");
  });

  it("tolerates small clock skew", () => {
    const now = new Date("2026-07-25T01:00:00.000Z");
    const justInside = new Date(
      now.getTime() + MAX_CAPTURE_CLOCK_SKEW_MS - 1000,
    ).toISOString();
    expect(
      checkManifestBinding(manifest({ capturedAt: justInside }), {
        ...BASE_CONTEXT,
        now,
      }).ok,
    ).toBe(true);
  });

  // Round 2 MUST-FIX 1: the past is now bounded too — generously, so the
  // offline queue keeps working, but not so generously that a years-old
  // backdate can be printed under a verified banner.
  describe("backdating (MUST-FIX 1)", () => {
    const now = new Date("2026-07-25T01:00:00.000Z");

    it("ACCEPTS a realistic offline-queue delay of 10 days", () => {
      const capturedAt = new Date(
        now.getTime() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();
      expect(
        checkManifestBinding(manifest({ capturedAt }), { ...BASE_CONTEXT, now })
          .ok,
      ).toBe(true);
    });

    it("ACCEPTS a capture just INSIDE the bound", () => {
      const capturedAt = new Date(
        now.getTime() - MAX_CAPTURE_BACKDATE_MS + 60_000,
      ).toISOString();
      expect(
        checkManifestBinding(manifest({ capturedAt }), { ...BASE_CONTEXT, now })
          .ok,
      ).toBe(true);
    });

    it("REJECTS a capture just OUTSIDE the bound", () => {
      const capturedAt = new Date(
        now.getTime() - MAX_CAPTURE_BACKDATE_MS - 60_000,
      ).toISOString();
      const result = checkManifestBinding(manifest({ capturedAt }), {
        ...BASE_CONTEXT,
        now,
      });
      expect(result.ok).toBe(false);
      expect((result as { message: string }).message).toContain(
        "too far in the past",
      );
    });

    it("REJECTS the 2019 backdate proven live in review", () => {
      expect(
        checkManifestBinding(
          manifest({ capturedAt: "2019-01-01T00:00:00.000Z" }),
          { ...BASE_CONTEXT, now },
        ).ok,
      ).toBe(false);
    });
  });

  it("rejects an unparseable capturedAt", () => {
    expect(
      checkManifestBinding(manifest({ capturedAt: "not-a-date" }), BASE_CONTEXT)
        .ok,
    ).toBe(false);
  });
});

describe("checkManifestBinding — context fields", () => {
  it.each([
    ["hash", { fileSha256: "b".repeat(64) }],
    ["inspection", { inspectionId: "other" }],
    ["evidence class", { evidenceClass: "PHOTO_MOISTURE" }],
    ["user", { userId: "someone-else" }],
    ["workflow step", { workflowStepId: "other-step" }],
  ])("rejects a %s mismatch", (_label, contextOverride) => {
    expect(
      checkManifestBinding(manifest(), {
        ...BASE_CONTEXT,
        ...contextOverride,
      }).ok,
    ).toBe(false);
  });
});
