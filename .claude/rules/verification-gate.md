# Verification Gate — Always-On Rule

> **Authority**: Always loaded. Applies to ALL tasks.
> **Purpose**: Prevents Claude from declaring work complete before visual confirmation.

## The Rule

Before claiming any task is done, Claude MUST produce a **VERIFICATION CHECKLIST** with:

1. Where to check
2. How to get there
3. What to see
4. What NOT to see
5. Confirmation prompt

## Say what was actually checked

The failure this guards against is not a phrase, it is a claim outrunning its
evidence. Blacklisting wording only moves the problem: the same unverified
claim in different words is just as wrong.

So state the basis, not the verdict. "Type-check and the 41 unit tests pass; I
have not opened it in a browser" is useful. "Done" is not, and neither is
"done (verified)" when the verification was reading the diff.

Two distinctions worth keeping explicit, because they read identically in a
summary and mean opposite things:

- **"Did not run"** vs **"ran and found nothing"**.
- **"Unavailable from this environment"** vs **"not configured"**.

A test that has never been observed to fail has not been shown to guard
anything. Run it against the unfixed code first.

## Exceptions

Does NOT apply to: documentation-only, config, test-only, or git operations.
