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
 * Usage:
 *   RELEASE_RECEIPT_PRIVATE_KEY="$(cat key.pem)" \
 *   npx tsx scripts/ci/sign-release-receipt.ts \
 *     --criterion=C2-secrets-scan \
 *     --environment=ci \
 *     --measurements='{"scanner":"gitleaks","scannerVersion":"8.28.0","scannedRef":"git-checkout-index","findings":0,"missingEnvVars":0}'
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

const criterionId = arg("criterion") ?? fail("--criterion is required");
const environment = arg("environment") ?? fail("--environment is required");
const rawMeasurements = arg("measurements") ?? fail("--measurements is required");

let measurements: unknown;
try {
  measurements = JSON.parse(rawMeasurements);
} catch {
  fail("--measurements must be valid JSON");
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
console.log(`Wrote ${path.relative(ROOT, out)} for ${receipt.releaseSha.slice(0, 12)}`);
