#!/usr/bin/env python3
"""Shared SQL lexing for the migration checks: one identifier grammar, one fold, one blanker.

The three helpers beside this file used to carry their own copy of `IDENT` and
`fold()`. Review round 6 (P2) recommended collapsing them, and the history says
why that is more than tidiness: this grammar has been wrong twice already, in
two different files, and each time only one copy was fixed.

  round 4  an UNQUOTED identifier was not lower-cased, so a leaked policy was
           looked up under a name Postgres does not store  -> fail OPEN
  round 5  `"[^"]+"` could not represent `"my""policy"`, so the statement was
           silently skipped                                 -> fail OPEN

Both were in the same six lines, written twice. One copy now.

Honest limit, so the claim here is not wider than the code. `fold()` implements
the common case: unquoted folds to lower case, quoted keeps its case with `""`
collapsed to one quote. It does NOT implement Postgres's `U&"..."` escape
syntax, non-ASCII identifiers, or the 63-byte truncation Postgres applies to
over-long names. A migration using any of those would have its object looked up
under the wrong name and the absence check would pass vacuously -- fail open.
None appear in this repository's migrations and the CREATE_* patterns below will
not match them, so such a statement is not silently mis-parsed here; it is not
seen at all. That is the same fail-open direction, and it is recorded rather
than claimed away: closing it needs a real parser, which is not proportionate
until a migration needs one.
"""

import re
import sys

# A Postgres identifier: quoted (with "" as an escaped quote) or bare.
IDENT = r'"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*'

# Optional schema qualifier in front of an object name.
_QUALIFIER = r"(?:(?:" + IDENT + r")\s*\.\s*)?"

CREATE_POLICY = re.compile(
    r"CREATE\s+POLICY\s+(?P<pol>" + IDENT + r")"
    r"\s+ON\s+(?:ONLY\s+)?" + _QUALIFIER + r"(?P<tbl>" + IDENT + r")",
    re.I | re.S,
)

CREATE_TABLE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?" + _QUALIFIER + r"(?P<tbl>" + IDENT + r")",
    re.I | re.S,
)

DROP_POLICY = re.compile(
    r"DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:" + IDENT + r")"
    r"\s+ON\s+(?:ONLY\s+)?" + _QUALIFIER + r"(?P<tbl>" + IDENT + r")",
    re.I | re.S,
)


def fold(token: str) -> str:
    """Fold an identifier the way Postgres does: quoted keeps case, bare lower-cases."""
    if token.startswith('"'):
        return token[1:-1].replace('""', '"')
    return token.lower()


