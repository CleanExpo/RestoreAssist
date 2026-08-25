#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const RELEASE_GATE_PATH = ".github/workflows/release-gate.yml";
const SUPPORTED_GATE_VERSION = "1.0.0";
const RECEIPT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_RECEIPT_AGE_MS = 24 * 60 * 60 * 1000;
const REPORT_MEMBER = "release-gate-report.json";
const MAX_REPORT_BYTES = 1024 * 1024;
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
const WEB_CRITERIA = [
  ["A1-core-journeys", "A", 10, "owner-evidence", "Signup/login → onboarding → storage setup → restore → inspection → claim → attest → PDF independently verified on this SHA"],
  ["A2-middleware-auth-paywall", "A", 10, "machine", "Middleware/auth/paywall tests pass"],
  ["A3-no-sev1-sev2-open", "A", 5, "owner-evidence", "Linear query: 0 open Urgent/High RestoreAssist issues"],
  ["B1-lint", "B", 5, "machine", "`npm run lint` exit 0"],
  ["B2-type-check", "B", 5, "machine", "`npm run type-check` exit 0"],
  ["B3-tests", "B", 5, "machine", "`npm run test:unit` 0 failures"],
  ["B4-smoke-sandbox", "B", 5, "machine", "Playwright sandbox smoke passes"],
  ["C1-npm-audit", "C", 10, "machine", "`npm audit --omit=dev --audit-level=moderate` 0 vulns"],
  ["C2-secrets-scan", "C", 5, "owner-evidence", "Secrets scan + env-var completeness verified"],
  ["D1-billing-flows", "D", 5, "owner-evidence", "Website Stripe purchase, renewal, cancellation verified; iOS checkout remains intentionally blocked"],
  ["D2-paywall-tests", "D", 5, "machine", "Billing + webhook test suites pass"],
  ["D3-revenue-reconciliation", "D", 5, "owner-evidence", "Stripe events count matches DB subscription_events count (7d window)"],
  ["F1-monitoring-alerting", "F", 5, "owner-evidence", "Vercel Observability alert rules configured for auth/billing/restore"],
  ["F2-runbooks-sla", "F", 5, "machine", "Runbooks + P1 SLA + customer comms template in place"],
].map(([id, section, points, kind, description]) => ({ id, section, points, kind, description }));

const REPORT_KEYS = [
  "criteria", "gate_version", "generated_at", "git_sha", "max_score",
  "passed", "profile", "sections", "total_score",
].sort();
const CRITERION_KEYS = ["description", "detail", "id", "kind", "points", "section", "status"].sort();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function extractBoundReleaseReport(archive) {
  if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > MAX_ARCHIVE_BYTES) {
    throw new Error("downloaded release-gate artifact is not a valid ZIP archive");
  }
  const minimumEocd = Math.max(0, archive.length - 22 - 0xffff);
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= minimumEocd; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0 || archive.readUInt16LE(eocd + 4) !== 0 || archive.readUInt16LE(eocd + 6) !== 0) {
    throw new Error("release-gate artifact ZIP is missing a single-disk central directory");
  }
  const entryCount = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  const commentLength = archive.readUInt16LE(eocd + 20);
  if (
    entryCount !== 1 ||
    centralOffset === 0xffffffff ||
    centralSize === 0xffffffff ||
    eocd + 22 + commentLength !== archive.length ||
    centralOffset + centralSize !== eocd
  ) {
    throw new Error("release-gate artifact must contain exactly one non-ZIP64 member");
  }
  if (centralOffset + 46 > archive.length || archive.readUInt32LE(centralOffset) !== 0x02014b50) {
    throw new Error("release-gate artifact central directory is invalid");
  }
  const flags = archive.readUInt16LE(centralOffset + 8);
  const method = archive.readUInt16LE(centralOffset + 10);
  const expectedCrc = archive.readUInt32LE(centralOffset + 16);
  const compressedSize = archive.readUInt32LE(centralOffset + 20);
  const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
  const nameLength = archive.readUInt16LE(centralOffset + 28);
  const extraLength = archive.readUInt16LE(centralOffset + 30);
  const memberCommentLength = archive.readUInt16LE(centralOffset + 32);
  const externalAttributes = archive.readUInt32LE(centralOffset + 38);
  const localOffset = archive.readUInt32LE(centralOffset + 42);
  const centralEnd = centralOffset + 46 + nameLength + extraLength + memberCommentLength;
  const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");
  const unixMode = externalAttributes >>> 16;
  if (
    centralEnd !== eocd ||
    name !== REPORT_MEMBER ||
    name.includes("/") ||
    name.includes("\\") ||
    (flags & 0x1) !== 0 ||
    ![0, 8].includes(method) ||
    compressedSize > MAX_REPORT_BYTES ||
    uncompressedSize > MAX_REPORT_BYTES ||
    (unixMode & 0xf000) === 0xa000 ||
    (unixMode & 0xf000) === 0x4000
  ) {
    throw new Error("release-gate artifact contains an unsafe or unexpected member");
  }
  if (localOffset + 30 > centralOffset || archive.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error("release-gate artifact local member header is invalid");
  }
  const localFlags = archive.readUInt16LE(localOffset + 6);
  const localMethod = archive.readUInt16LE(localOffset + 8);
  const localNameLength = archive.readUInt16LE(localOffset + 26);
  const localExtraLength = archive.readUInt16LE(localOffset + 28);
  const localName = archive.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + compressedSize;
  if (
    localFlags !== flags ||
    localMethod !== method ||
    localName !== REPORT_MEMBER ||
    dataEnd > centralOffset
  ) {
    throw new Error("release-gate artifact local member does not match its central directory");
  }
  const compressed = archive.subarray(dataStart, dataEnd);
  let report;
  try {
    report = method === 0
      ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: MAX_REPORT_BYTES });
  } catch {
    throw new Error("release-gate report member could not be decompressed");
  }
  if (report.length !== uncompressedSize || crc32(report) !== expectedCrc) {
    throw new Error("release-gate report member size or CRC does not match the archive");
  }
  return report;
}

