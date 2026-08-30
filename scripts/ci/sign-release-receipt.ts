#!/usr/bin/env node
/**
 * Producer for signed release-gate receipts — the other half of
 * `scripts/ci/release-receipt.ts`.
 *
 * This script CANNOT create a receipt on its own: it signs with a private key
 * supplied through `RELEASE_RECEIPT_PRIVATE_KEY`, and that key is deliberately
 * absent from this repository. Whoever holds it decides what the gate accepts,
 * which is the whole point -- the release gate's job is to collect a judgement
 * from someone accountable for it, and a key an agent could reach would make
 * the signature decorative.
 *
 * IT DOES NOT ACCEPT MEASUREMENTS.
 *
 * It used to. `--measurements` took caller-supplied JSON and signed it
 * unchanged, so a holder of a valid key could certify `openBlockerCount: 0`
 * without any producer ever running, and every guard in the verifier would
 * pass. That is self-attestation with a signature on it -- the exact thing the
 * receipt scheme exists to replace. CodeRabbit found it reviewing #2109
 * retrospectively; the flag is gone rather than validated, because a flag that
 * must not be trusted should not exist.
 *
 * The signer now invokes the registered producer for the criterion and signs
 * what that returns. A criterion with no registered producer cannot be signed
 * at all.
 *
 * Usage (inside the protected workflow only):
 *   npx tsx scripts/ci/sign-release-receipt.ts --criterion=A3-no-sev1-sev2-open
 *
 * Writes docs/evidence/release-gate/<gate_version>/<criterion>.receipt.json.
 *
 * Generating a keypair (owner, once, off this machine):
 *   openssl genpkey -algorithm ed25519 -out release-signing.pem
 *   openssl pkey -in release-signing.pem -pubout
 * The PUBLIC half goes into the RELEASE_RECEIPT_PUBLIC_KEYS repository secret,
 * scoped to the criteria that key is allowed to sign:
 *
 *   {"<key-id>": {"publicKey": "<PEM>", "criteria": ["C2-secrets-scan"]}}
 *
 * Issue a separate key per producer rather than one key for the gate: they run
 * in different places, and a leaked key should only reach its own criterion.
 * The private half never leaves the owner's control and must not be committed.
 */

import crypto from "node:crypto";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { canonicalizeManifest as canonicalJson } from "../../lib/evidence/manifest-canonical";
import { markdownSection } from "../release-gate-score";

const PRIVATE_KEY_ENV = "RELEASE_RECEIPT_PRIVATE_KEY";
const ROOT = process.cwd();

/** Read a `--name=value` flag from argv, or undefined when absent. */
function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

/** Abort with exit 2 (usage or setup error), matching run-smoke.mjs. */
function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

/** The gate version the receipt is produced against, from RELEASE_GATE.md. */
function gateVersion(): string {
  const text = fs.readFileSync(path.join(ROOT, "docs", "RELEASE_GATE.md"), "utf8");
  const m = text.match(/^gate_version:\s*([\d.]+)\s*$/m);
  if (!m) fail("gate_version not found in docs/RELEASE_GATE.md");
  return m[1];
}

/**
 * Criterion to producer, and the environment its measurement is taken in.
 *
 * A criterion absent here cannot be signed. That is deliberate and matches the
 * verifier's own registry: enabling a criterion has to be a reviewed code
 * change that says how it is measured, not a command-line argument.
 * `C2-secrets-scan` has a verifier policy but no producer yet, so it correctly
 * cannot be signed.
 */
const PRODUCERS: Record<
  string,
  { environment: string; produce: () => Promise<Record<string, unknown>> }
> = {
  "A3-no-sev1-sev2-open": {
    environment: "ci",
    produce: async () => {
      const apiKey = process.env.LINEAR_API_KEY;
      if (!apiKey) fail("LINEAR_API_KEY is not set; the A3 producer cannot run");
      const { produceA3Measurements } = await import(
        "./producers/a3-open-blockers"
      );
      return produceA3Measurements(apiKey) as Promise<Record<string, unknown>>;
    },
  },
  "C2-secrets-scan": {
    environment: "ci",
    produce: async () => {
      if (!process.env.GITLEAKS_BINARY?.trim()) {
        fail(
          "GITLEAKS_BINARY is not set; the C2 producer cannot run. The " +
            "workflow installs gitleaks at a pinned version and checksum -- " +
            "the producer deliberately does not fetch its own scanner.",
        );
      }
      const { produceC2Measurements } = await import("./producers/c2-secrets-scan");
      return produceC2Measurements() as Promise<Record<string, unknown>>;
    },
  },
  // D3-revenue-reconciliation is DELIBERATELY ABSENT.
  //
  // Its producer cannot yet measure `failedWebhookDeliveries` -- Stripe exposes
  // delivery attempts per endpoint rather than as a window count -- and the
  // previous stand-in read the value from `D3_FAILED_WEBHOOK_DELIVERIES`, which
  // reintroduced exactly the caller-supplied-measurement hole that removing
  // `--measurements` closed. Registering a criterion whose producer cannot
  // measure it, and filling the gap from the environment, is the defect this
  // registry exists to prevent.
  //
  // It goes back in when the producer can query Stripe for that count itself.
  // Until then D3 cannot be signed, which is the honest state rather than a
  // regression: it could not legitimately pass before either.
};

