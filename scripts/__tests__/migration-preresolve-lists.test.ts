import { describe, expect, it } from "vitest";
import {
  EXPECTED_SITE_COUNT,
  checkPreresolve,
  readRepo,
  requiredMigrations,
} from "../ci/check-migration-preresolve.mjs";

// RA-7502 — the CONCURRENTLY pre-resolve list is hand-written in six places.
// These tests hold the copies to each other and to prisma/migrations.

const A = "20260101_a_index";
const B = "20260102_b_index";

const yamlSite = (names: string[]) =>
  "      - name: Pre-resolve\n        run: |\n" +
  names.map((n) => `          npx --no-install prisma migrate resolve --applied ${n}\n`).join("") +
  "        env:\n";

const loopSite = (names: string[]) =>
  "for mig in \\\n" +
  names.map((n, i) => `  ${n}${i === names.length - 1 ? "; do" : " \\"}\n`).join("") +
  '  npx --no-install prisma migrate resolve --applied "$mig" >/dev/null 2>&1 || true\ndone\n';

const arraySite = (names: string[]) =>
  `PRE_RESOLVED=(\n${names.map((n) => `  ${n}\n`).join("")})\n` +
  'for mig in "${PRE_RESOLVED[@]}"; do\n' +
  '  npx --no-install prisma migrate resolve --applied "$mig"\ndone\n';

function fixture(copies: string[][]) {
  const makers = [yamlSite, yamlSite, yamlSite, yamlSite, loopSite, arraySite];
  return copies.map((names, i) => ({
    path: `copy-${i + 1}`,
    text: makers[i % makers.length](names),
  }));
}

const migrations = [
  { name: A, sql: "CREATE INDEX CONCURRENTLY a ON t (x);" },
  { name: B, sql: "DROP INDEX CONCURRENTLY IF EXISTS b;" },
  { name: "20260103_plain", sql: "ALTER TABLE t ADD COLUMN y INT;" },
];
const seven = (names: string[]) => Array.from({ length: 7 }, () => names);

