# Intent: <short title, in the originator's words>

**Author:** <name, role> · **Date:** <YYYY-MM-DD> · **Status:** draft

## Problem

What cannot be done today, and what it costs. Concrete beats general: "handlers
spend about a third of call time on status-only queries" is worth more than
"visibility is poor". If you have a number, put it here; if you do not, say so
rather than inventing one.

## Proposed outcome

What better looks like, described as what someone can then do. Not how it is
built — an outcome, not a design. If you find yourself naming a table or a
component, that belongs in the spec, not here.

## Affected users and systems

Who is affected, and which parts of RestoreAssist are likely involved. A rough
guess is fine; the spec will correct it.

## Constraints

The things that are not negotiable, and why. These are the most valuable lines in
the file, because they are the ones a spec cannot recover on its own. For example:

- Which jurisdiction this applies to. AU and NZ differ on GST, on asbestos and
  lead presumption years, and on which regulator is notified — an intent that does
  not say which country it is about will produce a spec that is wrong for one of
  them.
- Whether it touches a regulatory claim. Anything asserting a year, a threshold or
  a standard has to come from `lib/compliance/regulatory-registry/` and be
  verifiable against a primary source, not written from memory.
- Whether it touches money, evidence custody, or organisation isolation.

## Out of scope

What this is deliberately not. Writing this down is what stops a spec quietly
growing into something nobody asked for.

## Open questions

Questions that must be answered before or during the spec, each with **who can
answer it**. An unanswered question is a legitimate reason to commit an intent —
far better than an assumption that reads like a fact by the time it reaches code.

Where a question is a matter of verifiable fact (an edition year, a threshold, a
commencement date), say what source would settle it. "Unverified" is a real answer.

## Evidence

Where this came from: a customer conversation, a support pattern, a breached
control band, an incident. If it came from an alert or a metric, name it and give
the timestamp. If it came from one person's judgement, say that too — that is not
a weaker source, it is a different one, and the spec should know which it is.
