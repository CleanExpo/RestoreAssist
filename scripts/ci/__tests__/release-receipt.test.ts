import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { canonicalizeManifest as canonicalJson } from "../../../lib/evidence/manifest-canonical";
import {
  checkReceiptBinding,
  CRITERION_POLICIES,
  parseSignedReceipt,
  type ReceiptContext,
  type ReleaseReceipt,
  type TrustedKey,
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

/** A fresh Ed25519 keypair, so no test depends on a committed key. */
function keypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privateKey,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/** A receipt that passes every check, so each test plants exactly one lie. */
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

/** The scoring context the valid receipt is bound to. */
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

/** Sign a receipt over its canonical bytes, as the real producer does. */
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

/** A trusted key set scoped, by default, to the criterion under test. */
function keySet(
  publicKeyPem: string,
  criteria: string[] = ["C2-secrets-scan"],
): Map<string, TrustedKey> {
  return new Map([[KEY_ID, { publicKeyPem, criteria }]]);
}

describe("a correctly signed receipt verifies", () => {
  it("passes every check when nothing has been tampered with", () => {
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt(), privateKey),
      context(),
      keySet(publicKeyPem),
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
        keySet(publicKeyPem),
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
      keySet(trusted.publicKeyPem),
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
      keySet(publicKeyPem),
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
        [TRUSTED_KEYS_ENV]: JSON.stringify({
          [KEY_ID]: { publicKey: "pem-here", criteria: ["C2-secrets-scan"] },
        }),
      } as NodeJS.ProcessEnv).get(KEY_ID),
    ).toEqual({ publicKeyPem: "pem-here", criteria: ["C2-secrets-scan"] });
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
  // The expected rejection is named per mutation rather than assumed to be
  // "signature invalid": key scope is checked BEFORE the signature, so an
  // edited criterion is caught as unauthorised. Asserting the exact message
  // keeps this test honest about which guard actually fired.
  const mutations: Array<[string, Partial<ReleaseReceipt>, string]> = [
    [
      "criterion",
      { criterionId: "A1-core-journeys" },
      `key ${KEY_ID} is not authorised to sign A1-core-journeys`,
    ],
    ["release SHA", { releaseSha: "d".repeat(40) }, "receipt signature is invalid"],
    ["source tree", { releaseTree: "e".repeat(40) }, "receipt signature is invalid"],
    ["evidence digest", { evidenceDigest: `sha256:${"f".repeat(64)}` }, "receipt signature is invalid"],
    ["gate version", { gateVersion: "9.9.9" }, "receipt signature is invalid"],
    ["issue time", { issuedAt: "2026-01-01T00:00:00.000Z" }, "receipt signature is invalid"],
  ];

  for (const [label, override, expectedMessage] of mutations) {
    it(`rejects an edited ${label} — the signature no longer covers it`, () => {
      const { privateKey, publicKeyPem } = keypair();
      const raw = sign(validReceipt(), privateKey);
      const tampered = JSON.parse(raw);
      Object.assign(tampered.receipt, override);
      const result = verifyReleaseReceipt(
        JSON.stringify(tampered),
        context(),
        keySet(publicKeyPem),
      );
      expect(result).toEqual({ ok: false, message: expectedMessage });
    });

    it(`rejects a re-signed ${label} — a valid signature over a false claim`, () => {
      // The more interesting half. An owner holding the real key can sign
      // anything; the binding checks are what make the content answerable to
      // this checkout rather than to whoever holds the key.
      const { privateKey, publicKeyPem } = keypair();
      const result = verifyReleaseReceipt(
        sign(validReceipt(override), privateKey),
        context(),
        keySet(publicKeyPem),
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
      keySet(publicKeyPem),
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
      keySet(publicKeyPem),
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
      keySet(publicKeyPem),
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
      sign(validReceipt({ criterionId: "F1-monitoring-alerting" }), privateKey),
      context({ criterionId: "F1-monitoring-alerting" }),
      keySet(publicKeyPem, ["F1-monitoring-alerting"]),
    );
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("no measurement policy is registered"),
    });
  });

  it("keeps the registry to criteria that have actually been defined", () => {
    // Deliberately exact. Adding a criterion here must be a conscious edit
    // with its own measurement predicate and tests, not a side effect.
    expect(Object.keys(CRITERION_POLICIES).sort()).toEqual([
      "A3-no-sev1-sev2-open",
      "C2-secrets-scan",
      "D3-revenue-reconciliation",
    ]);
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
      keySet(publicKeyPem),
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
      keySet(publicKeyPem),
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
      keySet(publicKeyPem),
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
      keySet(publicKeyPem),
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
      keySet(publicKeyPem),
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

describe("planted defect: key scope", () => {
  it("refuses a key that is not authorised for the criterion it signed", () => {
    // The blast-radius property. The Stripe reconciliation producer runs
    // somewhere quite different from the secrets scanner; if its key leaks it
    // must not be able to satisfy C2 as well.
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt(), privateKey),
      context(),
      keySet(publicKeyPem, ["D3-revenue-reconciliation"]),
    );
    expect(result).toEqual({
      ok: false,
      message: `key ${KEY_ID} is not authorised to sign C2-secrets-scan`,
    });
  });

  it("refuses a bare PEM entry rather than reading it as unscoped", () => {
    // The old format. Silently treating it as authority over every criterion
    // would be exactly the default nobody revisits.
    expect(
      trustedKeysFromEnv({
        [TRUSTED_KEYS_ENV]: JSON.stringify({ [KEY_ID]: "pem-here" }),
      } as NodeJS.ProcessEnv).size,
    ).toBe(0);
  });

  it("refuses an empty criteria list, which would authorise nothing but look configured", () => {
    expect(
      trustedKeysFromEnv({
        [TRUSTED_KEYS_ENV]: JSON.stringify({
          [KEY_ID]: { publicKey: "pem-here", criteria: [] },
        }),
      } as NodeJS.ProcessEnv).size,
    ).toBe(0);
  });

  // Both malformed shapes, because they take different branches. An earlier
  // version of this test only covered the missing-criteria one, and mutation
  // testing caught that the missing-publicKey branch could be changed to skip
  // the entry with all 39 tests still passing.
  it.each([
    ["missing criteria", { publicKey: "pem-here" }],
    ["missing publicKey", { criteria: ["C2-secrets-scan"] }],
    ["publicKey of the wrong type", { publicKey: 42, criteria: ["C2"] }],
  ])("drops the whole key set when one entry has %s", (_label, bad) => {
    // Keeping the valid entries would let a typo silently reshape the trust
    // root -- narrowing it, or widening it, without anyone noticing.
    expect(
      trustedKeysFromEnv({
        [TRUSTED_KEYS_ENV]: JSON.stringify({
          good: { publicKey: "pem-here", criteria: ["C2-secrets-scan"] },
          bad,
        }),
      } as NodeJS.ProcessEnv).size,
    ).toBe(0);
  });
});

