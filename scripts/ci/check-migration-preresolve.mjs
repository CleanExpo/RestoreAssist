// RA-7502 — the CONCURRENTLY pre-resolve list must agree everywhere it is written.
//
// CI marks every migration that uses `CONCURRENTLY` as `--applied` before
// `prisma migrate deploy`, because Prisma wraps each migration in a
// transaction and CONCURRENTLY cannot run inside one. That list is written by
// hand in six places. If a new CONCURRENTLY migration lands and one copy is
// missed, that job's `migrate deploy` leaves a failed row and every later run
// goes red with P3009, which names the migration rather than the stale list.
//
// This check discovers every `migrate resolve --applied` site under .github/
// and scripts/, and fails when:
//   - the number of sites is not EXPECTED_SITE_COUNT (a copy was added or lost),
//   - the copies do not list the same migrations,
//   - a copy omits a migration whose SQL has an executable CONCURRENTLY,
//   - a copy lists a migration that does not need it, or is not on disk.
//
// Comments, strings, quoted identifiers and $$ bodies are blanked before
// matching. 20260516000000_inspection_close_
// terminal_state mentions CONCURRENTLY only in a comment and must NOT be
// listed: marking it applied would skip real column ADDs.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const EXPECTED_SITE_COUNT = 6;

const SCAN_DIRS = [".github", "scripts"];
const APPLIED_RE = /migrate\s+resolve\s+--applied\s+(\S+)/;

/**
 * The SQL that can actually execute as a statement. `--` line comments,
 * (nesting) block comments, string literals (including E'...' with backslash
 * escapes and doubled '' quotes), double-quoted identifiers and dollar-quoted
 * bodies ($$...$$ and $tag$...$tag$) are each replaced by a space, in one
 * pass, so a `--` inside a string cannot start a comment and a quote inside
 * a comment cannot start a string.
 *
 * Dropping whole dollar-quoted bodies is correct, not a shortcut: Postgres
 * refuses CONCURRENTLY inside a function or DO block, because it cannot run
 * inside a transaction block, so text in a body never needs pre-resolving.
 * @param {string} sql
 */
