#!/usr/bin/env python3
"""Blank everything in a migration that the destructive-SQL match must not see.

Used by scripts/ci/migration-roundtrip.sh (additive-only mode), then handed to a
grep that looks for DROP / RENAME / TRUNCATE and friends. Blanked regions are
replaced space-for-space with newlines kept, so reported line numbers still point
at the real line.

Two jobs, in order:

  1. blank comments and string literals -- a single left-to-right pass in
     sql_ident.blank_noncode(), for reasons documented there;
  2. blank the DROP POLICY statements that are exempt because they target a
     table this branch itself creates.

This lives in a FILE rather than a heredoc because it used to be
`python3 - "$f" <<'PYEOF'` inside a `$( )` command substitution, where bash
tracks quote parity through the heredoc body -- so a single apostrophe in a
COMMENT broke the whole script with a syntax error pointing at a case terminator
170 lines away. Review round 5 (P2) was right that documenting that rule was not
fixing it. A file has no such rule.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sql_ident import DROP_POLICY, blank_noncode, fold  # noqa: E402


def main() -> int:
    src = blank_noncode(open(sys.argv[1], encoding="utf8").read())

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
    #
    # NEW_TABLES arrives ALREADY FOLDED, from sql_list_tables.py. Folding it
    # again here would be wrong, not merely redundant: these are true Postgres
    # names, so a name that legitimately contains upper case (from a quoted
    # CREATE TABLE) would be lowercased a second time and never match. That
    # exact double-fold silently disabled the whole exemption once -- caught
    # only because it happened to fail CLOSED and turned a clean tree red.
    new_tables = {t for t in os.environ.get("NEW_TABLES", "").splitlines() if t.strip()}

    def exempt(match: "re.Match[str]") -> str:
        if fold(match.group("tbl")) in new_tables:
            return re.sub(r"[^\n]", " ", match.group(0))
        return match.group(0)

    sys.stdout.write(DROP_POLICY.sub(exempt, src))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
