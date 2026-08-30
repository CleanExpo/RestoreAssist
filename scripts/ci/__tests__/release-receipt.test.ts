import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { canonicalizeManifest as canonicalJson } from "../../../lib/evidence/manifest-canonical";
import {
  checkReceiptBinding,
  MEASUREMENT_CHECKS,
  parseSignedReceipt,
  type ReceiptContext,
  type ReleaseReceipt,
  TRUSTED_KEYS_ENV,
  trustedKeysFromEnv,
  verifyReceiptSignature,
  verifyReleaseReceipt,
} from "../release-receipt";

/**
 * Planted-defect controls for the signed release receipt.
 *
 * `docs/RELEASE_GATE.md` makes these a precondition, not a nicety: owner
 * criteria stay at zero points "until those implementations AND THEIR
 * PLANTED-DEFECT CONTROLS exist". So every test below plants one specific lie
 * in an otherwise perfect receipt and asserts the verifier refuses it. A suite
 * that only ever feeds the verifier valid input would prove that the happy
 * path works and nothing whatsoever about what the gate is for.
 *
 * The happy-path test is here too, and it matters for a reason that is easy to
 * miss: before this module, `ownerEvidence()` had NO passing path at all, so
 * "the gate rejects this" was true of every possible input and therefore said
 * nothing. A demonstrated pass is what makes each rejection below meaningful.
 */

const KEY_ID = "release-signing-2026";
const GATE_VERSION = "1.0.0";
const SHA = "a".repeat(40);
const TREE = "b".repeat(40);
const DIGEST = `sha256:${"c".repeat(64)}`;
const NOW = new Date("2026-08-30T00:00:00.000Z");

function keypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privateKey,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function validReceipt(overrides: Partial<ReleaseReceipt> = {}): ReleaseReceipt {
  return {
    criterionId: "C2-secrets-scan",
    gateVersion: GATE_VERSION,
    releaseSha: SHA,
    releaseTree: TREE,
    environment: "ci",
    issuedAt: "2026-08-29T12:00:00.000Z",
    evidenceDigest: DIGEST,
    measurements: {
      scanner: "gitleaks",
      scannerVersion: "8.28.0",
      scannedRef: "git-checkout-index",
      findings: 0,
      missingEnvVars: 0,
    },
    ...overrides,
  };
}

function context(overrides: Partial<ReceiptContext> = {}): ReceiptContext {
  return {
    criterionId: "C2-secrets-scan",
    gateVersion: GATE_VERSION,
    releaseSha: SHA,
    releaseTree: TREE,
    evidenceDigest: DIGEST,
    maxAgeDays: 14,
    now: NOW,
    ...overrides,
  };
}

function sign(
  receipt: ReleaseReceipt,
  privateKey: crypto.KeyObject,
  keyId = KEY_ID,
): string {
  const signature = crypto
    .sign(null, Buffer.from(canonicalJson(receipt), "utf8"), privateKey)
    .toString("base64");
  return JSON.stringify({ keyId, signature, receipt });
}

describe("a correctly signed receipt verifies", () => {
  it("passes every check when nothing has been tampered with", () => {
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt(), privateKey),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({ ok: true });
  });

  it("survives reformatting, because the signature covers canonical bytes", () => {
    // A committed JSON file's whitespace and key order are not the signer's to
    // control. Verifying raw text would break a valid receipt on `prettier`.
    const { privateKey, publicKeyPem } = keypair();
    const raw = sign(validReceipt(), privateKey);
    const reformatted = JSON.stringify(JSON.parse(raw), null, 4);
    expect(
      verifyReleaseReceipt(
        reformatted,
        context(),
        new Map([[KEY_ID, publicKeyPem]]),
      ),
    ).toEqual({ ok: true });
  });
});

