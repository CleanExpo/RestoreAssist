#!/usr/bin/env node
/**
 * check-data-source-ssot — front-foot detector for the tenancy-key-drift class.
 *
 * Parses prisma/schema.prisma and reports model PAIRS that share a high fraction
 * of field names but carry DIFFERENT single-field `@unique` keys — the exact
 * signature of RA-7026 (OrganizationPricingConfig[organizationId] vs
 * CompanyPricingConfig[userId]: field-identical, differently keyed, silently
 * divergent). A hit is a candidate, not a proven bug: each MUST have ONE
 * documented resolver both readers call, or it is drift.
 *
 * Usage:  node scripts/ci/check-data-source-ssot.mjs
 * Exit 0 always (advisory by default). Pass --strict to exit 1 on any hit.
 *
 * See .claude/skills/data-source-ssot/SKILL.md.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");

// Fields present on nearly every model — ignore them when measuring overlap.
const BOILERPLATE = new Set(["id", "createdAt", "updatedAt", "deletedAt"]);
const OVERLAP_RATIO = 0.6; // shared / smaller field-set
const MIN_SHARED = 6; // absolute floor so tiny models don't false-positive

function parseModels(src) {
  const models = [];
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, name, body] = m;
    const fields = new Set();
    let uniqueKey = null;
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const field = line.split(/\s+/)[0];
      if (!/^[a-zA-Z_]\w*$/.test(field)) continue;
      if (!BOILERPLATE.has(field)) fields.add(field);
      if (/@unique/.test(line)) uniqueKey = field;
    }
    models.push({ name, fields, uniqueKey });
  }
  return models;
}

function shared(a, b) {
  let n = 0;
  for (const f of a) if (b.has(f)) n++;
  return n;
}

const models = parseModels(readFileSync(SCHEMA, "utf8"));
const hits = [];
for (let i = 0; i < models.length; i++) {
  for (let j = i + 1; j < models.length; j++) {
    const a = models[i];
    const b = models[j];
    if (!a.uniqueKey || !b.uniqueKey) continue;
    if (a.uniqueKey === b.uniqueKey) continue; // same key → not tenancy drift
    const s = shared(a.fields, b.fields);
    const smaller = Math.min(a.fields.size, b.fields.size);
    if (smaller === 0) continue;
    if (s >= MIN_SHARED && s / smaller >= OVERLAP_RATIO) {
      hits.push({ a, b, s, ratio: (s / smaller) * 100 });
    }
  }
}

// Allowlist: pairs already reconciled by ONE documented resolver. A gate should
// fail only on a NEW unresolved pair, not on ones we've already unified.
const ALLOWLIST = join(
  dirname(fileURLToPath(import.meta.url)),
  "data-source-ssot-allowlist.json",
);
let allow = [];
try {
  const raw = JSON.parse(readFileSync(ALLOWLIST, "utf8"));
  allow = (raw.pairs ?? []).map((p) => [...p.models].sort().join("|"));
} catch {
  // no allowlist → every hit is treated as a violation
}
const pairKey = (h) => [h.a.name, h.b.name].sort().join("|");
const known = hits.filter((h) => allow.includes(pairKey(h)));
const violations = hits.filter((h) => !allow.includes(pairKey(h)));

const strict = process.argv.includes("--strict");
for (const h of known) {
  console.log(
    `  (allowlisted) ${h.a.name} ↔ ${h.b.name} — reconciled by a documented resolver`,
  );
}

if (violations.length === 0) {
  console.log(
    `check-data-source-ssot - OK. ${known.length} allowlisted pair(s), no NEW tenancy-key drift.`,
  );
  process.exit(0);
}

console.log(
  `\ncheck-data-source-ssot - ${violations.length} NEW pair(s) sharing data across different keys:\n`,
);
for (const h of violations) {
  console.log(
    `  • ${h.a.name}[@unique ${h.a.uniqueKey}]  ↔  ${h.b.name}[@unique ${h.b.uniqueKey}]` +
      `  — ${h.s} shared fields (${h.ratio.toFixed(0)}% of the smaller model)`,
  );
}
console.log(
  "\nGive the pair ONE documented resolver every reader calls " +
    "(see .claude/skills/data-source-ssot/SKILL.md), then add it to " +
    "scripts/ci/data-source-ssot-allowlist.json. Otherwise it is silent drift.",
);
process.exit(strict ? 1 : 0);
