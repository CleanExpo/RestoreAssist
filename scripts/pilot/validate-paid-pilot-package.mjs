import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const REQUIRED_GROUPS = new Map([
  ["A1", "signup"],
  ["A2", "payment"],
  ["A3", "invites"],
  ["A4", "reports"],
  ["A5", "email"],
  ["A6", "tenant-provisioning"],
]);

export function validateManifest(manifest, repoRoot) {
  const errors = [];
  if (manifest?.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (
    manifest?.pilotSize?.minimum !== 3 ||
    manifest?.pilotSize?.maximum !== 5
  ) {
    errors.push("pilot size must be exactly 3-5");
  }
  if (manifest?.productionOrigin !== "https://restoreassist.app") {
    errors.push("production origin must be https://restoreassist.app");
  }

  const groups = Array.isArray(manifest?.groups) ? manifest.groups : [];
  const ids = new Set();
  for (const group of groups) {
    if (ids.has(group.id)) errors.push(`duplicate group ${group.id}`);
    ids.add(group.id);
    if (REQUIRED_GROUPS.get(group.id) !== group.name) {
      errors.push(`unexpected group ${group.id}:${group.name}`);
    }
    if (group.liveRequired !== true) {
      errors.push(`${group.id} must require live acceptance`);
    }
    if (!Array.isArray(group.tests) || group.tests.length === 0) {
      errors.push(`${group.id} must contain deterministic tests`);
    }
    for (const testPath of [
      ...(group.tests ?? []),
      ...(group.releaseOnlyTests ?? []),
    ]) {
      if (path.isAbsolute(testPath) || testPath.includes("..")) {
        errors.push(`${group.id} has unsafe test path ${testPath}`);
      } else if (!existsSync(path.join(repoRoot, testPath))) {
        errors.push(`${group.id} test does not exist: ${testPath}`);
      }
    }
  }
  for (const [id] of REQUIRED_GROUPS) {
    if (!ids.has(id)) errors.push(`missing required group ${id}`);
  }
  if (groups.length !== REQUIRED_GROUPS.size) {
    errors.push(`expected exactly ${REQUIRED_GROUPS.size} groups`);
  }
  return errors;
}

export function loadAndValidate(repoRoot) {
  const manifestPath = path.join(
    repoRoot,
    "docs/pilot/paid-pilot-launch/acceptance-manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return { manifest, errors: validateManifest(manifest, repoRoot) };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const { errors } = loadAndValidate(repoRoot);
  if (errors.length) {
    for (const error of errors) console.error(`[paid-pilot] ${error}`);
    process.exitCode = 1;
  } else {
    console.log("[paid-pilot] package manifest PASS");
  }
}
