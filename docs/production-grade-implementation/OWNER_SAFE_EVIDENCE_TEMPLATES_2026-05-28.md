# RestoreAssist Owner-Safe Evidence Templates

Date: 2026-05-28
Last refreshed: 2026-05-28 12:06 AEST
Purpose: give the owner and senior-PM swarm copy/paste-safe proof templates for closing the remaining ship-gate blockers without exposing secret values.

## Rules For Every Template

- Paste names, run IDs, URLs, timestamps, and status only.
- Never paste secret values, tokens, passwords, private keys, connection strings, or screenshots that reveal them.
- If proof is a screenshot, crop or blur values before attaching it.
- If the proof is not current, say "not current" and keep the gate red.
- If a required item cannot be completed, record a formal exception with owner, expiry date, risk, and compensating control.

## RA-5615 - Pilot Canary Secrets

Use this after adding the GitHub Actions secrets and rerunning the canary.

```md
RA-5615 evidence update

Date/time:
Owner:

GitHub Actions secrets, presence only:

- `PILOT_TESTER_USER_POOL_JSON`: present / missing
- `PILOT_TESTER_DATABASE_URL`: present / missing

Canary run:

- Workflow: Pilot tester canary
- Branch/ref:
- Run URL:
- Dry-run result:
- Swarm result:

Decision:

- RA-5615 is green / still red.

Notes:

- Values were not pasted or screenshotted.
- Secrets are sandbox-only, not production.
```

## RA-5624 - Sandbox Env And Smoke Target

Use this after repairing sandbox Vercel env and checking health.

```md
RA-5624 evidence update

Date/time:
Owner:
Vercel project:

Sandbox health:

- URL: https://restoreassist-sandbox.vercel.app/api/health
- status:
- database.status:
- env.status:
- missing env names, if any:

Env/TLS decision:

- `STRIPE_SECRET_KEY`: present at runtime / still missing
- `RESEND_API_KEY`: present at runtime / still missing
- `XERO_WEBHOOK_KEY`: present at runtime / still missing
- `NODE_TLS_REJECT_UNAUTHORIZED`: removed / formal exception attached

Deployment/alias:

- Current deployment or alias checked:
- Current main commit, if known:

Decision:

- RA-5624 is green / still red.

Notes:

- No secret values were pasted.
```

## RA-2989 - Exposed Credential Rotation

Use this after rotation/revocation work. Record names only, not values.

```md
RA-2989 evidence update

Date/time:
Owner:

Credential rotation table:
| Credential name | Rotated? | Revoked old value? | Downstream envs refreshed? | Proof link/location |
| --- | --- | --- | --- | --- |
| ANTHROPIC_API_KEY | yes/no/n/a | yes/no/n/a | yes/no/n/a | |
| LINEAR_API_KEY | yes/no/n/a | yes/no/n/a | yes/no/n/a | |
| PERPLEXITY_API_KEY | yes/no/n/a | yes/no/n/a | yes/no/n/a | |
| GITHUB_TOKEN | yes/no/n/a | yes/no/n/a | yes/no/n/a | |
| TAO_PASSWORD | yes/no/n/a | yes/no/n/a | yes/no/n/a | |

Canonical store reconciled:

- 1Password:
- local `.env.local`:
- Vercel:
- Railway:
- GitHub:
- Linear/provider stores:

Final audit:

- No raw secret values in this update.
- Remaining exceptions:

Decision:

- RA-2989 is green / still red.
```

## RA-3034 - Supabase Service-Role Closure

Use this after Supabase service-role exposure closure proof is gathered.

```md
RA-3034 evidence update

Date/time:
Owner:
Supabase project:

Closure proof:

- Service-role key rotated: yes/no
- Affected envs refreshed: yes/no
- Git-history decision: scrubbed / formal exception / pending
- Supabase access-log audit completed: yes/no
- Unexpected access found: yes/no

Proof locations:

- Rotation proof:
- Env refresh proof:
- Git-history decision:
- Access-log audit summary:

Decision:

- RA-3034 is green / still red.

Notes:

- No service-role value was pasted.
```

## RA-3012 - Secret-Safe Railway Wrapper Adoption

Use this after proving process hardening, not just code merge.

```md
RA-3012 evidence update

Date/time:
Owner:

Wrapper proof:

- `scripts/railway_check.sh` ran successfully: yes/no
- Output showed masked values only: yes/no
- Raw `railway variables` prevention added: alias / pre-commit / documented prohibition / other
- Location of prevention proof:

Decision:

- RA-3012 is green / still red.

Notes:

- No raw Railway variable values were pasted.
```

## RA-5628 - Owner Launch Evidence

Use this before changing any evidence file to `status: pass`.

```md
RA-5628 evidence update

Date/time:
Owner:

Evidence files:
| File | Proof source | Current enough for `status: pass`? | Updated? |
| --- | --- | --- | --- |
| D1-billing-flows.md | | yes/no | yes/no |
| D3-revenue-reconciliation.md | | yes/no | yes/no |
| E1-app-store-metadata.md | | yes/no | yes/no |
| E2-testflight-stability.md | | yes/no | yes/no |
| F1-monitoring-alerting.md | | yes/no | yes/no |

Decision:

- RA-5628 is green / partially green / still red.

Notes:

- Deferred files stayed deferred where proof was missing.
- No secret values or private customer data were pasted.
```

## RA-5629 - PR #1199 Split Or Senior Review

Use this before merging or closing #1199.

```md
RA-5629 evidence update

Date/time:
Owner:
PR: https://github.com/CleanExpo/RestoreAssist/pull/1199

Decision:

- Split into smaller PRs / senior full-diff review / close and recreate / keep on hold

If splitting:

- Documentation PR:
- Tooling/scripts PR:
- AI guardrails PR:
- API hardening PR:
- Prisma/schema PR:
- Mobile PR:
- Supabase PR:

If senior-reviewed:

- Reviewer:
- Review date:
- Residual risks:
- Required follow-ups:

Decision:

- RA-5629 is green / still red.
```

## RA-5630 - Dependency Rebuild

Use this when recreating closed Dependabot #1204 as smaller PRs.

```md
RA-5630 evidence update

Date/time:
Owner:

Dependency lanes:
| Lane | PR URL | Checks green? | Vercel previews green? | Tests attached? |
| --- | --- | --- | --- | --- |
| Tooling/types | | yes/no | yes/no/n/a | |
| UI/forms/media | | yes/no | yes/no/n/a | |
| Observability/payment/email | | yes/no | yes/no/n/a | |
| Mobile/device | | yes/no | yes/no/n/a | |
| AI providers | | yes/no | yes/no/n/a | |
| Remotion | | yes/no | yes/no/n/a | |

Decision:

- RA-5630 is green / still red.

Notes:

- Broad #1204 was not revived as one PR.
```

## RA-4956 - Final Strict Gate

Use this only after upstream blockers are green or formally excepted.

```md
RA-4956 strict gate update

Date/time:
Owner:
Clean checkout commit:

Preconditions:

- RA-5615 green/excepted:
- RA-5624 green/excepted:
- RA-2989 green/excepted:
- RA-3034 green/excepted:
- RA-3012 green/excepted:
- RA-5628 green/excepted:
- RA-5629 green/excepted:
- RA-5630 green/excepted:

Command results:

- `pnpm type-check`:
- `pnpm lint`:
- `npx vitest run`:
- `pnpm audit --prod --audit-level=moderate`:
- `pnpm test:smoke:sandbox`:
- `pnpm tsx scripts/release-gate-score.ts --strict`:

Final score:
Go/no-go:

Notes:

- No secret values were pasted.
```
