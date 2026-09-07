#!/usr/bin/env python3
"""List the table names a migration creates, folded as Postgres folds them.

Used by scripts/ci/migration-roundtrip.sh (additive-only mode) to build the set
of tables the branch itself creates, which is what the DROP POLICY exemption is
scoped to. Accepts any number of migration files; emits one folded name per line.

Why this is not the `grep | sed | tr -d '"'` it replaces: stripping the quotes
throws away the one bit of information that decides the name. Postgres folds an
UNQUOTED identifier to lower case and preserves a quoted one, so
`CREATE TABLE "AiRunnerFlag"` is AiRunnerFlag while `CREATE TABLE MyTable` is
mytable. The old extractor emitted `AiRunnerFlag` -- right by luck -- and would
emit `MyTable`, which matches nothing. Grammar and fold are shared in
sql_ident.py, one copy.

Comments and string literals are blanked first, so a CREATE TABLE mentioned in a
comment does not silently widen the DROP POLICY exemption to a table the branch
does not actually create.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sql_ident import CREATE_TABLE, blank_noncode, fold  # noqa: E402


def main() -> int:
    seen = set()
    for path in sys.argv[1:]:
        try:
            src = blank_noncode(open(path, encoding="utf8").read())
        except OSError as exc:
            # Exit non-zero rather than emitting a short list. An empty or
            # partial table set DISABLES the exemption, which turns a clean tree
            # red -- noisy and safe -- but the caller runs under `set -e` and
            # must stop on a real read error rather than proceed on a guess.
            sys.stderr.write("sql_list_tables: cannot read %s: %s\n" % (path, exc))
            return 2
        for match in CREATE_TABLE.finditer(src):
            seen.add(fold(match.group("tbl")))
    for name in sorted(seen):
        sys.stdout.write(name + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
