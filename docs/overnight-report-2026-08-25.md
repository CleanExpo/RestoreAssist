# Overnight report — launch night, 2026-08-25

Session ran ~15:45–16:25 UTC (01:45–02:25 AEST). Founder asleep. Site publicly advertised.

---

## 1. FUNNEL: **WORKS** end to end — with one expectation gap you must close today

A stranger can land, read the offer, sign up, get a live 15-day trial with 50 credits, log
in, and create a job. **Proven on production**, not localhost, not a preview:

| Step | Result | Evidence |
|---|---|---|
| Pricing reads correctly | PASS | `/pricing` live: $99, 15-day trial, 50 report credits, GST, $1.98 extra reports. Zero `restoreassist.com.au` references. |
| Signup → trial activates | PASS | `POST /api/auth/register` → `201`, `subscriptionStatus: TRIAL`, `creditsRemaining: 50`, `trialEndsAt` = **exactly +15 days**, org created, `stripeCustomerId: null`. |
| Login → session | PASS | NextAuth CSRF + credentials → `200`, session returns `role: ADMIN`. |
| Create a job | PASS | `POST /api/inspections` → `201`. Credits correctly **not** consumed. |
| Stripe webhook | PASS | `GET` → `405`, unsigned `POST` → `400`. Signature verification is live and fails closed. |
| Duplicate email | PASS | `400 CONFLICT`, no enumeration leak. Password hash correctly stripped from the response. |
| Bot gate off-Vercel | PASS | `verifyBotId()` soft-allows when `VERCEL !== "1"`. It does **not** block DigitalOcean signups. |
| **Generate a report** | **BLOCKED BY DESIGN** | `402 PAYMENT_REQUIRED` — "No active ANTHROPIC API key configured for this workspace." |

**The gap, stated plainly:** your ad says *"Start your 15-day trial for free now."* A new
user gets 50 report credits and **cannot generate a single report** until they obtain
their own Anthropic or OpenAI API key and paste it into Settings → AI Providers.

This is deliberate, not a bug — `lib/ai/resolve-workspace-ai-key.ts` is explicit that a
route falling back to a platform key is "a platform-spend leak", and it's why you can
charge $99 flat. The product **does** surface it: live onboarding returns `ai_provider` as
the single **required** step, with the words *"You pay providers directly, at cost."*

But a restorer arriving from a social ad won't expect it, and nothing on the pricing or
signup page warns them **before** they hit a `402`. That's a conversion risk, not a
defect. Options are laid out in `docs/launch-kit/05-day-1-checklist.md` — cheapest is one
line of copy. **I did not change pricing, copy, or the model.** All three are outside
tonight's remit and yours to decide.

**Consequently: "credit consumed" was never verified.** Doing so requires a real, paid
Anthropic key. Metered/paid APIs were forbidden tonight, so I stopped rather than spend.

---

## 2. Signups and trials overnight

**Cannot be counted from this session** — no `DATABASE_URL` or prod DB credential exists
in this container, and I won't guess at a database. The health endpoint confirms the DB is
connected and serving (`"database":{"status":"ok"}`).

Run this yourself:

```sql
SELECT COUNT(*) FROM "User" WHERE "createdAt" > NOW() - INTERVAL '12 hours';
```

**One of any count is mine** — see cleanup in the first-hour steps below.

---

## 3. Incidents

**None.** Watchdog polled 5 endpoints every 10 minutes for the whole session:
`/`, `/pricing`, `/signup`, `/portal/login`, `/api/health`.

**Every check returned 200.** Zero non-200 responses, so zero incidents. Latency 0.19s–1.8s
(`/api/health` is slowest — it does a live DB round-trip at ~1.3s). Raw log:
`.watchdog/watchdog.log` (container-local; it dies with the session).

---

## 4. PRs ready to merge

