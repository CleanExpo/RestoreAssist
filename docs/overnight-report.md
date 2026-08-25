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

**[#2052 — Launch night: tell the founder about signups, and stop the trial dead-ending](https://github.com/CleanExpo/RestoreAssist/pull/2052)** — ready for review, CI green

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

**CI status: all 6 checks green** on head `90b85bf` — Quality Checks, Route Safety Scan,
deterministic-acceptance, Agentic Browsing audit, DESIGN.md validation, Vercel Preview
Comments. Two earlier commits failed Quality Checks on the enforcing `type-check` step;
that was the "0 credits" type error described below, already fixed before the failure
notification arrived. The gate was **not** base-red — four other branches passed it in the
same window, so the failure was mine and is now resolved.

**[#2052](https://github.com/CleanExpo/RestoreAssist/pull/2052) also carries a second fix**

> **SHIP-DELTA:** a returning trial user is now told why report generation fails, instead
> of hitting a bare 402.

`/api/onboarding/status` marks `ai_provider` **required**, but the dashboard only acted on
it when the URL carried `?welcome=1`. A user who signed up, got distracted and came back
the next day saw nothing — `OnboardingModal` is mounted **nowhere** and `OnboardingGuide`
only on pricing-config. Adds a persistent banner (existing `TechLicenceBanner` pattern)
that names the *consequence*, not the task.

**Caveat:** its rendered appearance was never seen — no browser. Render logic is tested;
eyeball it before merging.

---

## 5. Your first hour, in order

Full detail in **`docs/launch-kit/05-day-1-checklist.md`**.

1. **Merge [#2052](https://github.com/CleanExpo/RestoreAssist/pull/2052)** — already marked ready, all 6 checks green. One click. 2 min.
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

**This is the live origin, not a cached page.** `/api/health` returns
`cf-cache-status: BYPASS` and `cache-control: private` — Cloudflare does not cache it, and
its `timestamp`/`uptime` change on every request. So this is the running build, and a
**cache purge alone will not fix it — it needs a redeploy.**

Third, independent corroboration: `/api/health` reports `uptime: ~59,400s` (~16.5 hours),
so the production process started around **2026-08-24 23:50 UTC** — *before* `9352cbe`
landed at 2026-08-25 13:09 UTC. A process that started before a commit cannot be running it.

Likely cause: `.do/app.yaml` pins `branch: main` but sets no `deploy_on_push`, and
DigitalOcean defaults that to **false**. This independently corroborates the 09:46Z handoff.

**Note on Cloudflare:** it *is* proxying (`server: cloudflare`, `cf-ray`, `__cf_bm`), and
HTML pages carry `cache-control: s-maxage=31536000`, so the ~1-year edge cache warning in
the briefs is real **for HTML**. It does not apply to `/api/health`, which is why that
endpoint is the trustworthy probe. Still purge after deploying, then re-check health.

### No transactional email is configured

`RESEND_API_KEY` is genuinely absent on production. That kills welcome emails, **portal
invitations**, and (once merged) signup alerts. `NEXTAUTH_SECRET` **is** set — proven,
because it's in `REQUIRED_VARS` and `missingRequired` is empty — so **portal JWT auth is
functional**. Portal routes are live: `/portal/login` and `/portal/signup` return `200`,
an invalid token correctly `404`s.

---

## 5b. Customer portal — verified as far as it can be

Written up in full at **`docs/customer-portal-launch.md`** (the portal had no docs at all).

Routes are live, portal JWT auth works, and every probed endpoint fails closed. The best
evidence is behavioural: a bogus bearer token to `/api/portal/auth/me` returns a clean
`401`, and that path runs `getSecret()`, which **throws** when the secret is missing — a
missing secret would surface as `500`. So `CLIENT_PORTAL_JWT_SECRET`/`NEXTAUTH_SECRET` is
genuinely set.

`/portal/insurer/<bad-token>` returning `200` was chased as a possible data leak and is
**clean** — a server component that verifies before it queries, returning a friendly
"Link Expired or Invalid" page rather than a 404.

**Blocked at step one:** the invitation email cannot send (no provider), and
`POST /api/portal/invitations` returns `201` regardless — the contractor sees "sent" for an
email nobody received. Recorded, not worked around.

---

## 6b. Public surface sweep

Every public page returns 200 (`/faq` is a 308 redirect). **35 unique internal links
extracted from 14 public pages and checked — exactly one non-200:**

- `/cdn-cgi/l/email-protection` → 404. A Cloudflare email-obfuscation artifact left in the
  HTML. Harmless to a normal visitor; not worth a PR.

Open Graph: `og:title` and `og:image` are present on every page sampled, and all three
distinct `og:image` URLs return `200 image/png`. **`og:url` is missing on every page** —
most platforms fall back to the shared URL, so previews still work, but it's the first
thing to check if one looks wrong. Filed, not fixed: it's copy/meta work and the brief
banned changes outside the MVP path.

Zero `restoreassist.com.au` references on any live public page.

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

### Corrections, for the record

Mid-session I inferred production was stale from the *absence* of the string
`"No active ANTHROPIC API key configured"` in the repo. That inference was **wrong** — the
message is built with an interpolated `${provider}`, so my grep couldn't match it. It does
exist, at `lib/ai/resolve-workspace-ai-key.ts:36`. The staleness conclusion in §6 is a
**different and independent** proof (the `RECOMMENDED_VARS` array contents) and stands on
its own.

I also reported `tsc --noEmit` as **0 errors** when that run had hit its `timeout` and
written a partial log. The completed run surfaced 2 real errors, both mine — the
google-signin alert read `trialEndsAt`/`creditsRemaining` off an object whose `select`
omits them, so **every Google signup would have alerted "0 credits"**. Fixed in `f5ebdd6`.
Every figure quoted above now comes from a run that exited 0.

And I briefly read "no `cf-cache-status`" from a header dump truncated by `head -15`.
Cloudflare **is** proxying. Corrected in §6.
