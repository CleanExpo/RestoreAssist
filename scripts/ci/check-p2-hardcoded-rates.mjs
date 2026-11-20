import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const TARGET_DIRS = ["app/api", "lib/nir-cost-estimation.ts", "lib/billing"];

const FORBIDDEN = [
  /\brate:\s*50\b/,
  /\bunitPrice:\s*5000\b/,
  /\bsuggestedRate:\s*50\b/,
];

function walk(dir, out = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    out.push(dir);
    return out;
  }
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [];
for (const t of TARGET_DIRS) {
  const abs = join(ROOT, t);
  const st = statSync(abs, { throwIfNoEntry: false });
  if (st?.isFile()) files.push(abs);
  else if (st?.isDirectory()) walk(abs, files);
}

const failures = [];
for (const file of files) {
  const rel = file.replace(ROOT + "/", "");
  if (rel.includes(".test.") || rel.includes("__tests__")) continue;
  const src = readFileSync(file, "utf8");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(src)) failures.push(`${rel}: ${pattern}`);
  }
}

if (failures.length) {
  console.error("P2 hardcoded rate guard failed:\n" + failures.join("\n"));
  process.exit(1);
}

console.log(`P2 hardcoded rate guard passed (${files.length} files scanned).`);
