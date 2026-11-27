#!/usr/bin/env node
// Library for scripts/ci/nexus-receipt/verdict.mjs (side-effect free; the entry
// always runs main(), per RA-7785). Reads the Codex review verdict JSON written by `codex exec --output-schema`
// and decides the nexus/release-receipt state. Fail-closed: anything that is not a
// well-formed PASS with zero P0/P1 findings is a failure.
//
// Usage:
//   node scripts/ci/nexus-receipt/verdict.mjs <verdict.json>
//     Prints `success|<description>` or `failure|<description>`; exit 0 / 1.
//   node scripts/ci/nexus-receipt/verdict.mjs --comment <verdict.json> <sha> <runUrl>
//     Prints the PR comment body.
//   node scripts/ci/nexus-receipt/verdict.mjs --scrub <verdict.json> [auth.json]
//     Rewrites the verdict with every credential string (from auth.json and
//     $OPENAI_API_KEY) replaced by [REDACTED], before anything is posted.
import { readFileSync, writeFileSync } from 'node:fs';

const BLOCKING = new Set(['P0', 'P1']);

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

export function scrub(text, secrets) {
  let s = text;
  for (const secret of secrets) s = s.split(secret).join('[REDACTED]');
  return s;
}

export function decide(raw) {
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return { state: 'failure', description: 'Codex verdict was not valid JSON' };
  }
  if (!v || typeof v !== 'object') {
    return { state: 'failure', description: 'Codex verdict was empty' };
  }
  const findings = Array.isArray(v.findings) ? v.findings : null;
  if (!findings) return { state: 'failure', description: 'Codex verdict had no findings list' };
  const blocking = findings.filter((f) => f && BLOCKING.has(String(f.severity).toUpperCase()));
  if (blocking.length > 0) {
    const first = String(blocking[0].title ?? 'unnamed finding').slice(0, 80);
    return {
      state: 'failure',
      description: `BLOCK reviewer=codex ${blocking.length} P0/P1: ${first}`,
    };
  }
  if (v.verdict !== 'PASS') {
    return {
      state: 'failure',
      description: `Codex verdict was ${String(v.verdict).slice(0, 20)}, not PASS`,
    };
  }
  return { state: 'success', description: `PASS reviewer=codex ci findings=${findings.length}` };
}

export const COMMENT_MARKER = '<!-- nexus-release-receipt -->';

// The PR comment the MacBook receipt runner reads to fix a blocked PR.
export function renderComment(raw, sha, runUrl) {
  const { state, description } = decide(raw);
  let findings = [];
  let summary = '';
  try {
    const v = JSON.parse(raw);
    findings = Array.isArray(v?.findings) ? v.findings : [];
    summary = typeof v?.summary === 'string' ? v.summary : '';
  } catch {
    /* decide() already reported the parse failure */
  }
  const clean = (s) =>
    String(s ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
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
  if (summary) lines.push('', `**Codex summary:** ${clean(summary)}`);
  if (findings.length) {
    lines.push('', '| Severity | Finding | File |', '| --- | --- | --- |');
    for (const f of findings)
      lines.push(`| ${clean(f?.severity)} | ${clean(f?.title)} | ${clean(f?.file)} |`);
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
export function main(argv = process.argv.slice(2)) {
  const [first, ...rest] = argv;
  if (first === '--scrub') {
    const [file, authFile] = rest;
    const raw = readOrEmpty(file);
    if (raw) {
      writeFileSync(
        file,
        scrub(raw, credentialStrings(readOrEmpty(authFile), [process.env.OPENAI_API_KEY]))
      );
    }
    return 0;
  }
  if (first === '--comment') {
    const [file, sha, runUrl] = rest;
    process.stdout.write(renderComment(readOrEmpty(file), sha, runUrl) + '\n');
    return 0;
  }
  const { state, description } = decide(readOrEmpty(first));
  process.stdout.write(`${state}|${description.slice(0, 140)}\n`);
  return state === 'success' ? 0 : 1;
}
