# Intent

Where an idea enters RestoreAssist before anyone writes a spec.

An `intent.md` states **what is wanted, why, and under which constraints**, in the
words of the person who wants it. It is not a spec, not a plan, and not a ticket.
It is the artefact that lets someone who does not open a terminal — a restoration
contractor, an estimator, whoever just got off the phone with a customer — put
something into the chain without first translating it into engineering language.

## Why this directory exists

The repo already has 34 specs and 35 plans under `docs/superpowers/`. Every one of
them was started by an engineer, in a session, with a terminal open. The chain has
always begun at `spec.md`, which means the only ideas that reach it are ideas
someone technical already agreed to write up.

This is Stage 1 of the AI-native SDLC: the originator brainstorms with Claude,
Claude writes the result to this directory using `TEMPLATE.md`, the originator
corrects what Claude misunderstood, and it is committed. From there the artefact
chain is the audit trail — who asked for what, when, and what was decided.

## The chain

```text
intent/*.md  →  docs/superpowers/specs/*.md  →  docs/superpowers/plans/*.md  →  the diff, its tests, the PR
   Stage 1              Stage 2                          Stage 3                        Stage 3–5
   what and why         what it must do                  how it will be built           what was built
```

Each stage is committed before the next begins. An intent that is accepted becomes
a spec; one that is not is closed, and closing is a real outcome, not a failure.

## How to write one

You do not need Git, and you do not need to be an engineer.

1. Describe the problem to Claude in your own words. What can you not do today?
   Who does it affect? What would better look like? What is out of scope?
2. Let Claude ask the questions an analyst would ask, until the idea is concrete.
3. Ask it to write the result as an `intent.md` using `intent/TEMPLATE.md`
   (the `intent-capture` skill does this).
4. **Correct anything it misunderstood.** This step is the point of the exercise —
   the file is a record of what *you* meant, not of what Claude inferred.
5. Commit it here. From claude.ai or Cowork, the GitHub connector can commit on
   your behalf.

## Naming

`YYYY-MM-DD-short-slug.md`, matching the convention in `docs/superpowers/specs/`.

## What belongs here, and what does not

| Belongs | Does not |
| --- | --- |
| "Contractors keep re-typing the same site details" | "Add a `siteId` column to `Inspection`" |
| "We lose the moisture history when a room is renamed" | "Change `onDelete: SetNull` to `Restrict`" |
| "Customers ask where their claim is" | A bug with a known one-line fix |

The right-hand column is already a design decision. If you know the answer, you are
writing a spec, and that is fine — write the spec. Intent is for when you know the
problem and not the answer.

## Status

An intent carries one of three statuses in its header:

- **draft** — being written or corrected. Nothing acts on it.
- **accepted** — a spec should be written from it. This is the trigger for Stage 2.
- **closed** — deliberately not proceeding. The reason stays in the file; a closed
  intent is a record of a decision, not litter, so it is not deleted.

## Open questions are load-bearing

The template's **Open questions** section is not a formality. An intent may be
committed with a question nobody can answer yet — that is more useful than an
intent that guesses, because the guess is indistinguishable from a fact once it
reaches a spec. `intent/2026-09-02-australian-lead-presumption-year.md` is the
worked example: it is blocked on a single verifiable fact, it says so, and it says
what would unblock it.
