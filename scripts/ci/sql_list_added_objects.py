#!/usr/bin/env python3
"""List the columns, standalone indexes and named constraints a migration adds
to tables, folded as Postgres folds them.

Used by scripts/ci/migration-roundtrip.sh (rollback mode), which asserts each
one is PRESENT after the migrations apply and ABSENT after the down.sql has run.
Output is one object per line, tab separated:

    column<TAB>table<TAB>column
    index<TAB>table<TAB>index
    constraint<TAB>table<TAB>constraint

Why it exists (RA-8388): rollback mode enumerated only tables, types, functions
and policies. A migration that adds columns, indexes and foreign keys to tables
that already exist creates none of those, so its down.sql could be empty and
the mode still printed PASS.

FAILS CLOSED. Every `ADD COLUMN`, `ADD CONSTRAINT` and `CREATE [UNIQUE] INDEX`
keyword in the executable text must be accounted for by a parsed object. If the
counts differ (an unnamed index, a spelling this grammar does not know), or a
constraint is added without a name, this exits 2 and prints why. A short list
would be read by the caller as "nothing else to check".

Comments and string literals are blanked first, so an ADD COLUMN mentioned in a
comment is not mistaken for one the migration runs. Grammar pieces and the
identifier fold are shared with sql_ident.py, one copy.

Named limit: statements inside a dollar-quoted body (a DO block or a function)
are read as ordinary statements, because sql_ident does not blank those bodies.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sql_ident import IDENT, blank_noncode, fold  # noqa: E402

_QUAL = r"(?:(?:" + IDENT + r")\s*\.\s*)?"

ALTER_TABLE = re.compile(
    r"\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?" + _QUAL + r"(?P<tbl>" + IDENT + r")",
    re.IGNORECASE,
)
ADD_COLUMN = re.compile(
    r"\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>" + IDENT + r")", re.IGNORECASE
)
ADD_CONSTRAINT = re.compile(r"\bADD\s+CONSTRAINT\s+(?P<name>" + IDENT + r")", re.IGNORECASE)
# ADD followed by a table-constraint keyword and no CONSTRAINT <name>: Postgres
# picks the name, so there is nothing here to look up afterwards.
ADD_UNNAMED = re.compile(
    r"\bADD\s+(?:CHECK|UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY|EXCLUDE)\b", re.IGNORECASE
)
# ADD <name> with no COLUMN keyword is still a column. GENERATED and NOT are the
# other words that may follow ADD inside ALTER TABLE (identity, NOT NULL forms).
ADD_BARE = re.compile(
    r"\bADD\s+(?!(?:COLUMN|CONSTRAINT|CHECK|UNIQUE|PRIMARY|FOREIGN|EXCLUDE|GENERATED|NOT)\b)"
    r"(?P<name>" + IDENT + r")",
    re.IGNORECASE,
)
CREATE_INDEX = re.compile(
    r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"
    + _QUAL
    + r"(?P<name>"
    + IDENT
    + r")\s+ON\s+(?:ONLY\s+)?"
    + _QUAL
    + r"(?P<tbl>"
    + IDENT
    + r")",
    re.IGNORECASE,
)
KW_ADD_COLUMN = re.compile(r"\bADD\s+COLUMN\b", re.IGNORECASE)
KW_ADD_CONSTRAINT = re.compile(r"\bADD\s+CONSTRAINT\b", re.IGNORECASE)
KW_CREATE_INDEX = re.compile(r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\b", re.IGNORECASE)


class Unparseable(Exception):
    pass


def added_objects(sql: str):
    """Return [(kind, table, name)] in file order, or raise Unparseable."""
    src = blank_noncode(sql)
    rows = []
    for stmt in src.split(";"):
        alter = ALTER_TABLE.search(stmt)
        if alter:
            tbl = fold(alter.group("tbl"))
            rest = stmt[alter.end():]
            if ADD_UNNAMED.search(rest):
                raise Unparseable(
                    "a constraint is added to %s without CONSTRAINT <name>; "
                    "name it so its removal can be checked" % tbl
                )
            for m in ADD_COLUMN.finditer(rest):
                rows.append(("column", tbl, fold(m.group("name"))))
            for m in ADD_BARE.finditer(rest):
                rows.append(("column", tbl, fold(m.group("name"))))
            for m in ADD_CONSTRAINT.finditer(rest):
                rows.append(("constraint", tbl, fold(m.group("name"))))
        for m in CREATE_INDEX.finditer(stmt):
            rows.append(("index", fold(m.group("tbl")), fold(m.group("name"))))

    for kind, keyword in (
        ("column", KW_ADD_COLUMN),
        ("constraint", KW_ADD_CONSTRAINT),
        ("index", KW_CREATE_INDEX),
    ):
        want = len(keyword.findall(src))
        got = sum(1 for row in rows if row[0] == kind)
        # Columns may exceed the keyword count (ADD <name> without COLUMN).
        if got < want or (kind != "column" and got != want):
            raise Unparseable(
                "%d %s keyword(s) in the file but %d parsed; refusing to report a "
                "short list" % (want, kind, got)
            )
    return rows


SELFTEST_CASES = [
    (
        "the three shapes, constraint name on its own line",
        'ALTER TABLE "A" ADD COLUMN "c" TEXT;\n'
        'CREATE UNIQUE INDEX "A_c_key"\n  ON "A"("c");\n'
        'ALTER TABLE "A"\n  ADD CONSTRAINT "A_c_fkey"\n  FOREIGN KEY ("c") REFERENCES "B"("id");',
        [("column", "A", "c"), ("index", "A", "A_c_key"), ("constraint", "A", "A_c_fkey")],
    ),
    (
        "a comment naming the keywords adds nothing",
        "-- Every statement is ADD COLUMN, CREATE UNIQUE INDEX or ADD CONSTRAINT.\n"
        'ALTER TABLE "A" ADD COLUMN "c" TEXT;',
        [("column", "A", "c")],
    ),
    (
        "unquoted names fold to lower case, IF NOT EXISTS is skipped",
        "ALTER TABLE MyTable ADD COLUMN IF NOT EXISTS NewCol int;\n"
        "CREATE INDEX IF NOT EXISTS MyIdx ON public.MyTable (NewCol);",
        [("column", "mytable", "newcol"), ("index", "mytable", "myidx")],
    ),
    (
        "two columns in one ALTER, one without the COLUMN keyword",
        'ALTER TABLE "A" ADD COLUMN "x" int, ADD "y" int;',
        [("column", "A", "x"), ("column", "A", "y")],
    ),
    (
        "an unnamed constraint is refused",
        'ALTER TABLE "A" ADD FOREIGN KEY ("c") REFERENCES "B"("id");',
        None,
    ),
    (
        "an unnamed index is refused",
        'CREATE INDEX ON "A" ("c");',
        None,
    ),
]


def selftest() -> int:
    bad = 0
    for label, sql, want in SELFTEST_CASES:
        try:
            got = added_objects(sql)
        except Unparseable:
            got = None
        if got != want:
            bad += 1
            sys.stderr.write("selftest FAIL: %s\n  want %r\n  got  %r\n" % (label, want, got))
    if bad:
        return 1
    sys.stderr.write("sql_list_added_objects selftest: %d cases pass\n" % len(SELFTEST_CASES))
    return 0


def main() -> int:
    if sys.argv[1:] == ["--selftest"]:
        return selftest()
    out = []
    for path in sys.argv[1:]:
        try:
            sql = open(path, encoding="utf8").read()
        except OSError as exc:
            sys.stderr.write("sql_list_added_objects: cannot read %s: %s\n" % (path, exc))
            return 2
        try:
            out.extend(added_objects(sql))
        except Unparseable as exc:
            sys.stderr.write("sql_list_added_objects: %s: %s\n" % (path, exc))
            return 2
    seen = set()
    for row in out:
        if row not in seen:
            seen.add(row)
            sys.stdout.write("%s\t%s\t%s\n" % row)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
