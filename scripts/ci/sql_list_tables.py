#!/usr/bin/env python3
"""List the table names a migration creates, folded as Postgres folds them.

Used by scripts/ci/migration-roundtrip.sh (additive-only mode) to build the set
of tables the branch itself creates, which is what the DROP POLICY exemption is
scoped to.

Why this is not the one-line `grep | sed | tr -d '"'` it replaces: stripping the
quotes throws away the one bit of information that decides the name. Postgres
folds an UNQUOTED identifier to lower case and preserves a quoted one, so
`CREATE TABLE "AiRunnerFlag"` is AiRunnerFlag while `CREATE TABLE MyTable` is
mytable. An extractor that strips quotes emits `AiRunnerFlag` and `MyTable` --
one right by luck, one wrong -- and the comparison against a folded name on the
other side then silently fails, disabling the exemption for every table.

Same fold, one implementation, both sides: see sql_list_policies.py, where the
same defect cost review round 4 a P1.
"""

import re
import sys

# A Postgres identifier: quoted (with "" as an escaped quote) or bare.
IDENT = r'"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*'

CREATE_TABLE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"
    r"(?:(?:" + IDENT + r")\s*\.\s*)?"          # optional schema qualifier
    r"(?P<tbl>" + IDENT + r")",
    re.I | re.S,
)


def fold(token: str) -> str:
    """Fold an identifier exactly as Postgres does."""
    if token.startswith('"'):
        return token[1:-1].replace('""', '"')
    return token.lower()


def main() -> int:
    seen = set()
    for path in sys.argv[1:]:
        try:
            src = open(path, encoding="utf8").read()
        except OSError:
            # A caller that names an unreadable file is a caller bug, and a
            # silently empty table set would DISABLE the exemption rather than
            # widen it -- annoying, not dangerous -- but say so anyway.
            sys.stderr.write("sql_list_tables: cannot read %s\n" % path)
            return 2
        for match in CREATE_TABLE.finditer(src):
            seen.add(fold(match.group("tbl")))
    for name in sorted(seen):
        sys.stdout.write(name + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
