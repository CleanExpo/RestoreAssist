#!/usr/bin/env node
/**
 * JEV triage — advisory only. Groups FAIL and INCONCLUSIVE cases into
 * clusters so a person reads tens of causes instead of thousands of rows.
 * It never changes a verdict; aggregate.mjs alone decides the run.
 *
 * Clustering here is deterministic (family, area, route stem, normalised
 * detail). Model triage (TypeSafe Jev) is DISABLED: it is metered spend that
 * has not been approved. When it is enabled it may see only the cluster
 * summaries this script writes (ids, routes, status codes, detail text with
 * ids stripped), never record content; the throwaway world is synthetic.
 *
 *   node triage.mjs            writes out/triage.json and out/triage.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JEV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(JEV, "out");

export function normalise(detail = "") {
  return detail
    .replace(/c[a-z0-9]{20,}/g, "<id>")
    .replace(/JEVSECRETA[A-Z0-9]+/g, "<markA>")
    .replace(/\b\d{3,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .slice(0, 140);
}

function stem(route = "") {
  const [method, p = ""] = route.split(" ");
  return `${method} ${p.split("/").slice(0, 4).join("/")}`;
}

const clusters = new Map();
for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((x) => /^J\d+\.jsonl$/.test(x)) : []) {
  for (const line of fs.readFileSync(path.join(OUT, f), "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line);
    if (r.kind !== "case" || (r.state !== "FAIL" && r.state !== "INCONCLUSIVE")) continue;
    const key = `${r.family}|${r.state}|${r.area}|${stem(r.route)}|${normalise(r.detail).replace(/ on (empty|malformed|swap) payload/, "")}`;
    const c = clusters.get(key) ?? { family: r.family, state: r.state, area: r.area, stem: stem(r.route), detail: normalise(r.detail), count: 0, routes: new Set(), identities: new Set(), example: r.id };
    c.count++;
    if (r.route) c.routes.add(r.route);
    if (r.identity) c.identities.add(r.identity);
    clusters.set(key, c);
  }
}
const list = [...clusters.values()]
  .map((c) => ({ ...c, routes: [...c.routes].slice(0, 8), identities: [...c.identities] }))
  .sort((a, b) => (a.state === b.state ? b.count - a.count : a.state === "FAIL" ? -1 : 1));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "triage.json"), JSON.stringify({ model_triage: "DISABLED", clusters: list }, null, 2) + "\n");
const md = [
  "# JEV triage (advisory; verdicts come from aggregate.mjs)",
  "",
  "Model triage: DISABLED (metered, not approved).",
  "",
  "| # | Family | State | Area | Cases | Route stem | Detail | Example id |",
  "|---|---|---|---|---|---|---|---|",
  ...list.map((c, i) => `| ${i + 1} | ${c.family} | ${c.state} | ${c.area} | ${c.count} | \`${c.stem}\` | ${c.detail.replace(/\|/g, "/")} | \`${c.example.slice(0, 90)}\` |`),
  "",
].join("\n");
fs.writeFileSync(path.join(OUT, "triage.md"), md);
console.log(`${list.length} clusters (${list.filter((c) => c.state === "FAIL").length} FAIL) -> out/triage.md; model triage DISABLED`);