describe("planted defect: environment binding", () => {
  it("refuses an environment the criterion does not accept", () => {
    // Before this check, `environment` was required non-empty and then never
    // compared to anything: a field that reads as a control in the receipt and
    // in review while permitting any value at all.
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt({ environment: "my-laptop" }), privateKey),
      context(),
      keySet(publicKeyPem),
    );
    expect(result).toEqual({
      ok: false,
      message:
        "receipt was observed in my-laptop, which C2-secrets-scan does not accept",
    });
  });

  it("keeps C2 to environments where a tracked-tree scan is reproducible", () => {
    // Exact on purpose: widening this must be a deliberate edit. A secrets
    // scan reads the tree, so it has no business claiming production.
    expect(CRITERION_POLICIES["C2-secrets-scan"].environments).toEqual(["ci"]);
  });
});

describe("A3-no-sev1-sev2-open policy", () => {
  const A3 = "A3-no-sev1-sev2-open";

  /** Measurements a correct A3 producer run emits. */
  function a3(overrides: Record<string, string | number | boolean> = {}) {
    return {
      source: "linear",
      teamKey: "RA",
      prioritiesScanned: "1,2",
      stateTypesScanned: "backlog,started,triage,unstarted",
      excludedProjects: "Margot,Pi-Dev-Ops",
      populationCount: 214,
      openBlockerCount: 0,
      blockers: "",
      ...overrides,
    };
  }

  function verifyA3(measurements: Record<string, string | number | boolean>) {
    const { privateKey, publicKeyPem } = keypair();
    return verifyReleaseReceipt(
      sign(validReceipt({ criterionId: A3, measurements }), privateKey),
      context({ criterionId: A3 }),
      keySet(publicKeyPem, [A3]),
    );
  }

  it("accepts a clean run", () => {
    expect(verifyA3(a3())).toEqual({ ok: true });
  });

  it("refuses an empty population — the unplugged smoke detector", () => {
    // The exact defect the evidence file records: a query naming a project
    // that did not exist returned nothing, and nothing read as zero blockers.
    // This is the single most important assertion in this block.
    expect(verifyA3(a3({ populationCount: 0 }))).toEqual({
      ok: false,
      message: expect.stringContaining("populationCount must be positive"),
    });
  });

  it("refuses a negative or non-numeric population", () => {
    expect(verifyA3(a3({ populationCount: -1 })).ok).toBe(false);
    expect(verifyA3(a3({ populationCount: "many" })).ok).toBe(false);
  });

  it("refuses a run that still has open blockers", () => {
    expect(
      verifyA3(a3({ openBlockerCount: 12, blockers: "RA-6678,RA-6955" })),
    ).toEqual({
      ok: false,
      message: "measurement openBlockerCount is 12, expected 0",
    });
  });

  it("refuses a query narrowed to `started` only", () => {
    // How blockers sitting in triage, backlog or unstarted went unseen.
    expect(verifyA3(a3({ stateTypesScanned: "started" }))).toEqual({
      ok: false,
      message: expect.stringContaining("every open state type"),
    });
  });

  it("refuses a query narrowed to Urgent only", () => {
    expect(verifyA3(a3({ prioritiesScanned: "1" }))).toEqual({
      ok: false,
      message: expect.stringContaining("prioritiesScanned must be 1,2"),
    });
  });

  it("refuses widened project exclusions, which could zero any count", () => {
    // A producer free to exclude anything can always report success.
    expect(
      verifyA3(a3({ excludedProjects: "Margot,Pi-Dev-Ops,RestoreAssist" })),
    ).toEqual({
      ok: false,
      message: expect.stringContaining("exactly Margot,Pi-Dev-Ops"),
    });
  });

  it("refuses a measurement from another team", () => {
    expect(verifyA3(a3({ teamKey: "PID" })).ok).toBe(false);
  });

  it("refuses a source that is not the Linear query", () => {
    expect(verifyA3(a3({ source: "spreadsheet" }))).toEqual({
      ok: false,
      message: "measurement source must be linear",
    });
  });

  it("still refuses a key not scoped to A3", () => {
    const { privateKey, publicKeyPem } = keypair();
    expect(
      verifyReleaseReceipt(
        sign(validReceipt({ criterionId: A3, measurements: a3() }), privateKey),
        context({ criterionId: A3 }),
        keySet(publicKeyPem, ["C2-secrets-scan"]),
      ).ok,
    ).toBe(false);
  });

  it("still refuses an environment A3 does not accept", () => {
    const { privateKey, publicKeyPem } = keypair();
    expect(
      verifyReleaseReceipt(
        sign(
          validReceipt({
            criterionId: A3,
            measurements: a3(),
            environment: "production",
          }),
          privateKey,
        ),
        context({ criterionId: A3 }),
        keySet(publicKeyPem, [A3]),
      ).ok,
    ).toBe(false);
  });
});