if (process.argv.includes("--measurements")
  || process.argv.some((a) => a.startsWith("--measurements="))) {
  fail(
    "--measurements is no longer accepted. The signer runs the producer itself; " +
      "hand-supplied measurements are what made a signed receipt meaningless.",
  );
}

const criterionId = arg("criterion") ?? fail("--criterion is required");
const producer = PRODUCERS[criterionId];
if (!producer) {
  fail(
    `no producer is registered for ${criterionId}. A criterion cannot be signed ` +
      "until something in this repository can measure it.",
  );
}
const environment = producer.environment;

/**
 * Provenance, straight from the Actions runtime.
 *
 * Refusing to run outside Actions is the point: a local run cannot mint a
 * receipt at all, so the private key being reachable only by the protected
 * workflow is enforced on both sides rather than by convention.
 */
const provenance = {
  repository: process.env.GITHUB_REPOSITORY ?? "",
  workflowRef: process.env.GITHUB_WORKFLOW_REF ?? "",
  runId: process.env.GITHUB_RUN_ID ?? "",
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "",
};
for (const [key, value] of Object.entries(provenance)) {
  if (!value) {
    fail(
      `${key} is not set. This signer only runs inside the protected GitHub ` +
        "Actions workflow; a receipt minted anywhere else is not evidence.",
    );
  }
}

const privateKeyPem = process.env[PRIVATE_KEY_ENV];
if (!privateKeyPem) {
  fail(
    `${PRIVATE_KEY_ENV} is not set. This script signs with the owner's key; ` +
      "it is not something the repository can supply for you.",
  );
}
let privateKey: crypto.KeyObject;
try {
  privateKey = crypto.createPrivateKey(privateKeyPem);
} catch (error) {
  fail(`${PRIVATE_KEY_ENV} is not a readable private key: ${error}`);
}
if (privateKey.asymmetricKeyType !== "ed25519") {
  fail(`${PRIVATE_KEY_ENV} must be an Ed25519 key`);
}

const version = gateVersion();
const evidenceDir = path.join(ROOT, "docs", "evidence", "release-gate", version);
const evidenceFile = path.join(evidenceDir, `${criterionId}.md`);
if (!fs.existsSync(evidenceFile)) {
  fail(`evidence file missing: ${path.relative(ROOT, evidenceFile)}`);
}

// The digest is taken over the SAME section the verifier reads, using the same
// parser. Recomputing it with a second reader here is how signer and verifier
// would silently drift apart.
const body = fs
  .readFileSync(evidenceFile, "utf8")
  .replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "")
  .trim();
const evidenceSection = markdownSection(body, "Evidence");
if (!evidenceSection) {
  fail(`${criterionId}.md has no ## Evidence section to bind a receipt to`);
}

// The measurement is taken HERE, by the registered producer, moments before
// signing. Nothing between the producer and the signature can substitute a
// different number, because there is no longer an input that carries one.
const measurements = await producer.produce();

const receipt = {
  criterionId,
  gateVersion: version,
  releaseSha: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(),
  releaseTree: execSync("git rev-parse HEAD^{tree}", { cwd: ROOT })
    .toString()
    .trim(),
  environment,
  issuedAt: new Date().toISOString(),
  evidenceDigest: `sha256:${crypto
    .createHash("sha256")
    .update(evidenceSection)
    .digest("hex")}`,
  measurements,
  provenance,
};

const keyId = arg("key-id") ?? "release-signing";
const out = path.join(evidenceDir, `${criterionId}.receipt.json`);
fs.writeFileSync(
  out,
  `${JSON.stringify(
    {
      keyId,
      signature: crypto
        .sign(null, Buffer.from(canonicalJson(receipt), "utf8"), privateKey)
        .toString("base64"),
      receipt,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Wrote ${path.relative(ROOT, out)} for ${receipt.releaseSha.slice(0, 12)} ` +
    `(run ${provenance.runId}, attempt ${provenance.runAttempt})`,
);