**[#2052 — Tell the founder when someone signs up](https://github.com/CleanExpo/RestoreAssist/pull/2052)** (draft)

> **SHIP-DELTA:** a stranger's signup now reaches the founder's inbox instead of dying
> silently in the database.

`notifyWelcome` notified the **new user**; nothing reached you. Adds
`sendFounderSignupAlert`, wired into **both** entry points — email registration and Google
sign-in, so ad traffic choosing "Continue with Google" isn't invisible.

It can never break signup: the regression test makes the alert *reject* and asserts the
signup still returns `201`. A control that cannot fail is not a control.

Checks: 4 new + 2 regression tests passing (11/11 in the register suite), `tsc --noEmit`
**0 errors repo-wide**, lint clean.

---

## 5. Your first hour, in order

Full detail in **`docs/launch-kit/05-day-1-checklist.md`**.

1. **Merge [#2052](https://github.com/CleanExpo/RestoreAssist/pull/2052)** (mark ready → merge). 2 min.
2. **Set env vars on DigitalOcean** (*not* Vercel — app `3654f979-16cb-4b7c-afae-9e89746ea5c6`):
   - `SIGNUP_ALERT_EMAIL` — step 1 does nothing without it
   - `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — **no transactional email works at all right now**
3. **Redeploy — production is serving a stale build.** See §6. 10 min.
4. **Purge the Cloudflare cache.** `s-maxage=31536000` (~1 year); a correct deploy is invisible until you do. 2 min.
5. **Verify:** `curl -s https://restoreassist.app/api/health` — `RESEND_API_KEY` should be gone from `missing`.
6. **Send welcome emails by hand** using `docs/launch-kit/01-welcome-email.md`. **Lead with the AI-key step** — it's where trials will stall.
7. **Post the day-2 follow-up** — `docs/launch-kit/04-day2-social.md`.
8. **Delete my test account:** `support+ra-launchcheck-20260825@synthex.social` (user `cmt8uia8q000v2c5xcbkftt9m`), plus its org and one inspection. It's a live ADMIN account and it pollutes your signup count.

---

## 6. Two production findings you didn't ask for

### Production is running a stale build

`/api/health` returns `"missing":["RESEND_API_KEY","GITHUB_WEBHOOK_SECRET"]`.
`RESEND_API_KEY` **is not in the current `RECOMMENDED_VARS` array on `main`** — commit
`9352cbe` (#2043, *"Release readiness: secure paid pilot and fail-closed production
gates"*, 2026-08-25 23:09 +1000) removed it. Only code predating that commit can emit that
string.

So the hardening in #2043 is **not live**. Verify in one command:

```bash
curl -s https://restoreassist.app/api/health
git show 9352cbe^:lib/env-check.ts | sed -n '/RECOMMENDED_VARS/,/as const/p'   # has RESEND_API_KEY
sed -n '/RECOMMENDED_VARS/,/as const/p' lib/env-check.ts                        # does not
```

Likely cause: `.do/app.yaml` pins `branch: main` but sets no `deploy_on_push`, and
DigitalOcean defaults that to **false**. This independently corroborates the 09:46Z handoff.

### No transactional email is configured

`RESEND_API_KEY` is genuinely absent on production. That kills welcome emails, **portal
invitations**, and (once merged) signup alerts. `NEXTAUTH_SECRET` **is** set — proven,
because it's in `REQUIRED_VARS` and `missingRequired` is empty — so **portal JWT auth is
functional**. Portal routes are live: `/portal/login` and `/portal/signup` return `200`,
an invalid token correctly `404`s.

---

## 7. What I did not do, and why

| Not done | Cause |
|---|---|
| **Headed-browser screenshots of production** | **Not possible in this environment.** Chromium cannot egress through the agent proxy — `ERR_CONNECTION_RESET`, two attempts (Playwright `proxy` option, then explicit `--proxy-server`). Three mission specs asked for screenshots at every step; **there are none**. Funnel verification is HTTP/API-level only. |
| Mobile viewport + console-error pass | Same cause. Layout and client-side JS errors are **unverified** on every page. |
| "Credit consumed" verification | Needs a paid Anthropic key; metered APIs forbidden tonight. |
| Overnight signup count | No DB credential in this container. Query provided in §2. |
| Portal end-to-end journey | Blocked at step one: the invitation email cannot send (no provider). Routes and auth verified instead. |
| Floor-plan work (Builds 1–3) | Explicitly out of scope tonight per the final brief. Untouched. |
| Running `night-run.sh` | It loops `claude -p --dangerously-skip-permissions` and calls `caffeinate`/`powercfg`. It's built for **your** machine. Running it in this container would spawn nested unsupervised agents. Files created (`NIGHT-MISSION.md`, `CHALLENGE-MISSION.md`, `NIGHT-QUEUE.md`, `NIGHT-LOG.md`); the loop was **not** started. `codex` is not installed here either, so the challenger lane could not run — **PR #2052 has not been independently reviewed.** |

### One correction, for the record

Mid-session I inferred production was stale from the *absence* of the string
`"No active ANTHROPIC API key configured"` in the repo. That inference was **wrong** — the
message is built with an interpolated `${provider}`, so my grep couldn't match it. It does
exist, at `lib/ai/resolve-workspace-ai-key.ts:36`. The staleness conclusion in §6 is a
**different and independent** proof (the `RECOMMENDED_VARS` array contents) and stands on
its own.
