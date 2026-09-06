---
name: intent-capture
description: Turn a described problem into a committed intent/*.md. Use when someone describes something they cannot do today, a recurring frustration, an idea for RestoreAssist, or a production anomaly that should enter the development chain — and when asked to "write this up", "capture this", or "file an intent". Not for work that already has a spec or a known fix.
---

# Capture an intent

You are helping someone put a problem into RestoreAssist's development chain in
their own words. The output is one file in `intent/`, written from
`intent/TEMPLATE.md`. Read `intent/README.md` for what the directory is.

The person you are talking to may not be an engineer, may not use Git, and does
not need to. Do not ask them to phrase things technically.

## Interview before you write

Do not produce the file from the first thing they say. Ask what an analyst would
ask, one or two questions at a time, until the idea is concrete:

- What can you not do today, and what does that cost? A number if they have one.
- Who is affected — which role, how often?
- What would better look like, from the affected person's point of view?
- What is explicitly out of scope?
- What must stay true regardless of how it is built?

Stop interviewing when you could hand the answer to an engineer who has never met
this person. Keep going while an important part is still a guess.

## Constraints this codebase always needs

Ask about these specifically, because a spec written without them is wrong rather
than incomplete, and the person may not know they matter:

- **Australia or New Zealand, or both?** Ask, and record the answer. The two
  differ on the GST rate, on the asbestos and lead presumption years, and on
  which regulator is notified — an intent that does not say which country it is
  about will produce a spec that is wrong for one of them. **Do not quote the
  figures from memory or from this file.** They live in `lib/gst-rules.ts` and
  `lib/compliance/regulatory-registry/`, which is the only place they are
  maintained; a copy in a skill is a copy that goes stale and then teaches every
  new intent the stale value.
- **Does it assert a regulatory fact?** Any year, threshold, standard or clause
  must come from `lib/compliance/regulatory-registry/`, verifiable against a
  source. Read the entry rather than recalling it. If the intent needs a fact
  nobody has verified, that is an open question, not an assumption to write
  down.
- **Does it touch money, evidence custody, or organisation isolation?** Say so.

## Writing the file

- Path: `intent/YYYY-MM-DD-short-slug.md`. Status starts at `draft`.
- Follow `intent/TEMPLATE.md` section for section.
- Use their words. You are recording what they meant, not improving it. Resist
  turning "the moisture history disappears when a room gets renamed" into
  "SketchRoom identity is not stable across rename operations" — the second is a
  diagnosis, and diagnosing is the spec's job, not yours.
- **Do not propose a solution.** If you know how you would build it, that
  knowledge belongs in the spec. An intent that names a table or a component has
  skipped a stage and pre-committed the design.
- AU/NZ spelling throughout: organisation, colour, authorised.
  `npm run check:au-english` enforces it.

## Open questions are the most valuable section

An unanswered question is a legitimate reason to commit an intent. Write the
question down with **who can answer it**, rather than filling the gap with a
plausible value — a guess is indistinguishable from a fact by the time it reaches
code, and this repo has already shipped one wrong regulatory year that way.

Where a question is a matter of verifiable fact, say what source would settle it.
Try to settle it first: the Exa web tools reach sources that `WebFetch` cannot.
"Unverified, and here is what would verify it" is a real answer.

## Then hand it back

Show the person the file and ask them to correct anything you misunderstood.
**This step is the point of the exercise.** The file's value is that it records
what they meant, and only they can confirm that it does.

Commit it once they are happy. Author and timestamp join the record.

## Do not use this skill when

- A spec already exists for the work — go and read it.
- The problem has a known one-line fix — just fix it.
- Someone is describing how to build something rather than what they need. That
  is a spec or a plan; say so and write the right artefact.
