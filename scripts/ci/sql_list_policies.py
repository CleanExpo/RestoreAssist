#!/usr/bin/env python3
"""List the (policy, table) pairs a migration creates, folded as Postgres folds them.

Used by scripts/ci/migration-roundtrip.sh (rollback mode), which then asserts
each pair is absent from pg_policies after the down.sql has run. Output is one
`policy<TAB>table` per line.

Identifier CASE is why this is python and not sed. Postgres folds an UNQUOTED
identifier to lower case and preserves a quoted one, so an extractor that merely
strips quotes emits the spelling from the FILE: `CREATE POLICY MyPolicy ON
MyTable` was looked up as MyPolicy / MyTable, matched nothing, and a leaked
policy read as PASS (review round 4). The grammar and the fold both live in
sql_ident.py now, one copy, because this exact defect was written twice.

Comments and string literals are blanked first, so a CREATE POLICY named inside
a comment or a quoted string is not mistaken for one the migration creates.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sql_ident import CREATE_POLICY, blank_noncode, fold  # noqa: E402


def main() -> int:
    src = blank_noncode(open(sys.argv[1], encoding="utf8").read())
    seen = set()
    for match in CREATE_POLICY.finditer(src):
        row = (fold(match.group("pol")), fold(match.group("tbl")))
        if row not in seen:
            seen.add(row)
            sys.stdout.write("%s\t%s\n" % row)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