_DOLLAR_TAG = re.compile(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$")

# Characters that can end an identifier. A `$` directly after one of these is
# part of that identifier (`a$b$c` is a legal Postgres name), NOT the start of a
# dollar-quote tag -- review round 7 (P1).
_IDENT_CHAR = re.compile(r"[A-Za-z0-9_$]")

# An `E` or `e` immediately before a quote makes it an ESCAPE string, where
# backslash escapes apply and `\'` does NOT end the literal. Review round 7 (P0)
# showed that treating `E'...'` as an ordinary literal desynchronises the whole
# scanner: `SELECT E'\' /* ' ; DROP TABLE "Workspace"; -- */` terminated the
# string early, read `/*` as a comment opener, and blanked the DROP.
#
# B'..' and X'..' are bit and hex literals with no escapes, so the ordinary
# path is correct for them and they need no special case.


def _scan_quoted(src, i, closer, backslash_escapes):
    """Return the index just past a quoted run starting at src[i] == closer.

    Doubling the closer escapes it in every SQL quoted form. Backslash escapes
    additionally apply inside E'...'. An unterminated run returns the end of the
    string -- the caller decides whether to blank or keep it, and the choice is
    documented there.
    """
    n = len(src)
    j = i + 1
    while j < n:
        c = src[j]
        if backslash_escapes and c == "\\":
            j += 2
            continue
        if c == closer:
            if j + 1 < n and src[j + 1] == closer:
                j += 2
                continue
            return j + 1
        j += 1
    return n


def blank_noncode(src: str) -> str:
    """Blank comments and string literals in one LEFT-TO-RIGHT pass.

    Replaces each blanked character with a space and keeps every newline, so line
    numbers reported against the result still point at the real line.

    This is a single scanner rather than a sequence of independent `re.sub`
    calls, and review round 6 (P2) is the reason. Sequential blanking has no
    notion of which construct a character is INSIDE, so each pass can be toggled
    by punctuation belonging to another:

      * a string literal containing `/*` and a later one containing `*/` made the
        block-comment pass blank everything between them, hiding any destructive
        SQL in the middle;
      * an apostrophe inside a double-quoted identifier (`"my'policy"`) opened
        the string-literal pass, which then ran to the next apostrophe anywhere
        in the file and blanked all of it.

    Both hide SQL from the destructive-statement match, which is fail OPEN in a
    check whose entire job is to refuse destructive SQL.

    Handled: `--` line comments, `/* */` block comments (which NEST in Postgres),
    `'...'` string literals with `''` escapes, and two constructs that are
    deliberately left INTACT but must still be skipped so their contents cannot
    toggle anything -- `"..."` quoted identifiers, and dollar-quoted bodies.

    Dollar-quoted bodies stay visible on purpose. They are the one place a
    destructive statement is both quoted AND executable: `DO $$ BEGIN .. DROP
    TABLE x .. END $$` really does drop the table. The cost is a false red on a
    DROP named inside a function body's own error string, which a human resolves
    in seconds; blanking them would be a hole big enough to drive the whole
    check through.
    """
    out = []
    i = 0
    n = len(src)

    def keep(text):
        out.append(text)

    def blank(text):
        out.append(re.sub(r"[^\n]", " ", text))

    while i < n:
        ch = src[i]

        # -- line comment
        if src.startswith("--", i):
            end = src.find("\n", i)
            end = n if end == -1 else end
            blank(src[i:end])
            i = end
            continue

        # /* block comment */ -- nests in Postgres. An UNTERMINATED one blanks to
        # EOF, which is fail-open in principle; it is accepted because an
        # unterminated block comment is not valid SQL and the migration would not
        # apply, so the apply check refuses it before this one can be fooled.
        if src.startswith("/*", i):
            depth = 1
            j = i + 2
            while j < n and depth:
                if src.startswith("/*", j):
                    depth += 1
                    j += 2
                elif src.startswith("*/", j):
                    depth -= 1
                    j += 2
                else:
                    j += 1
            blank(src[i:j])
            i = j
            continue

        # '...' or E'...' string literal.
        #
        # The E prefix is the whole reason this is not a plain scan for the next
        # quote. In an escape string a backslash escapes the following character,
        # so `E'\''` does NOT end at the second quote. Getting that wrong
        # desynchronised the scanner and let
        #   SELECT E'\' /* ' ; DROP TABLE "Workspace"; -- */
        # hide a real DROP behind a comment the scanner invented (round 7, P0).
        if ch == "'" or (
            ch in "Ee"
            and i + 1 < n
            and src[i + 1] == "'"
            and (i == 0 or not _IDENT_CHAR.match(src[i - 1]))
        ):
            quote_at = i if ch == "'" else i + 1
            j = _scan_quoted(src, quote_at, "'", backslash_escapes=(ch in "Ee"))
            blank(src[i:j])
            i = j
            continue

        # "..." quoted identifier: CODE. Kept, but skipped as a unit so an
        # apostrophe or a /* inside it cannot open anything.
        if ch == '"':
            j = _scan_quoted(src, i, '"', backslash_escapes=False)
            keep(src[i:j])
            i = j
            continue

        # $tag$ ... $tag$ dollar-quoted body.
        #
        # Only a tag NOT preceded by an identifier character opens one: `a$b$c`
        # is a legal Postgres identifier, and treating its `$b$` as an opening
        # tag skipped to a spurious close and desynchronised everything after it
        # (round 7, P1).
        #
        # The body is RECURSED INTO rather than kept whole. Keeping it whole left
        # its comments and string literals unblanked, so a harmless
        # `/* DROP TABLE x */` inside a `DO $$ .. $$` block became a false red
        # (round 7, P1). Recursing blanks the parts that are not code while
        # leaving executable statements visible -- which is the point: `DO $$
        # BEGIN .. DROP TABLE x .. END $$` really does drop the table, so a DROP
        # that is genuinely executable inside a dollar body must still be seen.
        if ch == "$" and (i == 0 or not _IDENT_CHAR.match(src[i - 1])):
            tag = _DOLLAR_TAG.match(src, i)
            if tag:
                marker = tag.group(0)
                close = src.find(marker, tag.end())
                if close == -1:
                    # Unterminated: keep to EOF. Fail CLOSED -- everything after
                    # stays visible to the destructive match.
                    keep(src[i:])
                    i = n
                    continue
                keep(marker)
                keep(blank_noncode(src[tag.end():close]))
                keep(marker)
                i = close + len(marker)
                continue

        keep(ch)
        i += 1

    return "".join(out)


# ---------------------------------------------------------------------------
# Self-test. Run by migration-roundtrip.sh BEFORE it uses this module, so the
# gate proves its own instrument on every invocation rather than trusting it.
#
# Every case below is a defect that was actually found in review, in BOTH
# directions: a fail-open hides destructive SQL from the check, a false red
# makes the check so noisy it gets ignored. Both are ways for the gate to stop
# working, so both are asserted.
# ---------------------------------------------------------------------------
_D = "$"

SELFTEST_CASES = [
    # (name, sql, must the destructive statement still be VISIBLE afterwards?)
    ("round 7 P0  E-string backslash escape desynchronised the scanner",
     "SELECT E\'\\\' /* \' ; DROP TABLE \"Workspace\"; -- */", True),
    ("round 7 P1  a comment inside a dollar body became a false red",
     "DO " + _D * 2 + " BEGIN /* DROP TABLE x */ PERFORM 1; END " + _D * 2 + ";", False),
    ("round 7 P1  but an EXECUTABLE drop inside a dollar body must still be seen",
     "DO " + _D * 2 + " BEGIN DROP TABLE \"Workspace\"; END " + _D * 2 + ";", True),
    ("round 7 P1  a $ inside an identifier must not open a dollar tag",
     "ALTER TABLE a" + _D + "b" + _D + "c ADD COLUMN x TEXT;\nDROP TABLE \"Workspace\";", True),
    ("round 6 P2  literals carrying /* and */ swallowed the statement between",
     "INSERT INTO t VALUES (\'/* o\');\nDROP TABLE \"Workspace\";\nINSERT INTO t VALUES (\'*/ c\');", True),
    ("round 6 P2  an apostrophe in a quoted identifier opened a literal",
     "ALTER TABLE t ADD COLUMN \"it\'s\" TEXT;\nDROP TABLE \"Workspace\";", True),
    ("baseline    a drop named in a line comment is not a drop",
     "-- DROP TABLE \"Workspace\"\nSELECT 1;", False),
    ("baseline    a drop named in a string literal is not a drop",
     "INSERT INTO t VALUES (\'DROP TABLE \"Workspace\"\');", False),
    ("baseline    an unterminated dollar body keeps the rest visible (fail closed)",
     "DO " + _D * 2 + " BEGIN\nDROP TABLE \"Workspace\";", True),
]


def selftest() -> int:
    failures = 0
    for name, sql, should_see in SELFTEST_CASES:
        seen = "DROP TABLE" in blank_noncode(sql)
        if seen != should_see:
            failures += 1
            print(
                "sql_ident selftest FAILED: %s (visible=%s, expected=%s)"
                % (name, seen, should_see)
            )
    if failures:
        print("sql_ident: %d of %d selftest cases FAILED" % (failures, len(SELFTEST_CASES)))
        return 1
    print("sql_ident selftest: %d cases pass" % len(SELFTEST_CASES))
    return 0


if __name__ == "__main__":
    raise SystemExit(selftest() if "--selftest" in sys.argv else 0)

