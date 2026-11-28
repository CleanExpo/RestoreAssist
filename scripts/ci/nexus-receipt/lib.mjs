// Library for scripts/ci/nexus-receipt/verdict.mjs. Side-effect free: the entry
// always runs main() (RA-7785). Decides the nexus/release-receipt state from the
// verdict JSON that `codex exec --output-schema` writes.
//
// TWO RULES THIS FILE EXISTS TO KEEP (UNI-3575 review, 28/11/2026)
//
// 1. Absent evidence is a failure. Success needs a Codex exit code that is
//    exactly the text "0", and a schema-valid PASS with zero P0/P1 findings.
//    Nothing on that path has a default: a missing, empty or malformed exit
//    code, a missing file and an unreadable verdict all fail. Do not add
//    `= '0'` or `?? '0'` anywhere here; "nobody recorded it" is not "it passed".
//
// 2. Nothing the model wrote is published. The commit status and the PR comment
//    are public, and the verdict is written by a model that ran next to a Codex
//    credential while reading untrusted pull-request content. A redaction pass
//    cannot make that text safe (a token split into spaced chunks walked past
//    one), so none of it is copied out. What is published is built only from:
//      - the fixed wording in this file;
//      - how many findings there are at each severity, capped at COUNT_CAP;
//      - the Codex exit code, when it is one to three digits;
//      - the head commit, when it is 40 lower-case hex characters;
//      - the run link, when it is this shape: an Actions run on github.com.
//    No finding title, file name or summary leaves the runner. To read them,
//    run the release-gate review locally on the same commit.
//    Known limit: the outcome and the capped counts are still chosen by the
//    model, so a review run can signal about 18 bits. That is accepted; it is
//    the smallest channel that still says how badly a PR is blocked.
//
// scrub() and --mask stay as a second layer for the verdict file on disk and
// the job log. No public output depends on them.
//
// Usage (via verdict.mjs):
//   verdict.mjs <verdict.json>
//     Prints `success|<description>` or `failure|<description>`; exit 0 / 1.
//     Reads CODEX_EXIT, which must be exactly "0" for a success.
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

const SEVERITY_ORDER = ['P0', 'P1', 'P2', 'P3'];
const SEVERITIES = new Set(SEVERITY_ORDER);
const BLOCKING = new Set(['P0', 'P1']);
// An unbroken run this long is not prose or a path segment; scrub() treats it
// as a possible encoded credential.
const LONG_TOKEN = /[A-Za-z0-9+=_-]{32,}/g;

// --- what may be published -------------------------------------------------
const COUNT_CAP = 20;
const EXIT_OK = '0';
const PRINTABLE_EXIT = /^[1-9][0-9]{0,2}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const RUN_URL =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}\/actions\/runs\/[0-9]{1,20}$/;

const shownCount = (n) => (n > COUNT_CAP ? `${COUNT_CAP}+` : String(n));

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

// Second layer only, for the file on disk. Scrubs decoded JSON values when the
// text parses, raw text otherwise. It is a deny-list and so it can be walked
// past; that is why nothing it produces is published (rule 2 above).
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
      // Keys too: a credential used as a property name must not survive.
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [scrubString(k, secrets), walk(x)])
      );
    }
    return v;
  };
  return JSON.stringify(walk(parsed));
}

// Mirrors schema.json. Returns one of the fixed strings below, or null when
// valid. It never echoes a field name or a value from the verdict.
export function schemaError(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'verdict is not an object';
  const keys = Object.keys(v).sort().join(',');
  if (keys !== 'findings,summary,verdict') return 'unexpected or missing fields';
  if (v.verdict !== 'PASS' && v.verdict !== 'BLOCK') return 'verdict is not PASS or BLOCK';
  if (typeof v.summary !== 'string') return 'summary is not a string';
  if (!Array.isArray(v.findings)) return 'findings is not a list';
  for (const f of v.findings) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return 'a finding is not an object';
    if (Object.keys(f).sort().join(',') !== 'file,severity,title')
      return 'a finding has bad fields';
    if (!SEVERITIES.has(f.severity)) return 'a finding has an unknown severity';
    if (typeof f.title !== 'string' || typeof f.file !== 'string') return 'a finding is malformed';
  }
  return null;
}

