// Library for scripts/ci/nexus-receipt/verdict.mjs. Side-effect free: the entry
// always runs main() (RA-7785). Decides the nexus/release-receipt state from the
// verdict JSON that `codex exec --output-schema` writes. Fail-closed: anything
// that is not a schema-valid PASS, with zero P0/P1 findings and a zero Codex
// exit code, is a failure.
//
// Usage (via verdict.mjs):
//   verdict.mjs <verdict.json>
//     Prints `success|<description>` or `failure|<description>`; exit 0 / 1.
//     Reads CODEX_EXIT: anything other than "0" is a failure, even with a PASS
//     file on disk (a run that crashed after writing it).
//   verdict.mjs --comment <verdict.json> <sha> <runUrl>
//     Prints the PR comment body.
//   verdict.mjs --scrub <file> [auth.json]
//     Rewrites <file> with every credential string (from auth.json and
//     $OPENAI_API_KEY) and every long token-like run redacted. JSON is parsed
//     and scrubbed value by value, so a \u-escaped secret cannot slip through.
//   verdict.mjs --mask [auth.json]
//     Prints `::add-mask::<value>` for every credential string, so the runner
//     masks each one individually (a JSON secret is not masked per value).
import { readFileSync, writeFileSync } from 'node:fs';

const BLOCKING = new Set(['P0', 'P1']);
const SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
// An unbroken run this long is not prose or a path segment; treat it as a
// possible encoded credential and never publish it.
const LONG_TOKEN = /[A-Za-z0-9+=_-]{32,}/g;

// Every string of 16+ characters anywhere in a parsed credential file.
export function credentialStrings(authRaw, extra = []) {
  const out = new Set(extra.filter((s) => typeof s === 'string' && s.length >= 16));
  const walk = (v) => {
    if (typeof v === 'string') {
      if (v.length >= 16) out.add(v);
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v)) walk(x);
    }
  };
  try {
    walk(JSON.parse(authRaw));
  } catch {
    /* no or unreadable auth.json: only the extras are scrubbed */
  }
  return [...out];
}

export function scrubString(s, secrets) {
  let out = String(s);
  for (const secret of secrets) out = out.split(secret).join('[REDACTED]');
  return out.replace(LONG_TOKEN, '[REDACTED]');
}

// Scrubs decoded JSON values when the text parses, raw text otherwise.
export function scrub(text, secrets) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return scrubString(text, secrets);
  }
  const walk = (v) => {
    if (typeof v === 'string') return scrubString(v, secrets);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return JSON.stringify(walk(parsed));
}

// Mirrors schema.json. Returns an error string, or null when valid.
export function schemaError(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'verdict is not an object';
  const keys = Object.keys(v).sort().join(',');
  if (keys !== 'findings,summary,verdict') return `unexpected fields (${keys.slice(0, 40)})`;
  if (v.verdict !== 'PASS' && v.verdict !== 'BLOCK') return 'verdict is not PASS or BLOCK';
  if (typeof v.summary !== 'string') return 'summary is not a string';
  if (!Array.isArray(v.findings)) return 'findings is not a list';
  for (const f of v.findings) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return 'a finding is not an object';
    if (Object.keys(f).sort().join(',') !== 'file,severity,title') return 'a finding has bad fields';
    if (!SEVERITIES.has(f.severity)) return 'a finding has an unknown severity';
    if (typeof f.title !== 'string' || typeof f.file !== 'string') return 'a finding is malformed';
  }
  return null;
}

export function decide(raw, codexExit = '0') {
  if (String(codexExit) !== '0') {
    return { state: 'failure', description: `Codex exited ${String(codexExit).slice(0, 10)}` };
  }
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return { state: 'failure', description: 'Codex verdict was not valid JSON' };
  }
  const err = schemaError(v);
  if (err) return { state: 'failure', description: `Codex verdict invalid: ${err}` };
  const blocking = v.findings.filter((f) => BLOCKING.has(f.severity));
  if (blocking.length > 0) {
    const first = blocking[0].title.slice(0, 80);
    return {
      state: 'failure',
      description: `BLOCK reviewer=codex ${blocking.length} P0/P1: ${first}`,
    };
  }
  if (v.verdict !== 'PASS') return { state: 'failure', description: 'Codex verdict was BLOCK' };
  return { state: 'success', description: `PASS reviewer=codex ci findings=${v.findings.length}` };
}

export const COMMENT_MARKER = '<!-- nexus-release-receipt -->';

// The PR comment the MacBook receipt runner reads to fix a blocked PR. It carries
// severity, title and file only: no free-text summary, to keep the channel narrow.
export function renderComment(raw, sha, runUrl, codexExit = '0') {
  const { state, description } = decide(raw, codexExit);
  let findings = [];
  try {
    const v = JSON.parse(raw);
    if (!schemaError(v)) findings = v.findings;
  } catch {
    /* decide() already reported the parse failure */
  }
  const clean = (s) =>
    String(s ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  const lines = [
    COMMENT_MARKER,
    state === 'success'
      ? `### Release receipt: PASS on \`${String(sha).slice(0, 12)}\``
      : `### Release receipt: BLOCKED on \`${String(sha).slice(0, 12)}\``,
    '',
    state === 'success'
      ? 'The earlier blocking findings are resolved. This PR has its receipt.'
      : `${clean(description)}. Fix the P0/P1 findings below and push; the review re-runs on the new commit.`,
  ];
  if (findings.length) {
    lines.push('', '| Severity | Finding | File |', '| --- | --- | --- |');
    for (const f of findings) {
      lines.push(`| ${clean(f.severity)} | ${clean(f.title)} | ${clean(f.file)} |`);
    }
  }
  lines.push('', `[Review run](${runUrl})`);
  return lines.join('\n');
}

function readOrEmpty(p) {
  try {
    return p ? readFileSync(p, 'utf8') : '';
  } catch {
    return '';
  }
}

// Returns the process exit code. argv is process.argv.slice(2).
export function main(argv = process.argv.slice(2), env = process.env) {
  const [first, ...rest] = argv;
  const secretsFrom = (authFile) =>
    credentialStrings(readOrEmpty(authFile), [env.OPENAI_API_KEY]);
  if (first === '--mask') {
    for (const s of secretsFrom(rest[0])) process.stdout.write(`::add-mask::${s}\n`);
    return 0;
  }
  if (first === '--scrub') {
    const [file, authFile] = rest;
    const raw = readOrEmpty(file);
    if (raw) writeFileSync(file, scrub(raw, secretsFrom(authFile)));
    return 0;
  }
  const codexExit = env.CODEX_EXIT ?? '0';
  if (first === '--comment') {
    const [file, sha, runUrl] = rest;
    process.stdout.write(renderComment(readOrEmpty(file), sha, runUrl, codexExit) + '\n');
    return 0;
  }
  const { state, description } = decide(readOrEmpty(first), codexExit);
  process.stdout.write(`${state}|${description.slice(0, 140)}\n`);
  return state === 'success' ? 0 : 1;
}
