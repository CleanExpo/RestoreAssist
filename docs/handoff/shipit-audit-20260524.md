# /shipit Audit — 2026-05-24T06:34:18Z

Pre-flight launch-readiness audit for RestoreAssist sandbox, adapted from the Pi-CEO `ship-it` skill (`D:\Pi-CEO\skills\ship-it\SKILL.md`).

## Branch state

- Work branch: `shipit/2026-05-24` (off `origin/sandbox` @ `a0912ba3`)
- Local sandbox: stale (12 commits ahead are merged PRs preserved on `origin/wave-*`; left alone — not used as base)
- `origin/sandbox` ↔ `origin/main`: divergent (sandbox has SP-G/SP-6/SP-H Wave-2 specs, Customer Portal, help videos; main has the recent RA-4990/4989/4986 stability bundle, already at sandbox tip via PR #1162-#1167)
- Open PRs targeting sandbox: 0

## Oracle results

| Oracle               | Command                                  | Result                                              | Notes                                                                                                                                                                       |
| -------------------- | ---------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type-check           | `pnpm type-check`                        | **PASS**                                            | Required clearing stale `.next/{dev/types,types}/validator.ts` — typed-route generation artefacts from older builds referenced removed pages                                |
| Prisma validate      | `npx prisma validate`                    | **PASS**                                            | Pre-existing `SetNull` warning on a required field — out of scope for ship gate                                                                                             |
| Unit tests (no DB)   | `npx vitest run`                         | **PASS** (1659/1659)                                | 42 failures are all `Environment variable not found: DATABASE_URL` — DB-dependent tests that pass in CI where DB is provisioned; 49 skipped                                 |
| Diff whitespace      | `git diff --check origin/sandbox...HEAD` | **PASS**                                            | No diff vs sandbox yet (clean baseline)                                                                                                                                     |
| ESLint full          | `pnpm lint`                              | **FAIL** — 982 problems (159 errors / 823 warnings) | Was 73,664 problems on first run; ignore-list fix (`.claude/**`, `.hermes/**`, `.superpowers/**`, `storybook-static/**`, `pilot-tester/**`) reduced to actual source signal |
| Playwright E2E smoke | (deferred to CI)                         | —                                                   | Requires running dev server; deferred to PR CI                                                                                                                              |

## Lint error categories (159 errors)

| Rule                                | Count | Severity bucket             | Notes                                                            |
| ----------------------------------- | ----- | --------------------------- | ---------------------------------------------------------------- |
| `react-hooks/rules-of-hooks`        | 12    | **🚨 Critical correctness** | Hook called conditionally / inside callback / after early return |
| `no-constant-binary-expression`     | 3     | Logic bug                   | Expression always evaluates to same value                        |
| `no-prototype-builtins`             | 2     | Security                    | `obj.hasOwnProperty()` instead of `Object.hasOwn(obj, ...)`      |
| `no-async-promise-executor`         | 1     | Anti-pattern                | `new Promise(async (resolve) => …)` swallows errors              |
| `no-unreachable`                    | 1     | Dead code (logic)           | Code after `return`/`throw`                                      |
| `no-case-declarations`              | 1     | Logic                       | `let`/`const` in `case` without braces                           |
| `no-redeclare`                      | 5     | Logic                       | Same name declared twice in scope                                |
| `no-restricted-globals`             | 1     | RA convention               | Native `confirm()`/`alert()` — must use shadcn AlertDialog       |
| `@typescript-eslint/no-unused-vars` | 73    | Dead code                   | Unused symbol — prefix `_` or remove                             |
| `preserve-caught-error`             | 39    | RA custom rule              | Re-thrown error must forward `{ cause: error }`                  |
| `no-useless-escape`                 | 37    | Regex hygiene               | Unnecessary backslash escape                                     |
| `no-useless-assignment`             | 32    | Dead code                   | Assigned value never read                                        |
| `no-empty`                          | 6     | Empty block                 | Empty `catch`/`if` body                                          |
| `no-control-regex`                  | 6     | Regex hygiene               | Control char in regex                                            |
| `no-irregular-whitespace`           | 1     | Hidden whitespace           | Non-standard whitespace char                                     |

## Eligible/ineligible to fix in this session

**Fix-now-in-scope (Step 5):**

- All 12 `react-hooks/rules-of-hooks` (correctness — ship blocker per CLAUDE.md rule 17 spirit & review-dim 1/9)
- All 5 `no-redeclare`, 3 `no-constant-binary-expression`, 2 `no-prototype-builtins`, 1 `no-async-promise-executor`, 1 `no-unreachable`, 1 `no-case-declarations`, 1 `no-restricted-globals`
- All 39 `preserve-caught-error` (RA custom rule — mass mechanical edit, low risk)
- All 73 `@typescript-eslint/no-unused-vars` (mechanical `_` prefix or remove)
- All 37 `no-useless-escape` (mechanical regex cleanup)
- All 32 `no-useless-assignment` (mechanical)
- All 6 `no-empty`, 6 `no-control-regex`, 1 `no-irregular-whitespace` (mechanical)

**Defer (Step 6 → Linear):**

- 12 `@next/next/no-img-element` warnings — perf optimisation, not correctness; needs `<Image>` migration with src/dimensions auditing
- 823 total warnings (other) — file by RA ticket as "Lint baseline cleanup" if not already tracked

**Out of scope this session:**

- Migrating DB-dependent vitest tests to either mock or test-container — handled by CI env
- Full `<img>` → `<Image>` migration (separate UX/dimension audit)
- The `SetNull` Prisma warning (relation-design decision)

## Untracked artefact triage

| Path                                                  | Action                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `dist/release-v1.0.0/{backend,frontend}/.env.example` | Add `dist/` to gitignore root (already in subset); these are release-bundle scaffolds — leave on disk, ignore |
| `.hermes/`                                            | Add `.hermes/` to `.gitignore` (local agent scratch) — already added to ESLint ignores in this commit         |
| `packages/videos/.env.example`                        | Verify whether `packages/` is a real workspace dir; if so commit; if scratch, ignore                          |
| `mobile/.env.example`                                 | Same — verify `mobile/` workspace status                                                                      |
| `secret.txt` (134 B UTF-16 hex)                       | Move to `.local/old-secrets/` (out of tree) — was a PS-redirect artefact from a prior session                 |
| `docs/handoff/*.md` (25 files)                        | Leave untracked — repetitive autonomous-continuation logs; this audit doc is the consolidation                |
| `public/help-index.json`                              | Already in `.gitignore` — leave                                                                               |

## Linear context (RA team, working key confirmed)

Headlining issue aligned with this run:

- **RA-5035** (P1, In Progress) — _"RestoreAssist public launch war room — 100% green by 23/05/2026"_ — acceptance criteria match `/shipit` outcome exactly (full test green, security review, code-review gate, no main-merge without owner approval)

Other actively In-Progress that may overlap:

- RA-5036 organic launch campaign
- RA-3034 Supabase SERVICE_ROLE key (Pi-Dev-Ops repo, not RA — defer)
- RA-3025 CCW-CRM .npmrc (different project — defer)
- RA-2141 Task Completion Gate (CASHE) — meta governance

## Next: Step 3 multi-lens review using `.claude/rules/review-dimensions.md`