export function executableSql(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      out += " ";
      continue;
    }
    if (ch === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      out += " ";
      continue;
    }
    if (ch === "'" || ch === '"') {
      const backslashEscapes =
        ch === "'" && /[Ee]/.test(sql[i - 1] ?? "") && !/\w/.test(sql[i - 2] ?? "");
      let j = i + 1;
      while (j < sql.length) {
        if (backslashEscapes && sql[j] === "\\") {
          j += 2;
        } else if (sql[j] === ch && sql[j + 1] === ch) {
          j += 2;
        } else if (sql[j] === ch) {
          j++;
          break;
        } else {
          j++;
        }
      }
      out += " ";
      i = j;
      continue;
    }
    if (ch === "$" && !/\w/.test(sql[i - 1] ?? "")) {
      const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? sql.length : end + tag[0].length;
        out += " ";
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Names of migrations whose executable SQL (see executableSql) contains the
 * bare word CONCURRENTLY (covers CREATE [UNIQUE] INDEX and DROP INDEX alike).
 * @param {{ name: string, sql: string }[]} migrations
 */
export function requiredMigrations(migrations) {
  return migrations
    .filter((m) => /\bCONCURRENTLY\b/i.test(executableSql(m.sql)))
    .map((m) => m.name)
    .sort();
}

function unquote(token) {
  return token.replace(/[;\\]+$/, "").replace(/^["']|["']$/g, "");
}

/** Items of a shell `for VAR in ...; do` header starting at line index `start`. */
function forLoopItems(lines, start) {
  let text = "";
  for (let k = start; k < lines.length; k++) {
    text += " " + lines[k].replace(/\\\s*$/, "");
    if (/;\s*do\b|^\s*do\b/.test(lines[k])) break;
  }
  const m = /\bfor\s+\w+\s+in\s+([\s\S]*?);?\s*do\b/.exec(text);
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
}

function arrayItems(lines, name) {
  const start = lines.findIndex((l) => new RegExp(`^\\s*${name}=\\(`).test(l));
  if (start === -1) return null;
  let text = "";
  for (let k = start; k < lines.length; k++) {
    text += " " + lines[k];
    if (lines[k].includes(")")) break;
  }
  const m = /=\(([\s\S]*?)\)/.exec(text);
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : null;
}

/**
 * Every pre-resolve site. A site is either a run of consecutive lines that
 * each resolve a literal migration name, or a loop whose body resolves
 * `$var` — in which case the names come from the loop header or the array
 * it iterates. A `$var` site that cannot be resolved is an error, never a skip.
 * @param {{ path: string, text: string }[]} files
 * @returns {{ file: string, line: number, names: string[] }[]}
 */
export function extractSites(files) {
  const sites = [];
  for (const { path, text } of files) {
    const lines = text.split("\n");
    let current = null;
    lines.forEach((line, idx) => {
      const m = /^\s*#/.test(line) ? null : APPLIED_RE.exec(line);
      if (!m) {
        current = null;
        return;
      }
      const token = unquote(m[1]);
      if (!token.startsWith("$")) {
        if (!current) {
          current = { file: path, line: idx + 1, names: [] };
          sites.push(current);
        }
        current.names.push(token);
        return;
      }
      current = null;
      const variable = token.replace(/^\$\{?|\}$/g, "");
      let names = null;
      let at = idx + 1;
      for (let k = idx; k >= 0; k--) {
        if (new RegExp(`\\bfor\\s+${variable}\\s+in\\b`).test(lines[k])) {
          at = k + 1;
          const items = forLoopItems(lines, k);
          const arr = items.length === 1 && /^"?\$\{(\w+)\[@\]\}"?$/.exec(items[0]);
          names = arr ? arrayItems(lines, arr[1]) : items;
          break;
        }
      }
      if (!names || names.length === 0 || names.some((n) => n.includes("$"))) {
        throw new Error(
          `${path}:${idx + 1}: cannot resolve the migration names behind ${token}`,
        );
      }
      sites.push({ file: path, line: at, names: names.map(unquote) });
    });
  }
  return sites;
}

/**
 * @param {{ files: { path: string, text: string }[], migrations: { name: string, sql: string }[], expectedSites?: number }} input
 * @returns {{ sites: ReturnType<typeof extractSites>, required: string[], problems: string[] }}
 */
export function checkPreresolve({ files, migrations, expectedSites = EXPECTED_SITE_COUNT }) {
  const sites = extractSites(files);
  const required = requiredMigrations(migrations);
  const onDisk = new Set(migrations.map((m) => m.name));
  const problems = [];

  if (sites.length !== expectedSites) {
    problems.push(
      `found ${sites.length} pre-resolve sites, expected ${expectedSites}: ` +
        sites.map((s) => `${s.file}:${s.line}`).join(", "),
    );
  }

  const key = (names) => [...new Set(names)].sort().join(",");
  if (new Set(sites.map((s) => key(s.names))).size > 1) {
    problems.push(
      "pre-resolve copies disagree:\n" +
        sites.map((s) => `  ${s.file}:${s.line} -> ${key(s.names)}`).join("\n"),
    );
  }

  for (const s of sites) {
    for (const name of required) {
      if (!s.names.includes(name)) {
        problems.push(`${s.file}:${s.line} omits ${name}, which runs CONCURRENTLY`);
      }
    }
    for (const name of s.names) {
      if (!onDisk.has(name)) {
        problems.push(`${s.file}:${s.line} lists ${name}, which is not in prisma/migrations`);
      } else if (!required.includes(name)) {
        problems.push(
          `${s.file}:${s.line} lists ${name}, which has no executable CONCURRENTLY`,
        );
      }
    }
  }
  return { sites, required, problems };
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Read the real repository rooted at `root`. */
export function readRepo(root) {
  const files = SCAN_DIRS.flatMap((d) => walk(join(root, d), [])).map((full) => ({
    path: relative(root, full).split("\\").join("/"),
    text: readFileSync(full, "utf8"),
  }));
  const migDir = join(root, "prisma", "migrations");
  const migrations = readdirSync(migDir)
    .filter((name) => existsSync(join(migDir, name, "migration.sql")))
    .map((name) => ({ name, sql: readFileSync(join(migDir, name, "migration.sql"), "utf8") }));
  return { files, migrations };
}

if (process.argv[1]?.endsWith("check-migration-preresolve.mjs")) {
  const { sites, required, problems } = checkPreresolve(readRepo(process.cwd()));
  if (problems.length > 0) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exitCode = 1;
  } else {
    console.log(
      `CONCURRENTLY pre-resolve list agrees: ${sites.length} sites, ${required.length} migrations (${required.join(", ")})`,
    );
  }
}