describe("D3-revenue-reconciliation policy", () => {
  const D3 = "D3-revenue-reconciliation";

  /** Measurements a clean reconciliation emits. */
  function d3(overrides: Record<string, string | number | boolean> = {}) {
    return {
      source: "stripe+prisma",
      mode: "live",
      windowDays: 7,
      // NOW in these tests is 2026-08-30, so this window ends today.
      windowEndsAt: "2026-08-30T00:00:00.000Z",
      eventTypesScanned:
        "customer.subscription.created,customer.subscription.deleted,customer.subscription.updated,invoice.payment_failed",
      stripeEventCount: 9,
      matchedInDb: 9,
      missingInDb: 0,
      duplicateStripeIds: 0,
      dbEventsWithoutStripeId: 0,
      failedWebhookDeliveries: 0,
      missingIds: "",
      ...overrides,
    };
  }

  function verifyD3(measurements: Record<string, string | number | boolean>) {
    const { privateKey, publicKeyPem } = keypair();
    return verifyReleaseReceipt(
      sign(
        validReceipt({
          criterionId: D3,
          measurements,
          environment: "production",
        }),
        privateKey,
      ),
      context({ criterionId: D3 }),
      keySet(publicKeyPem, [D3]),
    );
  }

  it("accepts a clean reconciliation", () => {
    expect(verifyD3(d3())).toEqual({ ok: true });
  });

  it("refuses a window with no Stripe events at all", () => {
    // The trap the evidence file names outright: two empty queries agreeing
    // reconciles perfectly and proves nothing. The single most important
    // assertion in this block.
    expect(verifyD3(d3({ stripeEventCount: 0, matchedInDb: 0 }))).toEqual({
      ok: false,
      message: expect.stringContaining("stripeEventCount must be positive"),
    });
  });

  it("refuses when an event has no database row", () => {
    expect(
      verifyD3(d3({ missingInDb: 1, matchedInDb: 8, missingIds: "evt_x" })),
    ).toEqual({
      ok: false,
      message: "measurement missingInDb is 1, expected 0",
    });
  });

  it("refuses equal totals that do not actually match", () => {
    // missingInDb 0 but matchedInDb short of the Stripe count is internally
    // inconsistent, and consistency is what stops a hand-edited receipt.
    expect(verifyD3(d3({ matchedInDb: 7 }))).toEqual({
      ok: false,
      message: expect.stringContaining("does not equal stripeEventCount"),
    });
  });

  it("refuses test-mode events, which are not revenue", () => {
    expect(verifyD3(d3({ mode: "test" }))).toEqual({
      ok: false,
      message: expect.stringContaining("only live Stripe events are revenue"),
    });
  });

  it("refuses an earlier window that happened to reconcile", () => {
    // A freely chosen window can be shopped for. NOW is 2026-08-30, so a
    // window ending in June is well outside the 14-day evidence ceiling.
    expect(verifyD3(d3({ windowEndsAt: "2026-06-01T00:00:00.000Z" }))).toEqual({
      ok: false,
      message: expect.stringContaining("must be the current window"),
    });
  });

  it("refuses a future window", () => {
    expect(verifyD3(d3({ windowEndsAt: "2027-01-01T00:00:00.000Z" })).ok).toBe(
      false,
    );
  });

  it("refuses a window that is not seven days", () => {
    expect(verifyD3(d3({ windowDays: 30 }))).toEqual({
      ok: false,
      message: "measurement windowDays must be 7",
    });
  });

  it("refuses a narrowed set of Stripe event types", () => {
    expect(
      verifyD3(d3({ eventTypesScanned: "customer.subscription.created" })),
    ).toEqual({
      ok: false,
      message: expect.stringContaining("all four reconciled Stripe types"),
    });
  });

  it("refuses duplicate stripe ids — the @unique positive control", () => {
    expect(verifyD3(d3({ duplicateStripeIds: 2 }))).toEqual({
      ok: false,
      message: "measurement duplicateStripeIds is 2, expected 0",
    });
  });

  it("refuses rows written by something other than the webhook", () => {
    expect(verifyD3(d3({ dbEventsWithoutStripeId: 3 }))).toEqual({
      ok: false,
      message: "measurement dbEventsWithoutStripeId is 3, expected 0",
    });
  });

  it("refuses failed webhook deliveries, and an unmeasured -1 with them", () => {
    // The producer defaults this to -1 when nobody supplied it, so "not
    // measured" fails here rather than passing as a silent zero.
    expect(verifyD3(d3({ failedWebhookDeliveries: 2 })).ok).toBe(false);
    expect(verifyD3(d3({ failedWebhookDeliveries: -1 }))).toEqual({
      ok: false,
      message: "measurement failedWebhookDeliveries is -1, expected 0",
    });
  });

  it("refuses a CI-mode observation: this criterion is about production", () => {
    const { privateKey, publicKeyPem } = keypair();
    expect(
      verifyReleaseReceipt(
        sign(
          validReceipt({ criterionId: D3, measurements: d3(), environment: "ci" }),
          privateKey,
        ),
        context({ criterionId: D3 }),
        keySet(publicKeyPem, [D3]),
      ).ok,
    ).toBe(false);
  });
});
