# RestoreAssist Strict Gate Rerun Runbook

Date: 2026-05-28
Gate owner: RA-4956
Purpose: rerun the current ship gate only after the known fail-closed blockers are repaired.

## Decision Rule

Do not run this as a ship-approval ceremony until the preconditions below are green. Running it earlier is useful only as diagnostics, because the gate is expected to fail while sandbox smoke, canary secrets, security evidence, or owner evidence are incomplete.

Ship approval requires:

- Clean checkout on current `origin/main`.
- All commands in this runbook pass.
- `pnpm tsx scripts/release-gate-score.ts --strict` returns 100/100.
- Evidence is attached to RA-4956 and the Linear command center without exposing secret values.

## Preconditions

| Area                  | Required state before strict rerun                                                                                   | Tracking issue              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Pilot canary          | GitHub Actions secrets `PILOT_TESTER_USER_POOL_JSON` and `PILOT_TESTER_DATABASE_URL` exist and real canary passes.   | RA-5615                     |
| Sandbox smoke target  | `https://restoreassist-sandbox.vercel.app/api/health` returns `status=ok`, database ok, and env ok.                  | RA-5624                     |
| Sandbox TLS/env audit | `NODE_TLS_REJECT_UNAUTHORIZED` is removed from sandbox runtime env or has a formal dated exception.                  | RA-5624                     |
| Security evidence     | Rotation, revocation, service-role, and secret-output-prevention evidence is attached or formally excepted.          | RA-2989 / RA-3034 / RA-3012 |
| Owner evidence        | Only current, proven evidence files use `status: pass`; deferred files stay fail-closed.                             | RA-5628                     |
| PR risk               | PR #1199 is split or explicitly senior-reviewed; it is not used as ship approval while broad and CodeRabbit-skipped. | RA-5629                     |
| Dependency risk       | Closed Dependabot #1204 is not revived as one broad batch; replacement PRs are small and green.                      | RA-5630                     |

## Clean Worktree Setup

Use a fresh worktree so local dirty work and stale generated artifacts cannot affect the result.

```bash
cd /Users/phillmcgurk/RestoreAssist
git fetch origin
rm -rf /tmp/restoreassist-strict-gate
git worktree add /tmp/restoreassist-strict-gate origin/main
cd /tmp/restoreassist-strict-gate
pnpm install --frozen-lockfile
```

If a prior interrupted browser run left generated Playwright output in the clean worktree, remove only generated test artifacts before linting:

```bash
rm -rf test-results playwright-report
```

## Local Verification Commands

Run these in order from `/tmp/restoreassist-strict-gate`.

```bash
pnpm type-check
pnpm lint
npx vitest run
pnpm audit --prod --audit-level=moderate
npx vitest run lib/__tests__/middleware-*.test.ts
npx vitest run lib/billing/__tests__/ app/api/webhooks/stripe/__tests__/
pnpm test:smoke:sandbox
pnpm tsx scripts/release-gate-score.ts --strict
```

Expected result: every command exits 0. The final scorer must report 100/100.

## External Health Checks

These commands reveal presence and status only. Do not print or paste secret values.

```bash
gh run list --repo CleanExpo/RestoreAssist --limit 12
gh secret list --repo CleanExpo/RestoreAssist --app actions | rg 'PILOT_TESTER|DATABASE_URL|USER_POOL|^Name'
curl -fsS https://restoreassist.app/api/health
curl -fsS https://restoreassist-sandbox.vercel.app/api/health
vercel env ls production --scope unite-group | rg 'NODE_TLS_REJECT_UNAUTHORIZED|DATABASE_URL|DIRECT_URL|STRIPE_SECRET_KEY|RESEND_API_KEY|XERO_WEBHOOK_KEY|NEXT_PUBLIC_SUPABASE_URL'
```

For the sandbox-linked Vercel project, run from the sandbox-linked directory:

```bash
vercel env ls production --scope unite-group --cwd /tmp/ra-vercel-sandbox-env | rg 'NODE_TLS_REJECT_UNAUTHORIZED|DATABASE_URL|DIRECT_URL|STRIPE_SECRET_KEY|RESEND_API_KEY|XERO_WEBHOOK_KEY|NEXT_PUBLIC_SUPABASE_URL'
```

Expected result:

- Latest production smoke on `main` is green.
- Latest pilot tester canary on `main` is green.
- Production health is `status=ok`.
- Sandbox health is `status=ok`.
- Production env listing does not include `NODE_TLS_REJECT_UNAUTHORIZED`.
- Sandbox env listing does not include `NODE_TLS_REJECT_UNAUTHORIZED`, unless RA-5624 carries a formal exception.

## Evidence Capture

Attach a concise run summary to RA-4956 and the Linear command center:

- `origin/main` commit SHA.
- Pass/fail result for every local command.
- Latest production smoke run ID.
- Latest pilot tester canary run ID.
- Production health result.
- Sandbox health result.
- Vercel env presence audit result, with names only and no values.
- Release-gate scorer output showing 100/100.

Then update:

- `SHIP_GATE_PM_DASHBOARD_2026-05-28.md`
- `PHILL_ACTION_BOARD_2026-05-28.md`
- `SHIP_GATE_COMMAND_CENTER_INDEX_2026-05-28.md`

## Failure Routing

| Failure observed                 | Route to                        | Next action                                                                |
| -------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| `pnpm type-check` fails          | RA-4954 regression              | Fix the type drift on `origin/main`, then rerun from a fresh worktree.     |
| `pnpm lint` fails                | RA-4956 gate maintenance        | Fix only lint failures blocking the gate; avoid unrelated cleanup.         |
| Unit or focused Vitest fails     | Owning feature issue            | Fix the failing behavior and rerun the smallest failing suite first.       |
| `pnpm audit --prod` fails        | RA-4955 regression / dependency | Patch or formally exception the advisory before any pilot decision.        |
| Sandbox smoke fails or hangs     | RA-5624                         | Repair sandbox env, alias, auth helper, or smoke data path.                |
| Pilot tester canary fails        | RA-5615                         | Repair GitHub Actions secrets/config and rerun canary before strict gate.  |
| Owner evidence criteria fail     | RA-5628                         | Attach proof and change only proven files to `status: pass`.               |
| Security evidence criteria fail  | RA-2989 / RA-3034 / RA-3012     | Attach rotation/revocation/access-log/wrapper-adoption proof or exception. |
| Broad PR/dependency risk reopens | RA-5629 / RA-5630               | Split, review, or defer before ship approval.                              |

## Stop Conditions

Stop and call the release red if any of these are true:

- A command requires secret values to be pasted into chat, Linear, GitHub comments, screenshots, or logs.
- Sandbox health is still degraded.
- Pilot canary cannot run real `swarm`.
- Any owner evidence file is changed to `status: pass` without dated proof.
- The strict scorer is less than 100/100.
