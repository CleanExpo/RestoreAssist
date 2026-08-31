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
  checkA3Viewer,
  RECEIPT_WORKFLOW_PATH,
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
const REPO = "CleanExpo/RestoreAssist";
/** Provenance as the protected workflow stamps it. */
const PROVENANCE = {
  repository: REPO,
  workflowRef: `${REPO}/${RECEIPT_WORKFLOW_PATH}@refs/heads/main`,
  runId: "33334743656",
  runAttempt: "1",
};

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
    provenance: { ...PROVENANCE },
    measurements: {
      scanner: "gitleaks",
      scannerVersion: "8.28.0",
      scannedRef: "git-checkout-index",
      scannedFileCount: 3184,
      findings: 0,
      controlCanaryDetected: true,
      envSource: "https://restoreassist.app/api/health",
      envStatus: "ok",
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
    repository: REPO,
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
    //
    // Uses D1 because it is genuinely unregistered. This test named F1, then
    // A1, and each time that criterion gained a producer the assertion would
    // have quietly become one about a REGISTERED criterion -- still passing,
    // for the wrong reason. D1 has no producer and no policy.
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt({ criterionId: "D1-billing-flows" }), privateKey),
      context({ criterionId: "D1-billing-flows" }),
      keySet(publicKeyPem, ["D1-billing-flows"]),
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
      "A1-core-journeys",
      "A3-no-sev1-sev2-open",
      "C2-secrets-scan",
      "D3-revenue-reconciliation",
      "F1-monitoring-alerting",
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
        '{"keyId":"k","signature":"s","receipt":{"criterionId":"C2-secrets-scan","gateVersion":"1.0.0","releaseSha":"a","releaseTree":"b","environment":"ci","issuedAt":"x","evidenceDigest":"d","provenance":{"repository":"r","workflowRef":"w@refs/heads/main","runId":"1","runAttempt":"1"},"measurements":{"findings":1e999}}}',
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

  it.each([
    ["absent", undefined],
    ["zero", 0],
    ["negative", -1],
    ["fractional", 12.5],
    ["a string", "3184"],
  ])("refuses a scan that read %s files", (_label, scannedFileCount) => {
    // A3's unplugged smoke detector, in a different costume. A checkout-index
    // export that produced no files scans clean, and a clean scan of nothing
    // is indistinguishable from a clean tree unless the count is checked.
    const measurements = { ...validReceipt().measurements };
    if (scannedFileCount === undefined) delete measurements.scannedFileCount;
    else measurements.scannedFileCount = scannedFileCount;
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt({ measurements }), privateKey),
      context(),
      keySet(publicKeyPem),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /scannedFileCount must be a positive integer/,
    );
  });

  it.each([
    ["absent", undefined],
    ["false", false],
    ["the string \"true\"", "true"],
    ["1", 1],
  ])("refuses a scan whose control canary reads %s", (_label, detected) => {
    // C2 rested on a .gitleaks.toml that allowlisted every markdown file, so
    // the scan could not have detected a secret committed to one and reported
    // "no leaks found" regardless. Without the control, findings: 0 is silence,
    // not evidence. Truthy-but-not-true must fail too, or `1` would pass.
    const measurements = { ...validReceipt().measurements };
    if (detected === undefined) delete measurements.controlCanaryDetected;
    else measurements.controlCanaryDetected = detected;
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt({ measurements }), privateKey),
      context(),
      keySet(publicKeyPem),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /controlCanaryDetected must be true/,
    );
  });

  it.each([
    ["a sandbox host", "https://restoreassist-sandbox.vercel.app/api/health"],
    ["a preview host", "https://restoreassist.app.localhost/api/health"],
    ["the drift watchdog", "https://restoreassist.app/api/health/migrations"],
    ["absent", undefined],
  ])("refuses env completeness read from %s", (_label, envSource) => {
    // getEnvStatus() on a CI runner reads the RUNNER's environment, and a
    // sandbox answers a different question than the one C2 asks. The receipt
    // has to say which host it read, and only production counts.
    const measurements = { ...validReceipt().measurements };
    if (envSource === undefined) delete measurements.envSource;
    else measurements.envSource = envSource;
    const { privateKey, publicKeyPem } = keypair();
    const result = verifyReleaseReceipt(
      sign(validReceipt({ measurements }), privateKey),
      context(),
      keySet(publicKeyPem),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/envSource must be/);
  });

  it("accepts a fully measured C2 receipt", () => {
    // The positive control. Without this the negatives above would all pass
    // against a policy that rejected everything.
    const { privateKey, publicKeyPem } = keypair();
    expect(
      verifyReleaseReceipt(sign(validReceipt(), privateKey), context(), keySet(publicKeyPem)),
    ).toEqual({ ok: true });
  });

  it("keeps C2 to environments where a tracked-tree scan is reproducible", () => {
    // Exact on purpose: widening this must be a deliberate edit. A secrets
    // scan reads the tree, so it has no business claiming production.
    expect(CRITERION_POLICIES["C2-secrets-scan"].environments).toEqual(["ci"]);
  });
});

