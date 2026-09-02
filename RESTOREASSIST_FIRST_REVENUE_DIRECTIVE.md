# RestoreAssist — First Revenue Directive

Issued by Phill McGurk, 2 September 2026. Runs 30 days, to 2 October 2026.
These rules outrank every prior instruction for RestoreAssist.

## Day 0 numbers

| Number | Last 30 days | Read from |
| --- | --- | --- |
| Trials started | **not yet read** | Phill's browser, see below |
| % of trials reaching first win | **not yet read** | no screen shows this yet |
| Trial → paid conversions | **not yet read** | Phill's browser, see below |

**Why the agent could not read them (2 September 2026).** The only database an
agent can reach from its environment is the Supabase project named
`restoreassist-prod-2026`. It is **not** the database customers use. Three
facts prove it:

1. The launch-night test account created on restoreassist.app on 25 August is
   not in it, and neither is its organisation or inspection.
2. No account in it has been created or changed since 10 August, and no
   security event has been logged since 14 August, on a site that has been
   publicly advertised since 25 August.
3. Its scheduled-job history over the last 24 hours matches the Vercel
   **sandbox** project's job log exactly, run for run and job for job. The
   sandbox is what writes to it.

The live site runs on DigitalOcean with its own database, supplied as a
secret the app spec does not reveal. No agent holds a DigitalOcean token or
that database's address, so the Day 0 numbers come from Phill's browser:
**Dashboard → Admin → Business** on restoreassist.app shows new trials this
month, conversions this month, paying customers and monthly revenue. It does
not show first win; that needs an "activated" figure added (see WS4).

For the record, the sandbox database holds 107 accounts (99 with test-looking
emails), 4 paying, 37 in trial, no sign-ups since 27 July, and no Stripe
events ever.

**Definitions to use everywhere, so WS4 and the daily report count the same
thing:**

- **Trial started**: an account created in the window.
- **First win**: the user's first report saved. The product already records
  this moment, along with sign-up and first report started. Phill may replace
  it with a better moment; until then this is the working definition.
- **Conversion**: an account that moved from trial to paid in the window.

## Founder

Phill McGurk. Non-technical. He verifies everything in the browser, as a
customer would, never in code. Code is never the evidence. The browser is
the evidence.

## Mission (the only mission, 30 days)

Take RestoreAssist from released to revenue. A stranger can find it, start the
15-day trial, get a first win inside 10 minutes, and pay, with zero founder
intervention and zero errors.

## Standing rules (these override everything)

1. **Feature freeze.** No new features for 30 days. Any idea, including
   multi-trade expansion, gets one line in `BACKLOG.md`. Then stop.
2. **Spec-back before code.** No agent starts work until it has written back
   to Phill, in plain English: (a) one sentence of outcome, (b) the exact
   browser test Phill will personally run, (c) received his "GO". If you
   cannot write the browser test, you do not understand the task.
3. **Done means Phill clicked it.** Done = deployed to production + Phill
   personally passed the browser test + no new errors in logs for 24 hours.
   "Code complete", "PR open", "tests passing" are not done. This is the
   fire-vs-done principle applied to the whole product.
4. **Builder never verifies.** The agent that wrote it never signs it off.
   The SPM gate owns verification, per the existing I1–I7 invariants.
5. **One task in flight per workstream.** Finish it or kill it before
   starting the next.
6. **Production safety.** This is a live product. Staging first. State the
   rollback in one line before every deploy. No destructive data changes
   without an explicitly flagged founder approval.
7. **Report in customer language.** Daily, five lines maximum: what a
   customer can do today that they couldn't yesterday · what Phill must test ·
   blockers · next. No jargon, no file paths, no "refactored".

## Day 0, before any other work

Pull three numbers and write them at the top of this file. These numbers
locate the real bottleneck. If trials-started is near zero, WS5 and the
Founder's Lane move to the front, not more code.

## Workstreams (strict order, no parallel starts without founder GO)

### WS1 — Trial front door (days 1–4)

Walk the entire path as a stranger: marketing page → sign-up → inside a
working account. Use the August onboarding audit as the map. Log every break,
dead end, confusing step, and error. Fix in order of severity.
**Done when:** Phill signs up with a fresh email and is inside a working
account in under 3 minutes, zero errors.

### WS2 — First win in 10 minutes (days 3–8)

A new restoration operator must hit one moment of real value fast. Phill
defines what "first win" is (see Founder's Lane), likely the first job created
or first report generated. Guide the new user straight to it.
**Done when:** Phill, acting as a brand-new user, goes from empty account to
first win in under 10 minutes with no outside help.

### WS3 — Money path (days 6–14)

Pricing page clear. Card capture works. Trial expiry handled cleanly. Day-3 /
day-10 / day-14 trial emails send. A real test card completes a real
subscription end to end.
**Done when:** Phill completes a live test purchase and sees the money land
in the payment dashboard.

### WS4 — Founder revenue screen (days 10–16)

One page inside RestoreAssist admin: trials started, activated (hit first
win), paid, monthly recurring revenue. Updated daily. This is deliberately the
first working panel of Mission Control, built inside the live product, not as
a new system.
**Done when:** Phill opens one URL each morning and reads those four numbers
without asking anyone.

*Note, 2 September:* the admin Business page already shows monthly revenue,
paying customers, new trials and conversions for the calendar month. It lacks
the "activated" figure and a 30-day window. WS4 is a change to that page, not
a new one.

### WS5 — Sales ammunition (days 12–20)

One-page pitch (restoration only). Five-minute demo script. Ten outreach
templates in Phill's own voice, leaning on his 30 years and CARSI standing.
Trial follow-up email set.
**Done when:** Phill has sent the first ten real messages using them.

## The Founder's Lane (Phill's jobs; agents cannot do these)

- Decide pricing by day 5. One call, done. Adjustable later.
- Define "first win" for WS2. You know the restorer's moment of relief better
  than anyone alive.
- From day 12: twenty outreach touches per day into your own network. Calls,
  texts, LinkedIn. You are the distribution channel.
- Book and run demos. The product converts trials; you create them.

## Backlog (parked, not dead)

See `BACKLOG.md`. The product earns the right to widen.

## Open questions from the agent, 2 September

- **The August onboarding audit** could not be found under that name. The
  closest match is the launch-night report of 25 August, which walked
  sign-up, trial, login and job creation on the live site and found nothing
  broken up to report generation. WS1 will use it unless Phill names another.
- **The I1–I7 invariants** are not labelled anywhere in the project. Until
  they are pointed to, "builder never verifies" is applied as written, with
  Phill as the gate.
- **The sandbox is writing to a database with real-looking accounts.** Its
  scheduled jobs include trial reminders and win-back emails. Both reported
  zero candidates and zero sent today, so nothing has gone out, but a
  sandbox that can email 37 trial accounts is a production-safety question
  for Phill to rule on.
