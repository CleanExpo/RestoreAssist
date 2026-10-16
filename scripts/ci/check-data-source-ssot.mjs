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
 * Usage:  node scripts/ci/check-data-source-ssot.mjs [--strict] [--schema <path>]
 * Exit 0 always (advisory by default). Pass --strict to exit 1 on any hit.
 * --schema reads another schema file (the tests use it); the allowlist is
 * always this repo's.
 *
 * See .claude/skills/data-source-ssot/SKILL.md.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaFlag = process.argv.indexOf("--schema");
const SCHEMA =
  schemaFlag > -1 && process.argv[schemaFlag + 1]
    ? process.argv[schemaFlag + 1]
    : join(ROOT, "prisma", "schema.prisma");

// Fields present on nearly every model — ignore them when measuring overlap.
const BOILERPLATE = new Set(["id", "createdAt", "updatedAt", "deletedAt"]);
const OVERLAP_RATIO = 0.6; // shared / smaller field-set
const MIN_SHARED = 6; // absolute floor so tiny models don't false-positive

/** A schema line without its `//` comment (a `//` inside a string literal stays). */
function stripComment(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && line[i - 1] !== "\\") quoted = !quoted;
    else if (!quoted && line[i] === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

function parseModels(src) {
  const models = [];
  const modelNames = new Set([...src.matchAll(/^model\s+(\w+)/gm)].map((x) => x[1]));
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, name, body] = m;
    const fields = new Set();
    // relation object -> its FK scalar list ("a,b"), for @relation(fields: [...])
    const relationFks = new Map();
    let uniqueKey = null;
    for (const raw of body.split("\n")) {
      // Comments carry no schema meaning; stripping them first means a comment
      // cannot fake relation metadata or a @unique key.
      const line = stripComment(raw).trim();
      if (!line || line.startsWith("@@")) continue;
      const [field, type = ""] = line.split(/\s+/);
      if (!/^[a-zA-Z_]\w*$/.test(field)) continue;
      if (!BOILERPLATE.has(field)) fields.add(field);
      if (/@unique/.test(line)) uniqueKey = field;
      const fk = line.match(/@relation\([^)]*\bfields\s*:\s*\[([^\]]*)\]/);
      if (fk && modelNames.has(type.replace(/[?[\]]/g, ""))) {
        relationFks.set(field, fk[1].split(",").map((s) => s.trim()).sort().join(","));
      }
    }
    models.push({ name, fields, relationFks, uniqueKey });
  }
  return models;
}

/**
 * Shared field names, counting each shared parent link once. A relation
 * object and its FK scalar are one link; when both models carry the same
 * relation through the same, shared FK scalars, the pair counted it twice
 * (PortalInvitation vs Inspection, 16/10/2026). Relations with no FK scalar
 * (implicit many-to-many lists) and relations through differently named FKs
 * are not deduplicated: they are still shared data.
 */
function shared(a, b) {
  let n = 0;
  for (const f of a.fields) if (b.fields.has(f)) n++;
  for (const [relation, fks] of a.relationFks) {
    if (
      b.relationFks.get(relation) === fks &&
      fks.split(",").every((f) => a.fields.has(f) && b.fields.has(f))
    ) {
      n--;
    }
  }
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
    const s = shared(a, b);
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
