# Day 1 — your first hour, in order

Written 2026-08-25 overnight. Everything below was verified against the live site unless
marked otherwise. Do these in order; each later step assumes the earlier ones.

## 1. Merge the signup alert (2 min) — do this first

**PR #2052** — https://github.com/CleanExpo/RestoreAssist/pull/2052

Right now nobody tells you when someone signs up. This fixes that for both email
registration and Google sign-in. It's a draft PR — mark ready, then merge.

Tests: 4 new + 2 regression, all passing. `tsc --noEmit` clean repo-wide. Lint clean.

## 2. Set two environment variables on DigitalOcean (5 min)

**Not Vercel.** DigitalOcean App Platform, app `3654f979-16cb-4b7c-afae-9e89746ea5c6`.

| Variable | Value | Why |
|---|---|---|
| `SIGNUP_ALERT_EMAIL` | your address | Where signup alerts go. Step 1 does nothing without it. |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | your Resend key + verified sender | **No transactional email works at all right now.** Confirmed missing on production. |

*(Mailtrap works as an alternative: `MAILTRAP_API_KEY` + `SENDER_EMAIL`.)*

Until the email provider is set: no welcome emails, no portal invitations, no signup
alerts. Everything else works.

## 3. Redeploy — production is running a stale build (10 min)

Production is serving a build that predates commit `9352cbe` (#2043, "Release readiness:
secure paid pilot and fail-closed production gates").

**How this was proven:** `https://restoreassist.app/api/health` returns
`"missing":["RESEND_API_KEY", ...]`. `RESEND_API_KEY` is not in the current
`RECOMMENDED_VARS` array on `main` — #2043 removed it. Only older code can emit that
string. Re-run the check yourself:

```bash
curl -s https://restoreassist.app/api/health
```

`.do/app.yaml` pins `branch: main` but sets no `deploy_on_push`, and DigitalOcean
defaults that to false — which is very likely why main has moved and production hasn't.

**A cache purge alone will not fix this.** `/api/health` is `cf-cache-status: BYPASS` —
Cloudflare never caches it, so what you're seeing is the live running build. It also
reports `uptime` of ~16.5 hours, meaning the process started before #2043 even landed.
It needs an actual redeploy.

## 4. Purge the Cloudflare cache (2 min)

`cache-control: s-maxage=31536000` — roughly a year. A correct deploy stays invisible
behind the edge cache until you purge. Do this after every deploy, before judging whether
it worked.

## 5. Verify the deploy took (2 min)

```bash
curl -s https://restoreassist.app/api/health
```

`RESEND_API_KEY` should no longer appear in `missing`. If it still does, either the
deploy didn't happen or the cache wasn't purged.

## 6. Send welcome emails by hand (15 min)

Use `docs/launch-kit/01-welcome-email.md`. For the first ~50 signups, send these
personally — it converts far better than a template, and right now the automated one
can't send anyway.

**Lead with the AI-key step.** It is the single most likely place a trial stalls: a new
user has 50 credits and cannot generate a single report until they paste their own
Anthropic or OpenAI key into Settings → AI Providers. This is by design (it's why the
plan is $99 flat), but nothing on the signup screen explains it.

## 7. Post the day-2 social follow-up (5 min)

`docs/launch-kit/04-day2-social.md`. Check the link preview renders before posting.

## 8. Clean up the test account (2 min)

I created one real account on production to prove the funnel:

- **Email:** `support+ra-launchcheck-20260825@synthex.social`
- **User ID:** `cmt8uia8q000v2c5xcbkftt9m`
- Also created: one organisation and one inspection ("12 Launch Check Street, Brisbane QLD")
- Credentials are in `.watchdog/testcreds.txt` (untracked, container-local — it dies with the session)

Delete it so it doesn't pollute your signup numbers. It is a live ADMIN account.

## The one decision only you can make

**The ad says "Start your 15-day trial for free now." The trial cannot produce a report
without the customer first obtaining a paid Anthropic or OpenAI API key.**

That is a defensible model — it's genuinely cheaper for them and it's why you can charge
$99 flat. But a restorer arriving from a social ad will not expect it, and nothing in the
signup flow warns them before they hit it.

Three options, cheapest first:

1. **Say it on the pricing page and the signup screen** — one line: "You bring your own
   AI key and pay the provider directly, at cost." Sets the expectation before the wall.
2. **Put it in the welcome email** — already drafted in step 6.
3. **Change the model** — platform-funded AI for trial users only. This contradicts the
   explicit "zero platform cost" design in `lib/ai/resolve-workspace-ai-key.ts` and has
   real cost exposure. Not a decision to make at 2am, and not one I'd make for you.

I did not touch pricing, copy, or the model — all three are outside tonight's remit.
