# C2 secrets scan: addendum

Companion to `C2-secrets-scan.md` in this folder.

## 2026-10-31 — two more blind file classes closed

The blanket `.md` allowlist was gone by this date, but two path entries in
`.gitleaks.toml` still exempted whole file classes from every rule:

| Entry                         | What it hid                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `(?i)^\.claude/`              | all 333 tracked files under `.claude/` (rules, hooks, agents, settings), not just the gitignored agent worktrees its comment described |
| `(?i)__tests__/.*\.test\.ts$` | all 1,280 tracked unit-test files                                                                                                      |

Measured on a `git checkout-index` export of `origin/main` (1afddc33),
gitleaks 8.30.1, with a deliberately fake `ghp_`-prefixed GitHub token
(`FAKEnotREALplantedCANARY...`) planted in `lib/`, `.claude/` and
`lib/__tests__/`:

| Config                                                              | Result                                      |
| ------------------------------------------------------------------- | ------------------------------------------- |
| `origin/main` config, token in `.claude/` and `lib/__tests__/` only | exit 0, "no leaks found": both invisible    |
| `origin/main` config, token in `lib/`                               | exit 1, `github-pat`: the rule itself works |
| new config, token in `.claude/` and `lib/__tests__/`                | exit 1, `github-pat` at both paths          |
| new config, canaries removed                                        | exit 0                                      |

Fix: `.claude/` is exempt only for its gitignored subpaths (`worktrees/`,
`done/`, `verifier-reports/`, `skills/`, `swarm/identity.local.md`,
`PROGRESS.md`). Test files are exempt only from `generic-api-key` via a
targeted `[[allowlists]]` entry; with the blanket entry removed, all 27
findings in test files were that one entropy-based rule, so every
provider-specific rule now fires inside tests. The old single `[allowlist]`
table became `[[allowlists]]`, because gitleaks refuses to load the two
forms together.

The producer's control now plants the canary at all three classes
(`docs/...md`, `.claude/rules/...md`, `lib/__tests__/...test.ts`) and passes
only if every one is detected. The new unit test was run against the old
single-path detection and failed on the two new paths before the fix.

Producer run, same day: "Scanned 6168 tracked files with gitleaks 8.30.1:
0 findings (control canary detected). Production env completeness at
https://restoreassist.app/api/health: ok, 0 variables unset."

C2 still scores 0 until a signed receipt exists: that needs the owner's
keypair in `RELEASE_RECEIPT_PUBLIC_KEYS` and the `release-receipts`
environment (founder-only).

## Round 2 (independent review, Cursor, 31/10/2026)

The first version still exempted `.claude/skills/` and
`.claude/verifier-reports/`, on the assumption they were gitignored. They are
not: 65 and 151 of their files are tracked, and CI scans them. A planted fake
token there was invisible to the relative scan CI runs. Both exemptions are
removed; the tracked tree still scans clean without them.

The review also showed why the producer's canary had not caught this. The
producer passed an absolute `--source` to gitleaks, and gitleaks matches
`paths` allowlists against the path as it reports it. With an absolute source
that path is absolute, so no `^`-anchored exemption matched: the producer saw
more than CI and its canary could never fail on an over-broad path exemption.
Measured: the same planted token in `.claude/skills/` was reported by an
absolute scan and hidden by a relative one under the same config.

`scanDirectory` now runs gitleaks from inside the export with `--source .`.
The canary is planted at five paths (adding `.claude/skills/` and
`.claude/verifier-reports/`). Controls run:

- Producer with the round-1 config: exit 1, "the control canary ... was NOT
  detected at every path". With the new config: exit 0, "Scanned 6169 tracked
  files with gitleaks 8.30.1: 0 findings (control canary detected)".
- New unit test `scanDirectory > scans from inside the export with a relative
  source`: fails against the absolute-source code (cwd was the repo, not the
  export), passes after; 29 tests pass.
