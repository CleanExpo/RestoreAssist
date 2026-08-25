import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import { verifyReleaseGateRun } from "../verify-release-gate-run.mjs";

const SHA = "a".repeat(40);
const OPTIONS = {
  expectedSha: SHA,
  expectedRepository: "CleanExpo/RestoreAssist",
  now: Date.parse("2026-08-25T00:10:00.000Z"),
};
const DESCRIPTIONS = [
  "Signup/login → onboarding → storage setup → restore → inspection → claim → attest → PDF independently verified on this SHA",
  "Middleware/auth/paywall tests pass", "Linear query: 0 open Urgent/High RestoreAssist issues",
  "`npm run lint` exit 0", "`npm run type-check` exit 0", "`npm run test:unit` 0 failures",
  "Playwright sandbox smoke passes", "`npm audit --omit=dev --audit-level=moderate` 0 vulns",
  "Secrets scan + env-var completeness verified",
  "Website Stripe purchase, renewal, cancellation verified; iOS checkout remains intentionally blocked",
  "Billing + webhook test suites pass", "Stripe events count matches DB subscription_events count (7d window)",
  "Vercel Observability alert rules configured for auth/billing/restore",
  "Runbooks + P1 SLA + customer comms template in place",
];
const CRITERIA = [
  ["A1-core-journeys", "A", 10, "owner-evidence"], ["A2-middleware-auth-paywall", "A", 10, "machine"],
  ["A3-no-sev1-sev2-open", "A", 5, "owner-evidence"], ["B1-lint", "B", 5, "machine"],
  ["B2-type-check", "B", 5, "machine"], ["B3-tests", "B", 5, "machine"],
  ["B4-smoke-sandbox", "B", 5, "machine"], ["C1-npm-audit", "C", 10, "machine"],
  ["C2-secrets-scan", "C", 5, "owner-evidence"], ["D1-billing-flows", "D", 5, "owner-evidence"],
  ["D2-paywall-tests", "D", 5, "machine"], ["D3-revenue-reconciliation", "D", 5, "owner-evidence"],
  ["F1-monitoring-alerting", "F", 5, "owner-evidence"], ["F2-runbooks-sla", "F", 5, "machine"],
].map(([id, section, points, kind], index) => ({
  id, section, points, kind, description: DESCRIPTIONS[index], status: "pass", detail: "measured command -> exit 0",
}));
const REPORT = {
  gate_version: "1.0.0",
  profile: "web",
  generated_at: "2026-08-25T00:00:00.000Z",
  git_sha: SHA,
  total_score: 85,
  max_score: 85,
  passed: true,
  sections: {
    A: { earned: 25, max: 25 }, B: { earned: 20, max: 20 }, C: { earned: 15, max: 15 },
    D: { earned: 15, max: 15 }, F: { earned: 10, max: 10 },
  },
  criteria: CRITERIA,
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, bytes, mode = 0o100644, method = 0, declaredSize } of entries) {
    const nameBytes = Buffer.from(name);
    const body = Buffer.from(bytes);
    const compressed = method === 8 ? deflateRawSync(body) : body;
    const checksum = crc32(body);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(declaredSize ?? body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    locals.push(local, compressed);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declaredSize ?? body.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length + compressed.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

const archiveFor = (report) => storedZip([{
  name: "release-gate-report.json",
  bytes: Buffer.from(JSON.stringify(report)),
}]);
const ARTIFACT_BYTES = archiveFor(REPORT);

function verify(run = receipt(), artifactReceipt = artifacts(), archive = ARTIFACT_BYTES) {
  return verifyReleaseGateRun(
    run,
    artifactReceipt,
    archive,
    OPTIONS,
  );
}

function verifyReport(report, run = receipt()) {
  const archive = archiveFor(report);
  return verify(run, artifacts({}, archive), archive);
}

function receipt(overrides = {}) {
  return {
    id: 123456,
    path: ".github/workflows/release-gate.yml",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    head_sha: SHA,
    head_repository: { full_name: "CleanExpo/RestoreAssist" },
    created_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-25T00:05:00.000Z",
    ...overrides,
  };
}

function artifacts(overrides = {}, archive = ARTIFACT_BYTES) {
  return {
    artifacts: [
      {
        name: `release-gate-report-${SHA}`,
        expired: false,
        size_in_bytes: archive.length,
        digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
        workflow_run: { id: 123456 },
        ...overrides,
      },
    ],
  };
}

test("accepts an explicit successful release gate for the exact deploy SHA", () => {
  const payload = receipt();
  const result = verify(payload);
  assert.equal(result.run, payload);
  assert.match(result.reportSha256, /^[0-9a-f]{64}$/);
});

test("rejects a successful gate for a different SHA or repository", () => {
  assert.throws(
    () => verify(receipt({ head_sha: "b".repeat(40) })),
    /does not match deploy SHA/,
  );
  assert.throws(
    () => verify(receipt({ head_repository: { full_name: "attacker/decoy" } })),
    /repository mismatch/,
  );
});

test("rejects an automatic, incomplete, failed or wrong-workflow receipt", () => {
  for (const [overrides, pattern] of [
    [{ event: "push" }, /explicit workflow_dispatch/],
    [{ status: "in_progress", conclusion: null }, /not completed successfully/],
    [{ conclusion: "failure" }, /not completed successfully/],
    [{ path: ".github/workflows/decoy.yml" }, /receipt is not from/],
    [{ head_branch: "feature/unsafe" }, /must run on main/],
  ]) {
    assert.throws(() => verify(receipt(overrides)), pattern);
  }
});

test("rejects a successful run with no exact non-empty report artifact", () => {
  assert.throws(
    () => verify(receipt(), { artifacts: [] }),
    /exactly one/,
  );
  assert.throws(
    () => verify(receipt(), artifacts({ size_in_bytes: 0 })),
    /expired, empty or bound/,
  );
  assert.throws(
    () => verify(receipt(), artifacts({ workflow_run: { id: 999 } })),
    /expired, empty or bound/,
  );
});

test("rejects artifact bytes that do not match the declared GitHub digest", () => {
  assert.throws(
    () => verify(receipt(), artifacts({ digest: `sha256:${"f".repeat(64)}` })),
    /artifact digest mismatch/,
  );
  assert.throws(
    () => verify(receipt(), artifacts({ size_in_bytes: ARTIFACT_BYTES.length + 1 })),
    /artifact size mismatch/,
  );
});

test("rejects an empty, malformed, wrong-SHA or flattering report body", () => {
  const emptyArchive = storedZip([{ name: "release-gate-report.json", bytes: Buffer.alloc(0) }]);
  assert.throws(() => verify(receipt(), artifacts({}, emptyArchive), emptyArchive), /report is empty/);
  assert.throws(
    () => verifyReport({ ...REPORT, git_sha: "b".repeat(40) }),
    /git_sha is not bound/,
  );
  assert.throws(
    () => verifyReport({ ...REPORT, passed: true, total_score: 84 }),
    /score is incomplete/,
  );
  assert.throws(
    () => verifyReport({ ...REPORT, criteria: CRITERIA.map((item, index) => index === 0 ? { ...item, status: "fail" } : item) }),
    /does not match the supported gate contract/,
  );
});

test("rejects incomplete report and criterion content contracts", () => {
  const { generated_at: _generatedAt, ...noTimestamp } = REPORT;
  assert.throws(() => verifyReport(noTimestamp), /top-level schema/);
  assert.throws(
    () => verifyReport({ ...REPORT, criteria: CRITERIA.map((item, index) => index ? item : { ...item, detail: "" }) }),
    /no evidence detail/,
  );
  assert.throws(
    () => verifyReport({ ...REPORT, criteria: CRITERIA.map((item, index) => index ? item : { ...item, description: "flattering decoy" }) }),
    /supported gate contract/,
  );
});

test("rejects a decoy 1/1 report, duplicate criteria and unsupported schema", () => {
  assert.throws(
    () => verifyReport({ ...REPORT, total_score: 1, max_score: 1, criteria: [{ id: "DECOY", section: "A", points: 1, kind: "machine", status: "pass" }] }),
    /score is incomplete|criterion population/,
  );
  assert.throws(
    () => verifyReport({ ...REPORT, criteria: [...CRITERIA.slice(0, -1), CRITERIA[0]] }),
    /duplicate criterion/,
  );
  assert.throws(
    () => verifyReport({ ...REPORT, gate_version: "2.0.0" }),
    /not a passing web release report/,
  );
  assert.throws(
    () => verifyReport({ ...REPORT, sections: { A: { earned: 85, max: 85 } } }),
    /section score composition/,
  );
});

test("rejects stale, future, missing and run-window-mismatched timestamps", () => {
  assert.throws(() => verify(receipt({ created_at: undefined })), /invalid or missing/);
  assert.throws(
    () => verify(receipt({ created_at: "2026-08-20T00:00:00.000Z", updated_at: "2026-08-20T00:05:00.000Z" })),
    /stale or dated in the future/,
  );
  assert.throws(
    () => verifyReport({ ...REPORT, generated_at: "2000-01-01T00:00:00.000Z" }),
    /not bound to the workflow run window/,
  );
});

test("rejects extra, traversal and symlink archive members", () => {
  for (const archive of [
    storedZip([
      { name: "release-gate-report.json", bytes: Buffer.from(JSON.stringify(REPORT)) },
      { name: "extra.json", bytes: Buffer.from("{}") },
    ]),
    storedZip([{ name: "../release-gate-report.json", bytes: Buffer.from(JSON.stringify(REPORT)) }]),
    storedZip([{ name: "release-gate-report.json", bytes: Buffer.from("/tmp/decoy.json"), mode: 0o120777 }]),
  ]) {
    assert.throws(
      () => verify(receipt(), artifacts({}, archive), archive),
      /exactly one|unsafe or unexpected member/,
    );
  }
});

test("bounds decompression independently of forged ZIP size metadata", () => {
  const highRatio = storedZip([{
    name: "release-gate-report.json",
    bytes: Buffer.alloc(2 * 1024 * 1024),
    method: 8,
    declaredSize: 1,
  }]);
  assert.ok(highRatio.length < 10_000, "fixture must be a high-ratio compressed payload");
  assert.throws(
    () => verify(receipt(), artifacts({}, highRatio), highRatio),
    /could not be decompressed/,
  );
});
