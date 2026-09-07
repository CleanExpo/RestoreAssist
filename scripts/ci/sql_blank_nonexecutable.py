#!/usr/bin/env python3
"""Blank everything in a migration that the destructive-SQL match must not see.

Used by scripts/ci/migration-roundtrip.sh (additive-only mode). Every blanked
region is replaced space-for-space, newlines kept, so reported line numbers still
point at the real line.

This lives in a FILE rather than a heredoc on purpose. It used to be a
`python3 - "$f" <<'PYEOF'` inside a `$( )` command substitution, where bash
tracks quote parity through the heredoc body -- so a single apostrophe in a
COMMENT broke the whole script with a syntax error pointing at a case terminator
170 lines away. That trap was documented for one round and review round 5
(P2) was right that documenting it was not a fix: the next person to write
"grep's" on a machine with a different bash breaks CI. A file has no such rule.

Order matters, and each pass is here for a defect that was actually seen:

  block comments   /* DROP TABLE x */        was a false red
  string literals  VALUES ('DROP TABLE x')   was a false red
  line comments    -- DROP TABLE x           the original, only, pass
  exempt policies  DROP POLICY .. ON <new>   see below

NOT blanked, deliberately: dollar-quoted bodies ($$ .. $$, $tag$ .. $tag$).
They are the one place a destructive statement is both quoted AND executable --
`DO $$ BEGIN .. DROP TABLE x .. END $$` really does drop the table. Blanking
them to silence a hypothetical false red would open a hole big enough to drive
the whole check through. The cost is a false red on a DROP named inside a
function body's own error string, which a human resolves in seconds.
"""

import os
import re
import sys


def blank(match: "re.Match[str]") -> str:
    """Replace a region with spaces, preserving newlines and therefore line numbers."""
    return re.sub(r"[^\n]", " ", match.group(0))


# A Postgres identifier: quoted (with "" as an escaped quote) or bare.
IDENT = r'"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*'

EXEMPT_DROP_POLICY = re.compile(
    r"DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:" + IDENT + r")"
    r"\s+ON\s+(?:ONLY\s+)?"
    r"(?:(?:" + IDENT + r")\s*\.\s*)?"          # optional schema qualifier
    r"(?P<tbl>" + IDENT + r")",
    re.I,
)


def fold(token: str) -> str:
    """Fold an identifier exactly as Postgres does.

    Unquoted identifiers fold to lower case; quoted ones keep their case, and a
    doubled quote inside them is a single literal quote.
    """
    if token.startswith('"'):
        return token[1:-1].replace('""', '"')
    return token.lower()


def main() -> int:
    src = open(sys.argv[1], encoding="utf8").read()

    src = re.sub(r"/\*.*?\*/", blank, src, flags=re.S)          # block comments
    src = re.sub(r"'(?:[^']|'')*'", blank, src, flags=re.S)     # string literals
    src = re.sub(r"--[^\n]*", blank, src)                       # line comments

    # The DROP POLICY exemption, applied as a STATEMENT-level blanking rather
    # than as a filter over the later grep output lines.
    #
    # Postgres has no CREATE POLICY IF NOT EXISTS, so drop-then-create is how an
    # idempotent policy migration is written -- but the exemption must not extend
    # to a table that already existed, or it silently permits
    # `DROP POLICY "tenant_isolation" ON "Workspace"`, removing tenant isolation
    # from live rows (review round 2).
    #
    # And it must be per-STATEMENT, not per-line: a line-level skip let
    #   DROP POLICY "a" ON "AiRunnerFlag"; DROP POLICY "b" ON "Workspace";
    # smuggle the second past on the first one's exemption (review round 3).
    # Blanking each exempt statement leaves the rest of the line visible.
    #
    # Anything not recognisably `DROP POLICY .. ON <table this branch creates>`
    # is left in the text and stays a finding, including a DROP POLICY whose
    # target cannot be parsed. Fail closed: an unreadable exemption is not one.
    # NEW_TABLES arrives ALREADY FOLDED, from sql_list_tables.py. Folding it
    # again here would be wrong, not merely redundant: these are true Postgres
    # names, so a name that legitimately contains upper case (from a quoted
    # CREATE TABLE) would be lowercased a second time and never match. That
    # exact double-fold silently disabled the whole exemption once.
    new_tables = {t for t in os.environ.get("NEW_TABLES", "").splitlines() if t.strip()}

    def exempt(match: "re.Match[str]") -> str:
        return blank(match) if fold(match.group("tbl")) in new_tables else match.group(0)

    src = EXEMPT_DROP_POLICY.sub(exempt, src)

    sys.stdout.write(src)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