describe("planted defect: the trust root", () => {
  it("refuses everything when no key set is configured", () => {
    const { privateKey } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt(), privateKey),
      context(),
      new Map(),
    );
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("no trusted receipt keys configured"),
    });
  });

  it("refuses a receipt signed by a key the owner never trusted", () => {
    // The attack this exists for: an attacker who can write to the repository
    // generates their own keypair and signs a perfect receipt. Only the
    // environment-held key set stops them.
    const trusted = keypair();
    const attacker = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt(), attacker.privateKey),
      context(),
      new Map([[KEY_ID, trusted.publicKeyPem]]),
    );
    // Same key id, different key: the id is a selector, never a credential.
    expect(result).toEqual({
      ok: false,
      message: "receipt signature is invalid",
    });
  });

  it("refuses an unknown key id rather than falling back to any key", () => {
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt(), privateKey, "some-other-key"),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("untrusted key id"),
    });
  });

  it("reads key material only from the environment, never from disk", () => {
    // Property 1 in the module comment. If a future change adds a file
    // fallback, a committed key becomes the trust root and anyone who can open
    // a pull request can sign their own receipts.
    expect(trustedKeysFromEnv({} as NodeJS.ProcessEnv).size).toBe(0);
    expect(
      trustedKeysFromEnv({ [TRUSTED_KEYS_ENV]: "not json" } as NodeJS.ProcessEnv)
        .size,
    ).toBe(0);
    expect(
      trustedKeysFromEnv({
        [TRUSTED_KEYS_ENV]: JSON.stringify({ [KEY_ID]: 42 }),
      } as unknown as NodeJS.ProcessEnv).size,
    ).toBe(0);
    expect(
      trustedKeysFromEnv({
        [TRUSTED_KEYS_ENV]: JSON.stringify({ [KEY_ID]: "pem-here" }),
      } as NodeJS.ProcessEnv).get(KEY_ID),
    ).toBe("pem-here");
  });

  it("refuses a non-Ed25519 key even when the signature would verify", () => {
    const { publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const signed = JSON.parse(sign(validReceipt(), keypair().privateKey));
    expect(
      verifyReceiptSignature(
        signed,
        publicKey.export({ type: "spki", format: "pem" }).toString(),
      ),
    ).toBe(false);
  });
});

describe("planted defect: tampering with the signed body", () => {
  const mutations: Array<[string, Partial<ReleaseReceipt>]> = [
    ["criterion", { criterionId: "A1-core-journeys" }],
    ["release SHA", { releaseSha: "d".repeat(40) }],
    ["source tree", { releaseTree: "e".repeat(40) }],
    ["evidence digest", { evidenceDigest: `sha256:${"f".repeat(64)}` }],
    ["gate version", { gateVersion: "9.9.9" }],
    ["issue time", { issuedAt: "2026-01-01T00:00:00.000Z" }],
  ];

  for (const [label, override] of mutations) {
    it(`rejects an edited ${label} — the signature no longer covers it`, () => {
      const { privateKey, publicKeyPem } = keypair();
      const raw = sign(validReceipt(), privateKey);
      const tampered = JSON.parse(raw);
      Object.assign(tampered.receipt, override);
      const result = verifyReleaseReceipt(
        JSON.stringify(tampered),
        context(),
        new Map([[KEY_ID, publicKeyPem]]),
      );
      expect(result).toEqual({
        ok: false,
        message: "receipt signature is invalid",
      });
    });

    it(`rejects a re-signed ${label} — a valid signature over a false claim`, () => {
      // The more interesting half. An owner holding the real key can sign
      // anything; the binding checks are what make the content answerable to
      // this checkout rather than to whoever holds the key.
      const { privateKey, publicKeyPem } = keypair();
      const result = verifyReleaseReceipt(
        sign(validReceipt(override), privateKey),
        context(),
        new Map([[KEY_ID, publicKeyPem]]),
      );
      expect(result.ok).toBe(false);
    });
  }
});

