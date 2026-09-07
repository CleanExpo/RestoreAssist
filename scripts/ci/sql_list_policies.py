#!/usr/bin/env python3
"""List the (policy, table) pairs a migration creates, folded as Postgres folds them.

Used by scripts/ci/migration-roundtrip.sh (rollback mode), which then asserts
each pair is absent from pg_policies after the down.sql has run. Output is one
`policy<TAB>table` per line.

Identifier CASE is the whole reason this is python rather than sed. Postgres
folds an UNQUOTED identifier to lower case and preserves a quoted one exactly, so
an extractor that merely strips quotes emits the spelling from the FILE:
`CREATE POLICY MyPolicy ON MyTable` was looked up as MyPolicy / MyTable, matched
nothing, and a leaked policy read as PASS (review round 4). Quotedness has to
survive the extraction.

A doubled quote inside a quoted identifier is one literal quote -- `"my""policy"`
is the policy named `my"policy`. Both the pattern and the fold have to know that,
and neither did until review round 5: the pattern stopped at `"my"`, the match
then failed at `\\s+ON`, and the policy was silently skipped. A policy this
extractor never sees is a policy the rollback check cannot report, which is
fail-open in the only place that matters.

This lives in a FILE rather than a heredoc for the same reason as its sibling:
a heredoc inside `$( )` inherits bash quote-parity rules, so an apostrophe in a
comment breaks the enclosing script.
"""

import re
import sys

# A Postgres identifier: quoted (with "" as an escaped quote) or bare.
IDENT = r'"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*'

CREATE_POLICY = re.compile(
    r"CREATE\s+POLICY\s+(?P<pol>" + IDENT + r")"
    r"\s+ON\s+(?:ONLY\s+)?"
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
    src = open(sys.argv[1], encoding="utf8").read()
    seen = set()
    for match in CREATE_POLICY.finditer(src):
        row = (fold(match.group("pol")), fold(match.group("tbl")))
        if row not in seen:
            seen.add(row)
            sys.stdout.write("%s\t%s\n" % row)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
