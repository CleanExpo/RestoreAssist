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

    def keep(text: str) -> None:
        out.append(text)

    def blank(text: str) -> None:
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

        # /* block comment */ -- nests in Postgres
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

        # '...' string literal, '' is an escaped quote
        if ch == "'":
            j = i + 1
            while j < n:
                if src[j] == "'":
                    if j + 1 < n and src[j + 1] == "'":
                        j += 2
                        continue
                    j += 1
                    break
                j += 1
            blank(src[i:j])
            i = j
            continue

        # "..." quoted identifier: CODE. Kept, but skipped as a unit so an
        # apostrophe or a /* inside it cannot open anything.
        if ch == '"':
            j = i + 1
            while j < n:
                if src[j] == '"':
                    if j + 1 < n and src[j + 1] == '"':
                        j += 2
                        continue
                    j += 1
                    break
                j += 1
            keep(src[i:j])
            i = j
            continue

        # $tag$ ... $tag$ : kept deliberately, skipped as a unit for the same
        # reason -- its contents must not toggle the scanner.
        tag = _DOLLAR_TAG.match(src, i)
        if tag:
            close = src.find(tag.group(0), tag.end())
            j = n if close == -1 else close + len(tag.group(0))
            keep(src[i:j])
            i = j
            continue

        keep(ch)
        i += 1

    return "".join(out)