describe("CONCURRENTLY pre-resolve lists (RA-7502)", () => {
  it("accepts seven agreeing copies of every form", () => {
    const result = checkPreresolve({ files: fixture(seven([A, B])), migrations });
    expect(result.sites).toHaveLength(7);
    expect(result.problems).toEqual([]);
  });

  it("names the one copy that is missing an entry", () => {
    const copies = seven([A, B]);
    copies[4] = [A];
    const { problems } = checkPreresolve({ files: fixture(copies), migrations });
    expect(problems.join("\n")).toContain("pre-resolve copies disagree");
    expect(problems).toContain(`copy-5:1 omits ${B}, which runs CONCURRENTLY`);
  });

  it("flags a CONCURRENTLY migration on disk that no copy lists", () => {
    const extra = [...migrations, { name: "20260104_c", sql: "CREATE UNIQUE INDEX CONCURRENTLY c ON t (z);" }];
    const { problems } = checkPreresolve({ files: fixture(seven([A, B])), migrations: extra });
    expect(problems).toHaveLength(7);
    expect(problems[0]).toContain("omits 20260104_c");
  });

  it("does not require a migration that mentions CONCURRENTLY only in comments", () => {
    const commentOnly = {
      name: "20260105_comment_only",
      sql:
        "-- The CREATE INDEX CONCURRENTLY lives in the sibling migration.\n" +
        "/* CONCURRENTLY /* nested CONCURRENTLY */ still a comment */\n" +
        "ALTER TABLE t ADD COLUMN note TEXT DEFAULT '-- not a comment';\n",
    };
    expect(requiredMigrations([commentOnly])).toEqual([]);
    const { problems } = checkPreresolve({
      files: fixture(seven([A, B])),
      migrations: [...migrations, commentOnly],
    });
    expect(problems).toEqual([]);
  });

  it("does not require a migration whose CONCURRENTLY is inside a string, identifier or $$ body", () => {
    const cases = [
      { name: "string_default", sql: "ALTER TABLE t ADD COLUMN note TEXT DEFAULT 'use CONCURRENTLY carefully';" },
      { name: "escape_string", sql: "ALTER TABLE t ADD COLUMN n TEXT DEFAULT E'it\\'s CONCURRENTLY';" },
      { name: "doubled_quote", sql: "ALTER TABLE t ADD COLUMN n TEXT DEFAULT 'it''s CONCURRENTLY';" },
      { name: "quoted_identifier", sql: 'ALTER TABLE t ADD COLUMN "CONCURRENTLY" TEXT;' },
      { name: "do_block", sql: "DO $$ BEGIN RAISE NOTICE 'CONCURRENTLY'; END $$;" },
      { name: "tagged_body", sql: "CREATE FUNCTION f() RETURNS void AS $fn$ BEGIN PERFORM 'CONCURRENTLY'; END $fn$ LANGUAGE plpgsql;" },
    ];
    expect(requiredMigrations(cases)).toEqual([]);
  });

  it("does not require a migration whose only CONCURRENTLY is bare text inside a $$ or $tag$ body", () => {
    const cases = [
      { name: "bare_in_dollar", sql: "DO $$ BEGIN\n  CREATE INDEX CONCURRENTLY x ON t (y);\nEND $$;" },
      { name: "bare_in_tag", sql: "CREATE FUNCTION f() RETURNS void AS $fn$\n  DROP INDEX CONCURRENTLY x;\n$fn$ LANGUAGE sql;" },
    ];
    expect(requiredMigrations(cases)).toEqual([]);
  });

  it("refuses to guess when a migration leaves a string, comment or $$ body unterminated", () => {
    const cannot = (name: string, sql: string, kind: string) =>
      expect(() => requiredMigrations([{ name, sql }])).toThrow(
        `cannot parse prisma/migrations/${name}/migration.sql: unterminated ${kind}`,
      );
    // Without E, \' does not escape: the string closes early and the trailing ' is left open.
    cannot("non_e_backslash", "ALTER TABLE t ADD COLUMN n TEXT DEFAULT 'it\\'s CONCURRENTLY fine';\nALTER TABLE t ADD COLUMN o INT;", "string");
    cannot("open_quote", "ALTER TABLE t ADD COLUMN n TEXT DEFAULT 'x;\nCREATE INDEX CONCURRENTLY a ON t (n);", "string");
    cannot("open_ident", 'CREATE INDEX "a ON t (x);\nCREATE INDEX CONCURRENTLY b ON t (y);', "quoted identifier");
    cannot("open_dollar", "DO $$ BEGIN NULL;\nCREATE INDEX CONCURRENTLY a ON t (x);", "dollar-quoted body");
    cannot("open_block", "/* note\nCREATE INDEX CONCURRENTLY a ON t (x);", "block comment");
  });

  it("still requires every executable CONCURRENTLY form", () => {
    expect(
      requiredMigrations([
        { name: "create", sql: "CREATE INDEX CONCURRENTLY a ON t (x);" },
        { name: "unique", sql: "CREATE UNIQUE INDEX CONCURRENTLY b ON t (y);" },
        { name: "drop", sql: 'DROP INDEX CONCURRENTLY IF EXISTS "c";' },
        { name: "after_string", sql: "ALTER TABLE t ADD COLUMN n TEXT DEFAULT 'x'; CREATE INDEX CONCURRENTLY d ON t (n);" },
        { name: "after_body", sql: "DO $$ BEGIN NULL; END $$;\nCREATE INDEX CONCURRENTLY e ON t (x);" },
      ]),
    ).toEqual(["after_body", "after_string", "create", "drop", "unique"]);
  });

  it("does not let a -- inside a string swallow the rest of the line", () => {
    expect(
      requiredMigrations([
        { name: "dash_string", sql: "ALTER TABLE t ADD COLUMN n TEXT DEFAULT '--'; CREATE INDEX CONCURRENTLY x ON t (n);" },
        { name: "dash_ident", sql: 'CREATE INDEX "a--b" ON t (x); DROP INDEX CONCURRENTLY y;' },
      ]),
    ).toEqual(["dash_ident", "dash_string"]);
  });

  it("flags a listed migration that is not on disk", () => {
    const { problems } = checkPreresolve({
      files: fixture(seven([A, B, "zz_not_a_real_migration"])),
      migrations,
    });
    expect(problems).toContain(
      "copy-1:3 lists zz_not_a_real_migration, which is not in prisma/migrations",
    );
  });

  it("fails when an eighth copy appears or one disappears", () => {
    expect(checkPreresolve({ files: fixture([...seven([A, B]), [A, B]]), migrations }).problems[0]).toContain(
      "found 8 pre-resolve sites, expected 7",
    );
    expect(checkPreresolve({ files: fixture(seven([A, B]).slice(1)), migrations }).problems[0]).toContain(
      "found 6 pre-resolve sites, expected 7",
    );
  });

  it("holds on the real repository: seven copies, all equal to the migrations that run CONCURRENTLY", () => {
    const { sites, required, problems } = checkPreresolve(readRepo(process.cwd()));
    expect(problems).toEqual([]);
    expect(sites).toHaveLength(EXPECTED_SITE_COUNT);
    expect(required.length).toBeGreaterThan(0);
    expect(required).not.toContain("20260516000000_inspection_close_terminal_state");
  });
});