export function verifyReleaseGateRun(
  payload,
  artifactsPayload,
  artifactBytes,
  { expectedSha, expectedRepository, now = Date.now() },
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("release-gate run receipt is not a JSON object");
  }
  if (!FULL_SHA.test(expectedSha)) {
    throw new Error("expected release SHA must be a full 40-character Git SHA");
  }
  if (payload.path !== RELEASE_GATE_PATH) {
    throw new Error(
      `receipt is not from ${RELEASE_GATE_PATH}; observed ${JSON.stringify(payload.path)}`,
    );
  }
  if (payload.event !== "workflow_dispatch") {
    throw new Error(
      `release gate must be an explicit workflow_dispatch run; observed ${JSON.stringify(payload.event)}`,
    );
  }
  if (payload.status !== "completed" || payload.conclusion !== "success") {
    throw new Error(
      `release gate is not completed successfully; status=${JSON.stringify(payload.status)} conclusion=${JSON.stringify(payload.conclusion)}`,
    );
  }
  if (payload.head_branch !== "main") {
    throw new Error(
      `release gate must run on main; observed ${JSON.stringify(payload.head_branch)}`,
    );
  }
  if (
    !FULL_SHA.test(payload.head_sha ?? "") ||
    payload.head_sha.toLowerCase() !== expectedSha.toLowerCase()
  ) {
    throw new Error(
      `release-gate SHA does not match deploy SHA; gate=${JSON.stringify(payload.head_sha)} deploy=${expectedSha}`,
    );
  }
  if (payload.head_repository?.full_name !== expectedRepository) {
    throw new Error(
      `release-gate repository mismatch; expected ${expectedRepository}, observed ${JSON.stringify(payload.head_repository?.full_name)}`,
    );
  }
  if (!Number.isSafeInteger(payload.id) || payload.id <= 0) {
    throw new Error("release-gate run receipt has no valid run id");
  }
  const createdAt = Date.parse(payload.created_at ?? "");
  const updatedAt = Date.parse(payload.updated_at ?? "");
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || updatedAt < createdAt) {
    throw new Error("release-gate run receipt has invalid or missing created_at/updated_at timestamps");
  }
  if (updatedAt > now + RECEIPT_CLOCK_SKEW_MS || now - updatedAt > MAX_RECEIPT_AGE_MS) {
    throw new Error("release-gate run receipt is stale or dated in the future");
  }
  if (!artifactsPayload || !Array.isArray(artifactsPayload.artifacts)) {
    throw new Error("release-gate artifact receipt has no artifacts array");
  }
  const expectedArtifactName = `release-gate-report-${expectedSha}`;
  const matchingArtifacts = artifactsPayload.artifacts.filter(
    (artifact) => artifact?.name === expectedArtifactName,
  );
  if (matchingArtifacts.length !== 1) {
    throw new Error(
      `release gate must have exactly one ${expectedArtifactName} artifact`,
    );
  }
  const artifact = matchingArtifacts[0];
  if (
    artifact.expired !== false ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes <= 0 ||
    artifact.workflow_run?.id !== payload.id
  ) {
    throw new Error(
      "release-gate report artifact is expired, empty or bound to another run",
    );
  }
  if (!Buffer.isBuffer(artifactBytes) || artifactBytes.length === 0) {
    throw new Error("downloaded release-gate artifact archive is empty");
  }
  if (artifact.size_in_bytes !== artifactBytes.length) {
    throw new Error(
      `release-gate artifact size mismatch; declared=${artifact.size_in_bytes} observed=${artifactBytes.length}`,
    );
  }
  const artifactDigest = `sha256:${createHash("sha256").update(artifactBytes).digest("hex")}`;
  if (artifact.digest !== artifactDigest) {
    throw new Error(
      `release-gate artifact digest mismatch; declared=${JSON.stringify(artifact.digest)} observed=${artifactDigest}`,
    );
  }
  const reportBytes = extractBoundReleaseReport(artifactBytes);
  if (reportBytes.length === 0) {
    throw new Error("downloaded release-gate report is empty");
  }
  let reportPayload;
  try {
    reportPayload = JSON.parse(reportBytes.toString("utf8"));
  } catch {
    throw new Error("downloaded release-gate report is not valid JSON");
  }
  if (!reportPayload || typeof reportPayload !== "object" || Array.isArray(reportPayload)) {
    throw new Error("downloaded release-gate report is not a JSON object");
  }
  if (JSON.stringify(Object.keys(reportPayload).sort()) !== JSON.stringify(REPORT_KEYS)) {
    throw new Error("downloaded report top-level schema does not match the supported contract");
  }
  if (
    typeof reportPayload.generated_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(reportPayload.generated_at) ||
    !Number.isFinite(Date.parse(reportPayload.generated_at))
  ) {
    throw new Error("downloaded report generated_at is not a canonical UTC timestamp");
  }
  const generatedAt = Date.parse(reportPayload.generated_at);
  if (
    generatedAt < createdAt - RECEIPT_CLOCK_SKEW_MS ||
    generatedAt > updatedAt + RECEIPT_CLOCK_SKEW_MS
  ) {
    throw new Error("downloaded report generated_at is not bound to the workflow run window");
  }
  if (reportPayload.git_sha?.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error("downloaded report git_sha is not bound to the release SHA");
  }
  if (
    reportPayload.gate_version !== SUPPORTED_GATE_VERSION ||
    reportPayload.profile !== "web" ||
    reportPayload.passed !== true
  ) {
    throw new Error("downloaded report is not a passing web release report");
  }
  const expectedMax = WEB_CRITERIA.reduce((sum, criterion) => sum + criterion.points, 0);
  if (
    !Number.isSafeInteger(reportPayload.total_score) ||
    !Number.isSafeInteger(reportPayload.max_score) ||
    reportPayload.max_score !== expectedMax ||
    reportPayload.total_score !== expectedMax
  ) {
    throw new Error("downloaded report score is incomplete or non-passing");
  }
  if (
    !Array.isArray(reportPayload.criteria) ||
    reportPayload.criteria.length !== WEB_CRITERIA.length
  ) {
    throw new Error("downloaded report criterion population does not match the supported web gate");
  }
  const observedById = new Map();
  for (const criterion of reportPayload.criteria) {
    if (!criterion || typeof criterion !== "object" || typeof criterion.id !== "string") {
      throw new Error("downloaded report contains an invalid criterion");
    }
    if (JSON.stringify(Object.keys(criterion).sort()) !== JSON.stringify(CRITERION_KEYS)) {
      throw new Error(`downloaded report criterion ${criterion.id} schema is incomplete or unexpected`);
    }
    if (typeof criterion.detail !== "string" || !criterion.detail.trim()) {
      throw new Error(`downloaded report criterion ${criterion.id} has no evidence detail`);
    }
    if (observedById.has(criterion.id)) {
      throw new Error(`downloaded report contains duplicate criterion ${criterion.id}`);
    }
    observedById.set(criterion.id, criterion);
  }
  for (const expected of WEB_CRITERIA) {
    const observed = observedById.get(expected.id);
    if (
      !observed ||
      observed.section !== expected.section ||
      observed.points !== expected.points ||
      observed.kind !== expected.kind ||
      observed.description !== expected.description ||
      observed.status !== "pass"
    ) {
      throw new Error(`downloaded report criterion ${expected.id} does not match the supported gate contract`);
    }
  }
  const expectedSections = Object.fromEntries(
    [...new Set(WEB_CRITERIA.map((criterion) => criterion.section))].map((section) => {
      const max = WEB_CRITERIA
        .filter((criterion) => criterion.section === section)
        .reduce((sum, criterion) => sum + criterion.points, 0);
      return [section, { earned: max, max }];
    }),
  );
  if (JSON.stringify(reportPayload.sections) !== JSON.stringify(expectedSections)) {
    throw new Error("downloaded report section score composition does not match the supported web gate");
  }
  return {
    run: payload,
    reportSha256: createHash("sha256").update(reportBytes).digest("hex"),
  };
}

export function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length !== 5) {
      throw new Error(
        "usage: verify-release-gate-run.mjs <run.json> <artifacts.json> <artifact.zip> <expected-sha> <expected-repository>",
      );
    }
    const [receiptPath, artifactsPath, artifactPath, expectedSha, expectedRepository] = argv;
    const payload = JSON.parse(readFileSync(receiptPath, "utf8"));
    const artifactsPayload = JSON.parse(readFileSync(artifactsPath, "utf8"));
    const artifactBytes = readFileSync(artifactPath);
    const receipt = verifyReleaseGateRun(payload, artifactsPayload, artifactBytes, {
      expectedSha,
      expectedRepository,
    });
    console.log(
      `[release-gate-receipt] PASS run=${receipt.run.id} sha=${receipt.run.head_sha} report_sha256=${receipt.reportSha256}`,
    );
    return 0;
  } catch (error) {
    console.error(
      `[release-gate-receipt] FAIL: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