// The single place a verdict is judged. `counts` is set only when the review
// ran to the end and wrote a schema-valid verdict; it holds numbers, never text.
function assess(raw, codexExit) {
  if (codexExit !== EXIT_OK) {
    const printable = typeof codexExit === 'string' && PRINTABLE_EXIT.test(codexExit);
    return {
      state: 'failure',
      description: printable
        ? `Codex exited ${codexExit}`
        : 'Codex exit code missing or malformed; the review is not proven',
      counts: null,
    };
  }
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return { state: 'failure', description: 'Codex verdict was not valid JSON', counts: null };
  }
  const err = schemaError(v);
  if (err) return { state: 'failure', description: `Codex verdict invalid: ${err}`, counts: null };
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const f of v.findings) counts[f.severity] += 1;
  const blocking = SEVERITY_ORDER.filter((s) => BLOCKING.has(s)).reduce(
    (n, s) => n + counts[s],
    0
  );
  if (blocking > 0) {
    return {
      state: 'failure',
      description: `BLOCK reviewer=codex ${shownCount(blocking)} P0/P1 finding(s); finding text withheld`,
      counts,
    };
  }
  if (v.verdict !== 'PASS') {
    return { state: 'failure', description: 'Codex verdict was BLOCK', counts };
  }
  return {
    state: 'success',
    description: `PASS reviewer=codex ci findings=${shownCount(v.findings.length)}`,
    counts,
  };
}

// codexExit has no default on purpose (rule 1): leaving it out is a failure.
export function decide(raw, codexExit) {
  const { state, description } = assess(raw, codexExit);
  return { state, description };
}

export const COMMENT_MARKER = '<!-- nexus-release-receipt -->';

// The PR comment. Fixed wording and counts only (rule 2): it tells the reader
// how many findings block the PR, not what they say.
export function renderComment(raw, sha, runUrl, codexExit) {
  const { state, description, counts } = assess(raw, codexExit);
  const commit =
    typeof sha === 'string' && FULL_SHA.test(sha)
      ? `\`${sha.slice(0, 12)}\``
      : 'an unverified commit';
  const lines = [
    COMMENT_MARKER,
    `### Release receipt: ${state === 'success' ? 'PASS' : 'BLOCKED'} on ${commit}`,
    '',
    state === 'success'
      ? 'The earlier blocking findings are resolved. This PR has its receipt.'
      : `${description}.`,
  ];
  if (counts) {
    lines.push('', '| Severity | Findings |', '| --- | --- |');
    for (const s of SEVERITY_ORDER) lines.push(`| ${s} | ${shownCount(counts[s])} |`);
  }
  if (state !== 'success') {
    lines.push(
      '',
      counts
        ? 'Finding text is not posted: it is model output written next to a credential, so only counts leave the runner. Run the release-gate review on this commit locally to read the findings, fix every P0 and P1, and push; the review re-runs on the new commit.'
        : 'The review did not produce a usable verdict, so there is no receipt. Push a new commit or re-run this workflow to review again.'
    );
  }
  if (typeof runUrl === 'string' && RUN_URL.test(runUrl)) {
    lines.push('', `[Review run](${runUrl})`);
  }
  return lines.join('\n');
}

// A file that cannot be read is an empty verdict, which assess() refuses.
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
  const secretsFrom = (authFile) => credentialStrings(readOrEmpty(authFile), [env.OPENAI_API_KEY]);
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
  // No default (rule 1): an unset CODEX_EXIT stays undefined and fails.
  const codexExit = env.CODEX_EXIT;
  if (first === '--comment') {
    const [file, sha, runUrl] = rest;
    process.stdout.write(renderComment(readOrEmpty(file), sha, runUrl, codexExit) + '\n');
    return 0;
  }
  const { state, description } = decide(readOrEmpty(first), codexExit);
  process.stdout.write(`${state}|${description}\n`);
  return state === 'success' ? 0 : 1;
}