describe("planted defect: freshness", () => {
  it("rejects a receipt older than the evidence ceiling", () => {
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(
        validReceipt({ issuedAt: "2026-08-10T00:00:00.000Z" }),
        privateKey,
      ),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("stale"),
    });
  });

  it("rejects a future-dated receipt, which would never expire", () => {
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(
        validReceipt({ issuedAt: "2027-01-01T00:00:00.000Z" }),
        privateKey,
      ),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({
      ok: false,
      message: "receipt issuedAt is in the future",
    });
  });

  it("tolerates small clock skew, so a CI runner minutes ahead still verifies", () => {
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(
        validReceipt({ issuedAt: "2026-08-30T00:01:00.000Z" }),
        privateKey,
      ),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("planted defect: the measurements themselves", () => {
  it("refuses a criterion with no registered measurement check", () => {
    // Without this, the owner's key alone would unlock points for any
    // criterion — a cryptographic restatement of self-attestation.
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt({ criterionId: "D3-revenue-reconciliation" }), privateKey),
      context({ criterionId: "D3-revenue-reconciliation" }),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("no measurement check is registered"),
    });
  });

  it("keeps the registry to criteria that have actually been defined", () => {
    // Deliberately exact. Adding a criterion here must be a conscious edit
    // with its own measurement predicate and tests, not a side effect.
    expect(Object.keys(MEASUREMENT_CHECKS).sort()).toEqual(["C2-secrets-scan"]);
  });

  it("refuses a secrets scan that found something", () => {
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(
        validReceipt({
          measurements: { ...validReceipt().measurements, findings: 3 },
        }),
        privateKey,
      ),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({
      ok: false,
      message: "measurement findings is 3, expected 0",
    });
  });

  it("refuses a working-directory scan, which does not read the tracked tree", () => {
    // CLAUDE.md: `gitleaks --no-git` ignores .gitignore, so a working-directory
    // scan can report clean while a tracked file carries a secret.
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(
        validReceipt({
          measurements: {
            ...validReceipt().measurements,
            scannedRef: "working-directory",
          },
        }),
        privateKey,
      ),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("scannedRef must be git-checkout-index"),
    });
  });

  it("refuses a scan missing its env-var completeness half", () => {
    const { privateKey, publicKeyPem } = keypair();
    const { missingEnvVars: _dropped, ...withoutEnv } =
      validReceipt().measurements;
    const result = verifyReleaseReceipt(
      sign(validReceipt({ measurements: withoutEnv }), privateKey),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({
      ok: false,
      message: "measurement missingEnvVars must be a number",
    });
  });

  it("refuses unset recommended env vars, which is what /api/health calls degraded", () => {
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(
        validReceipt({
          measurements: { ...validReceipt().measurements, missingEnvVars: 4 },
        }),
        privateKey,
      ),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({
      ok: false,
      message: "measurement missingEnvVars is 4, expected 0",
    });
  });
});

describe("planted defect: malformed receipts", () => {
  it("rejects unrecognised fields in the receipt body", () => {
    // An unknown field sits INSIDE the signature but OUTSIDE every binding
    // check — exactly where an unchecked but meaningful-looking claim lives.
    const { privateKey, publicKeyPem } = keypair();
    const receipt = {
      ...validReceipt(),
      overrideApproved: true,
    } as unknown as ReleaseReceipt;
    const result = verifyReleaseReceipt(
      sign(receipt, privateKey),
      context(),
      new Map([[KEY_ID, publicKeyPem]]),
    );
    expect(result).toEqual({
      ok: false,
      message: "receipt body carries unrecognised fields: overrideApproved",
    });
  });

  it("rejects a non-finite measurement, which cannot canonicalise", () => {
    expect(
      parseSignedReceipt(
        '{"keyId":"k","signature":"s","receipt":{"criterionId":"C2-secrets-scan","gateVersion":"1.0.0","releaseSha":"a","releaseTree":"b","environment":"ci","issuedAt":"x","evidenceDigest":"d","measurements":{"findings":1e999}}}',
      ),
    ).toEqual({
      ok: false,
      message: "receipt.measurements.findings must be a finite number",
    });
  });

  it("rejects a receipt that is not JSON at all", () => {
    expect(parseSignedReceipt("not json")).toEqual({
      ok: false,
      message: "receipt must be valid JSON",
    });
  });

  it("rejects a missing signature rather than treating it as unsigned-but-fine", () => {
    expect(
      parseSignedReceipt(JSON.stringify({ keyId: "k", receipt: validReceipt() })),
    ).toEqual({ ok: false, message: "receipt.signature is required" });
  });
});

describe("binding is checked independently of the signature", () => {
  it("rejects a receipt for a different criterion even when unsigned checks run alone", () => {
    expect(
      checkReceiptBinding(validReceipt({ criterionId: "A3-no-sev1-sev2-open" }), context()),
    ).toEqual({
      ok: false,
      message: expect.stringContaining("bound to a different criterion"),
    });
  });
});
