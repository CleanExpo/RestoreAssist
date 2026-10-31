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
