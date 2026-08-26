# Day 1 — your first hour, in order

Written 2026-08-25 overnight. Everything below was verified against the live site unless
marked otherwise. Do these in order; each later step assumes the earlier ones.

## 1. Delete the production test account (2 min) — do this first

I created one real account on production to prove the funnel. **This repository is
public, so its email address and user ID are deliberately not written here.**

Find it by:

- **Name:** `RA Launch Check`
- **Created:** 2026-08-25, 15:54 UTC
- It is a plus-addressed alias of your own support address, so it reaches your inbox
- It also created one organisation and one inspection at "12 Launch Check Street, Brisbane QLD"

```sql
SELECT id, email, "createdAt" FROM "User" WHERE name = 'RA Launch Check';
```

Delete the user, its organisation and that inspection. **It is a live ADMIN account** —
that is why this is step 1 and not step 8.

Its password was generated per-session and never committed; it lived only in a
git-ignored file in the build container, which no longer exists.

## 2. Merge the signup alert (2 min)

**PR #2052** (ready for review, all 6 checks green) — https://github.com/CleanExpo/RestoreAssist/pull/2052

Right now nobody tells you when someone signs up. This fixes that for both email
registration and Google sign-in. It is already marked ready for review, so it is
one click to merge.

Tests: 4 new + 2 regression, all passing. `tsc --noEmit` clean repo-wide. Lint clean.

## 3. Set two environment variables on DigitalOcean (5 min)

**Not Vercel.** DigitalOcean App Platform, app `3654f979-16cb-4b7c-afae-9e89746ea5c6`.

| Variable | Value | Why |
|---|---|---|
| `SIGNUP_ALERT_EMAIL` | your address | Where signup alerts go. Step 2 does nothing without it. |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | your Resend key + verified sender | **No transactional email works at all right now.** Confirmed missing on production. |

*(Mailtrap works as an alternative: `MAILTRAP_API_KEY` + `SENDER_EMAIL`.)*

Until the email provider is set: no welcome emails, no portal invitations, no signup
alerts. Everything else works.

## 4. Redeploy — production is running a stale build (10 min)

Production is serving a build that predates commit `9352cbe` (#2043, "Release readiness:
secure paid pilot and fail-closed production gates").

**How this was proven:** `https://restoreassist.app/api/health` returns
`"missing":["RESEND_API_KEY", ...]`. `RESEND_API_KEY` is not in the current
`RECOMMENDED_VARS` array on `main` — #2043 removed it. Only older code can emit that
string. Re-run the check yourself:

```bash
curl -s https://restoreassist.app/api/health
```

**Corrected 26/08/2026.** `.do/app.yaml` is not a source-repo spec — it carries no branch
key and no push-deploy flag. It is a container-image spec pinned to a GHCR digest. Merging
to `main` builds and publishes the image but never deploys it. That is why main has moved
and production hasn't.

**A cache purge alone will not fix this.** `/api/health` is `cf-cache-status: BYPASS` —
Cloudflare never caches it, so what you're seeing is the live running build. It needs an
actual redeploy.

**Updated 26/08/2026 — there is now an automated path.** Until today
`deploy-production.yml` was named `(BLOCKED)` and exited 1 before any DigitalOcean call,
so no redeploy was possible through CI. Both blockers have been lifted: the pilot canary
no longer fails the release gate when its secrets are unprovisioned, and the deploy
workflow now activates instead of refusing.

To promote a release:

1. **Dispatch the release gate on `main`** and wait for it to finish. It must conclude
   successfully and upload a `release-gate-report-<sha>` artefact; the deploy verifies
   that receipt against the exact SHA and refuses without it.

   ```bash
   gh workflow run release-gate.yml --ref main
   ```

2. **Dispatch the deploy**, passing the gate's run ID and the full 40-character `main`
   SHA. Both are required, and the SHA must match the revision being deployed.

   ```bash
   gh workflow run deploy-production.yml --ref main \
     -f release_gate_run_id=<run-id> \
     -f confirm_sha=<40-char-sha>
   ```

The deploy verifies the attestation, renders the spec, proves migration parity and
database identity, captures a rollback target before mutating anything, smokes production
afterwards, and rolls back automatically if that smoke fails.

**One risk is accepted rather than solved.** If the GitHub runner dies mid-activation,
nothing outside it cancels or reverts, and production can sit part-applied. The run emits
a warning saying so. If a deploy run ends abnormally, check the DigitalOcean deployment
state for the app before starting another release.

## 5. Purge the Cloudflare cache (2 min)

`cache-control: s-maxage=31536000` — roughly a year. A correct deploy stays invisible
behind the edge cache until you purge. Do this after every deploy, before judging whether
it worked.

## 6. Verify the deploy took (2 min)

```bash
curl -s https://restoreassist.app/api/health
```

`RESEND_API_KEY` should no longer appear in `missing`. If it still does, either the
deploy didn't happen or the cache wasn't purged.

## 7. Send welcome emails by hand (15 min)

Use `docs/launch-kit/01-welcome-email.md`. For the first ~50 signups, send these
personally — it converts far better than a template, and right now the automated one
can't send anyway.

**Lead with the AI-key step.** It is the single most likely place a trial stalls: a new
user has 50 credits and cannot generate a single report until they paste their own
Anthropic or OpenAI key into Settings → AI Providers. This is by design (it's why the
plan is $99 flat), but nothing on the signup screen explains it.

## 8. Post the day-2 social follow-up (5 min)

`docs/launch-kit/04-day2-social.md`. Check the link preview renders before posting.


## The one decision only you can make

**The ad says "Start your 15-day trial for free now." The trial cannot produce a report
without the customer first obtaining a paid Anthropic or OpenAI API key.**

That is a defensible model — it's genuinely cheaper for them and it's why you can charge
$99 flat. But a restorer arriving from a social ad will not expect it, and nothing in the
signup flow warns them before they hit it.

Three options, cheapest first:

1. **Say it on the pricing page and the signup screen** — one line: "You bring your own
   AI key and pay the provider directly, at cost." Sets the expectation before the wall.
2. **Put it in the welcome email** — already drafted in step 7.
3. **Change the model** — platform-funded AI for trial users only. This contradicts the
   explicit "zero platform cost" design in `lib/ai/resolve-workspace-ai-key.ts` and has
   real cost exposure. Not a decision to make at 2am, and not one I'd make for you.

I did not touch pricing, copy, or the model — all three are outside tonight's remit.