describe("A1-core-journeys policy", () => {
  const RELEASE_SHA = SHA;

  function a1(overrides: Record<string, string | number | boolean> = {}) {
    return validReceipt({
      criterionId: "A1-core-journeys",
      environment: "sandbox",
      measurements: {
        source: "playwright",
        baseUrl: "https://restoreassist-sandbox.vercel.app",
        deploymentSha: RELEASE_SHA,
        testsExecuted: 42,
        specsDeclared: "auth.spec.ts,first-tradie-flow.spec.ts",
        specsMissingFromReport: "",
        failingSpecs: "",
        journeySteps:
          "signup,login,onboarding,storage setup,restore,inspection,claim,attest,pdf",
        coveredSteps:
          "signup,login,onboarding,storage setup,restore,inspection,claim,attest,pdf",
        uncoveredSteps: "",
        ...overrides,
      },
    });
  }

  function verify(receipt: ReleaseReceipt) {
    const { privateKey, publicKeyPem } = keypair();
    return verifyReleaseReceipt(
      sign(receipt, privateKey),
      context({ criterionId: "A1-core-journeys" }),
      keySet(publicKeyPem, ["A1-core-journeys"]),
    );
  }

  it("accepts a journey verified against this exact revision", () => {
    expect(verify(a1())).toEqual({ ok: true });
  });

  it("refuses a journey verified against a different build", () => {
    /**
     * THE A1 control. "Independently verified on this SHA" is the criterion's
     * own wording, and a green journey against yesterday's build is evidence
     * about yesterday's build. Production served a revision older than its own
     * deploymentSha field for weeks, so this has actually happened here.
     */
    const result = verify(a1({ deploymentSha: "b".repeat(40) }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /not the release SHA/,
    );
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["a truncated SHA", "abc123"],
  ])("refuses a receipt whose deploymentSha is %s", (_label, deploymentSha) => {
    const receipt = a1(deploymentSha === undefined ? {} : { deploymentSha });
    if (deploymentSha === undefined) delete receipt.measurements.deploymentSha;
    const result = verify(receipt);
    expect(result.ok).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["absent", undefined],
  ])("refuses a run that executed %s tests", (_label, testsExecuted) => {
    // Playwright exits 0 when it matches nothing, so "0 failures" and "ran
    // nothing" are the same exit code.
    const receipt = a1(testsExecuted === undefined ? {} : { testsExecuted });
    if (testsExecuted === undefined) delete receipt.measurements.testsExecuted;
    const result = verify(receipt);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /testsExecuted must be a positive integer/,
    );
  });

  it("refuses a receipt whose declared specs did not run", () => {
    const result = verify(
      a1({ specsMissingFromReport: "auth.spec.ts,setup-happy-path.spec.ts" }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /declared specs did not run: auth\.spec\.ts/,
    );
  });

  it("refuses a coverage map that names no specs at all", () => {
    // Otherwise an empty map reports nothing missing and nothing failing, and
    // every step trivially "covered" -- verifying nothing.
    const result = verify(a1({ specsDeclared: "" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /specsDeclared is empty/,
    );
  });

  it("refuses a receipt with a failing spec", () => {
    const result = verify(a1({ failingSpecs: "job-close-happy-path.spec.ts" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/specs failed/);
  });

  it("refuses a receipt that narrowed the criterion's own step list", () => {
    const result = verify(
      a1({ journeySteps: "signup,login", coveredSteps: "signup,login" }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /journeySteps does not match/,
    );
  });

  it("refuses a receipt where a journey step was not verified", () => {
    const result = verify(
      a1({
        coveredSteps:
          "signup,login,onboarding,storage setup,inspection,claim,attest,pdf",
        uncoveredSteps: "restore",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /journey steps not verified: restore/,
    );
  });

  it("keeps A1 to a deployed sandbox, not a runner and not production", () => {
    // The journey signs up companies and pushes an invoice. "ci" would mean it
    // ran against nothing deployed; "production" would create customer-visible
    // records on every gate run.
    expect(CRITERION_POLICIES["A1-core-journeys"].environments).toEqual(["sandbox"]);
  });
});

describe("F1-monitoring-alerting policy", () => {
  /** Measurements that pass, so each test plants exactly one lie. */
  function f1(overrides: Record<string, string | number | boolean> = {}) {
    return validReceipt({
      criterionId: "F1-monitoring-alerting",
      measurements: {
        source: "github-actions",
        repository: "CleanExpo/RestoreAssist",
        checksDeclared: 4,
        checksHealthy: 4,
        failingChecks: "",
        staleChecks: "",
        notifierLabelsDeclared: "security",
        missingNotifierLabels: "",
        requiredClasses: "auth-failures,billing-webhook-errors,restore-job-failures",
        coveredClasses: "auth-failures,billing-webhook-errors,restore-job-failures",
        uncoveredClasses: "",
        ...overrides,
      },
    });
  }

  function verify(receipt: ReleaseReceipt) {
    const { privateKey, publicKeyPem } = keypair();
    return verifyReleaseReceipt(
      sign(receipt, privateKey),
      context({ criterionId: "F1-monitoring-alerting" }),
      keySet(publicKeyPem, ["F1-monitoring-alerting"]),
    );
  }

  it("accepts a fully measured F1 receipt", () => {
    expect(verify(f1())).toEqual({ ok: true });
  });

  it.each([
    ["zero", 0],
    ["negative", -2],
    ["absent", undefined],
  ])("refuses a receipt declaring %s checks", (_label, checksDeclared) => {
    // A3's query that reached nothing, one criterion over: zero declared checks
    // reports zero failing and zero stale, and reads as healthy monitoring.
    const receipt = f1(
      checksDeclared === undefined ? {} : { checksDeclared, checksHealthy: 0 },
    );
    if (checksDeclared === undefined) delete receipt.measurements.checksDeclared;
    const result = verify(receipt);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /checksDeclared must be a positive integer/,
    );
  });

  it("refuses a receipt where a declared check is not healthy", () => {
    const result = verify(f1({ checksHealthy: 3, failingChecks: "smoke-prod.yml" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /only 3 of 4 production checks are healthy/,
    );
  });

  it.each(["failingChecks", "staleChecks"])(
    "refuses a receipt whose %s is not empty",
    (field) => {
      // Named separately from the count so the receipt says WHICH, and so a red
      // check and a check that stopped firing stay distinguishable.
      const result = verify(f1({ [field]: "deepsec-weekly.yml" }));
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toMatch(
        new RegExp(`${field} is not empty`),
      );
    },
  );

  it("refuses a repository with no failure notifier at all", () => {
    /**
     * The hole a bare emptiness check would leave open. With no notifier, both
     * `notifierLabelsDeclared` and `missingNotifierLabels` are empty -- so
     * "no labels are missing" passes while nothing alerts on anything.
     */
    const result = verify(f1({ notifierLabelsDeclared: "" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /no failure notifier is not alerting/,
    );
  });

  it("refuses a notifier whose label does not exist", () => {
    // The eight-week failure: `gh issue create` rejects a non-existent label,
    // so the notifier step fails and files nothing.
    const result = verify(f1({ missingNotifierLabels: "security" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /alarms cannot fire: security/,
    );
  });

  it("refuses a receipt that narrowed the criterion's own class list", () => {
    // Comparing against the required list rather than trusting uncoveredClasses
    // to be empty: a producer that simply stopped reporting a class would
    // otherwise pass by omission.
    const result = verify(
      f1({
        requiredClasses: "auth-failures",
        coveredClasses: "auth-failures",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /requiredClasses does not match/,
    );
  });

  it("refuses a receipt where a named failure class is unwatched", () => {
    const result = verify(
      f1({
        coveredClasses: "auth-failures",
        uncoveredClasses: "billing-webhook-errors,restore-job-failures",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /no alert covers: billing-webhook-errors,restore-job-failures/,
    );
  });

  it("keeps F1 to environments where the GitHub API is the instrument", () => {
    expect(CRITERION_POLICIES["F1-monitoring-alerting"].environments).toEqual(["ci"]);
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

  it("refuses even a clean run while no Linear service identity is pinned", () => {
    // The honest state today. Until A3_EXPECTED_VIEWER_ID names an identity
    // with verified read access across team RA, nothing establishes that the
    // querying key can see the private-team issues this criterion is about --
    // so a clean-looking run is not evidence.
    expect(verifyA3(a3())).toEqual({
      ok: false,
      message: expect.stringContaining("A3_EXPECTED_VIEWER_ID"),
    });
  });

  it("accepts the measurement once the identity matches", () => {
    expect(checkA3Viewer("usr_service", "usr_service")).toEqual({ ok: true });
  });

  it("refuses a measurement taken by a different Linear identity", () => {
    // A narrowed personal key is a different viewer, whatever its counts say.
    expect(checkA3Viewer("usr_someone_else", "usr_service")).toEqual({
      ok: false,
      message: expect.stringContaining("not the expected Linear service identity"),
    });
  });

  it("refuses a missing viewerId", () => {
    expect(checkA3Viewer(undefined, "usr_service").ok).toBe(false);
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

describe("planted defect: provenance", () => {
  /**
   * The P1 CodeRabbit found reviewing #2109 after it merged: the signer took a
   * `--measurements` argument and signed whatever it was handed, so a key
   * holder could certify `openBlockerCount: 0` with no producer ever running.
   * The structural fix is in the signer (the flag is gone). These are the
   * verifier-side controls that stop a receipt minted anywhere but the
   * protected workflow from counting.
   */
  function withProvenance(overrides: Record<string, string>) {
    const { privateKey, publicKeyPem } = keypair();
    return verifyReleaseReceipt(
      sign(
        validReceipt({ provenance: { ...PROVENANCE, ...overrides } }),
        privateKey,
      ),
      context(),
      keySet(publicKeyPem),
    );
  }

  it("accepts a receipt minted by the protected workflow on main", () => {
    expect(withProvenance({})).toEqual({ ok: true });
  });

  it("refuses a receipt minted from a pull-request branch", () => {
    // The most important one. A PR branch can EDIT the workflow file, so a
    // receipt minted from one proves nothing about what actually ran.
    expect(
      withProvenance({
        workflowRef: `${REPO}/${RECEIPT_WORKFLOW_PATH}@refs/pull/2112/merge`,
      }),
    ).toEqual({
      ok: false,
      message: expect.stringContaining("not refs/heads/main"),
    });
  });

  it("refuses a receipt minted by a different workflow", () => {
    // Guards against another workflow later gaining access to the same
    // environment and its secrets.
    expect(
      withProvenance({
        workflowRef: `${REPO}/.github/workflows/pr-checks.yml@refs/heads/main`,
      }),
    ).toEqual({
      ok: false,
      message: expect.stringContaining("not .github/workflows/release-receipt.yml"),
    });
  });

  it("refuses a receipt produced in another repository", () => {
    expect(withProvenance({ repository: "attacker/fork" })).toEqual({
      ok: false,
      message: expect.stringContaining("different repository"),
    });
  });

  it("refuses a malformed workflowRef rather than parsing past it", () => {
    expect(withProvenance({ workflowRef: "no-at-sign-here" })).toEqual({
      ok: false,
      message: expect.stringContaining("malformed"),
    });
  });

  it("refuses a receipt with no provenance at all", () => {
    const { privateKey, publicKeyPem } = keypair();
    const receipt = validReceipt();
    delete (receipt as { provenance?: unknown }).provenance;
    expect(
      verifyReleaseReceipt(sign(receipt, privateKey), context(), keySet(publicKeyPem)),
    ).toEqual({ ok: false, message: "receipt.provenance must be an object" });
  });

  it("refuses blank provenance fields, which would read as present", () => {
    expect(withProvenance({ runId: "" })).toEqual({
      ok: false,
      message: "receipt.provenance.runId is required",
    });
  });

  it("refuses unrecognised provenance fields", () => {
    // Same rule as the receipt body: a field inside the signature but outside
    // every check is where an unchecked claim would live.
    const { privateKey, publicKeyPem } = keypair();
    const receipt = validReceipt();
    (receipt.provenance as Record<string, string>).approvedBy = "me";
    expect(
      verifyReleaseReceipt(sign(receipt, privateKey), context(), keySet(publicKeyPem)),
    ).toEqual({
      ok: false,
      message: "receipt.provenance carries unrecognised fields: approvedBy",
    });
  });

  it("skips the repository check when the scorer has nothing to compare against", () => {
    // Running locally there is no trustworthy GITHUB_REPOSITORY, and inventing
    // one would be theatre. The workflow and ref checks still apply.
    const { privateKey, publicKeyPem } = keypair();
    expect(
      verifyReleaseReceipt(
        sign(validReceipt({ provenance: { ...PROVENANCE, repository: "someone/else" } }), privateKey),
        context({ repository: undefined }),
        keySet(publicKeyPem),
      ),
    ).toEqual({ ok: true });
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
      undeliveredWebhookEvents: 0,
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

  it("refuses a webhook delivery still outstanding at reconciliation time", () => {
    // A row that is not there yet and may never arrive. Distinct from
    // missingInDb, which catches a delivery that landed and still wrote no row.
    expect(verifyD3(d3({ undeliveredWebhookEvents: 2 }))).toEqual({
      ok: false,
      message: "measurement undeliveredWebhookEvents is 2, expected 0",
    });
  });

  it("refuses the old caller-supplied field, however it is spelled", () => {
    /**
     * This measurement used to be `failedWebhookDeliveries`, read from
     * D3_FAILED_WEBHOOK_DELIVERIES -- a caller-controlled input becoming a
     * signed measurement, which is the `--measurements` defect in different
     * clothing. A receipt carrying only the old field must fail: the policy
     * asks for the derived one, and a missing measurement is not a zero.
     */
    const measurements = d3();
    delete measurements.undeliveredWebhookEvents;
    measurements.failedWebhookDeliveries = 0;
    const result = verifyD3(measurements);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(
      /undeliveredWebhookEvents must be a number/,
    );
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
