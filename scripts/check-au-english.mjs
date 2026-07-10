#!/usr/bin/env node
/**
 * Australian-English content guard — config-driven, estate-portable.
 *
 * CANONICAL COPY: CleanExpo/NEXUS · tools/au-english/check-au-english.mjs
 * Consumer repos copy this file verbatim into scripts/ and add a repo-root
 * `.au-english.json` naming which content files to scan. To change a rule
 * estate-wide, edit HERE, bump GUARD_VERSION, and re-sync the copies.
 *
 * Scans only the customer-facing content globs the repo opts into — never all
 * source — because US forms like `color:` (CSS), `text-center`, `onBehalfOf`
 * are legitimate in code. JSON string values and Markdown prose are scanned;
 * embedded HTML/CSS and fenced/inline code are stripped first.
 *
 * `.au-english.json`:
 *   { "include": ["data/locations/**\/*.json", "content/**\/*.mdx"],
 *     "exclude": ["**\/*.internal.json"] }
 *
 * No config file → the guard no-ops (exit 0), so it is safe to land before
 * a repo has opted in. Verified false positive? Commit with --no-verify.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const GUARD_VERSION = '1.0.0';
const CONFIG = '.au-english.json';

if (!existsSync(CONFIG)) {
  console.log(`✓ au-english guard v${GUARD_VERSION}: no ${CONFIG} — nothing opted in, skipping.`);
  process.exit(0);
}
const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
const include = cfg.include || [];
const exclude = cfg.exclude || [];
if (include.length === 0) {
  console.log(`✓ au-english guard v${GUARD_VERSION}: empty include list — skipping.`);
  process.exit(0);
}

// ── AU-English rules (verified in CARSI GP course-content gauntlet) ──────────
const RULES = [
  { re: /\bcolors?\b/i, msg: 'US spelling — use "colour".' },
  { re: /\bodors?\b/i, msg: 'US spelling — use "odour".' },
  { re: /\bbehaviors?\b/i, msg: 'US spelling — use "behaviour".' },
  { re: /\bmolds?\b/i, msg: 'US spelling — use "mould".' },
  { re: /\bmicrofibers?\b/i, msg: 'US spelling — use "microfibre".' },
  { re: /\bfiberglass\b/i, msg: 'US spelling — use "fibreglass".' },
  { re: /\bfibers?\b/i, msg: 'US spelling — use "fibre".' },
  { re: /\bcenters?\b/i, allowAfter: /^\s+for\s+(Disease\s+Control|Medicare|Medicaid)/i, msg: 'US spelling — use "centre".' },
  { re: /\bdefenses?\b/i, msg: 'US spelling — use "defence".' },
  { re: /\baluminum\b/i, msg: 'US spelling — use "aluminium".' },
  { re: /\bliters?\b/i, msg: 'US spelling — use "litre".' },
  { re: /\bfavor(s|ed|ite|able)?\b/i, msg: 'US spelling — use "favour(...)".' },
  { re: /\b1(?:10|15|20)\s?V(?:olts?)?\b/i, allowBefore: /US[\s-]?$/i, msg: 'US mains voltage — AU is 230 V / 50 Hz (label US specs "US-…" if contrasting).' },
  { re: /\bNEMA\b/, msg: 'US plug standard — use AS/NZS 3112 / 10 A GPO.' },
  // NB: amperage alone (15 A / 20 A circuit) is NOT a US tell — those circuits
  // exist in AU. The US signal is the voltage (110/115/120 V) or NEMA plugs.
].filter((r) => !r.skip);

function normalize(s) {
  return s
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

const findings = [];
function scan(text, file, path) {
  const t = normalize(text);
  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (!m) continue;
    const i = m.index ?? 0;
    if (rule.allowBefore && rule.allowBefore.test(t.slice(Math.max(0, i - 8), i))) continue;
    if (rule.allowAfter && rule.allowAfter.test(t.slice(i + m[0].length, i + m[0].length + 30))) continue;
    const ev = t.slice(Math.max(0, i - 30), i + m[0].length + 30).trim();
    findings.push(`  ${file}${path ? ' → ' + path : ''}: matched "${m[0]}" — ${rule.msg}\n    → …${ev}…`);
  }
}
function walkJson(node, file, path) {
  if (node == null) return;
  if (typeof node === 'string') return scan(node, file, path);
  if (Array.isArray(node)) return node.forEach((v, idx) => walkJson(v, file, `${path}[${idx}]`));
  if (typeof node === 'object') for (const [k, v] of Object.entries(node)) walkJson(v, file, path ? `${path}.${k}` : k);
}

// ── minimal glob → RegExp (supports ** / * / ?) ──────────────────────────────
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}
const incRe = include.map(globToRe);
const excRe = exclude.map(globToRe);
const matches = (f) => incRe.some((r) => r.test(f)) && !excRe.some((r) => r.test(f));

const tracked = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  .split('\n')
  .map((f) => f.trim())
  .filter((f) => f && matches(f));

let scanned = 0;
for (const file of tracked) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { continue; }
  scanned++;
  if (file.endsWith('.json')) {
    try { walkJson(JSON.parse(raw), file, ''); } catch { scan(raw, file, ''); }
  } else {
    scan(raw, file, '');
  }
}

if (findings.length > 0) {
  console.error(`\n✖ Australian-English content guard failed (v${GUARD_VERSION}, ${scanned} files)\n`);
  console.error('Content is Australian-produced. Fix these US forms:\n');
  console.error(findings.join('\n'));
  console.error('\nVerified false positive? Add an allow rule upstream, or git commit --no-verify\n');
  process.exit(1);
}
console.log(`✓ Australian-English content guard passed (v${GUARD_VERSION}, ${scanned} files scanned).`);
process.exit(0);
