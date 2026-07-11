---
name: data-source-ssot
description: Catch the "same data lives in two differently-keyed tables, two features read different ones, they silently disagree" failure class. Use whenever two models hold overlapping fields, a reader picks a pricing/config/settings store, or two surfaces (e.g. Margot vs the estimator, dashboard vs API) should show the SAME number but might not.
automation: manual
intents: schema, prisma, tenancy, source-of-truth, pricing, config, drift, resolver, organizationId, userId
---

# Data-Source SSOT (single source of truth)

The class: **the same logical data is stored in two tables keyed differently, one code
path reads one and another reads the other, so they drift and two features answer the same
question with different numbers — with no error anywhere.**

> Golden rule: **For any logical fact, exactly one store is authoritative and exactly one
> resolver reads it.** If two readers can disagree, you have two sources of truth — a bug
> waiting for a customer to notice.

## The case that proved it (RA-7026)

- Contractor pricing lived in **`OrganizationPricingConfig[organizationId]`** (written by
  the setup wizard, read by Margot) AND **`CompanyPricingConfig[userId]`** (read by every
  estimator: `rate-engine`, `/api/calculate`, `nir-cost-estimation`). Field-identical
  tables, different tenancy keys, linked only by a one-time backfill.
- In prod: **10** org rows vs **1** user row across 90 orgs. So Margot quoted the real
  configured rate while the estimator fell through to a fallback — **the same job priced two
  ways**, invisible from any single diff.
- Fix: one `resolveEffectivePricing(userId)` resolver (org config authoritative → user
  fallback → null) that BOTH Margot and the estimators call. One store, one resolver.

## Front-foot detector (run it)

```bash
node scripts/ci/check-data-source-ssot.mjs
```

It parses `prisma/schema.prisma`, finds model pairs that share a high fraction of field
names but have **different `@unique` keys** (the tenancy-key-drift signature), and prints
them as candidates that need ONE authoritative resolver. Run it after any schema change
that adds a `*Config` / `*Settings` / `*Pricing` / `*Profile` model. A hit is not always a
bug (a real 1:1 mirror can be legitimate) — but every hit MUST have a single documented
resolver, or it is drift.

## When you add or touch a "config/settings/pricing" store — the checklist

1. **Name the authoritative store + key** in one sentence (e.g. "org pricing =
   `OrganizationPricingConfig[organizationId]`"). Write it in the resolver's doc comment.
2. **One resolver, every reader.** Grep for all readers of the *other* table
   (`grep -rn "<otherModel>\\." app lib`) and route them through the resolver. Leaving one
   behind re-opens the drift.
3. **Write paths too.** If a second surface (dashboard editor, admin panel) writes the
   *non-authoritative* table, its edits vanish from the authoritative reads. Repoint writes
   to the authoritative store, or the loop is only half-closed.
4. **Prove they agree.** Add a parity test: feature A's number == feature B's number for
   the same tenant/field. That test is the regression guard.
5. **Tenancy key is a decision, not an accident.** `organizationId` vs `userId` changes who
   shares the value. Pick deliberately; CLAUDE.md rule 2 pins `session.user.id` for *auth*,
   which is NOT automatically the right key for shared org data.

## Guardrails

- "Both tables have the same fields so it doesn't matter which I read" is the exact
  rationalisation that ships the drift. It matters: they hold *different values*.
- A one-time backfill (`scripts/backfill-*`) is not a sync. After it runs, the tables drift.
- Field-identical models are a smell, not a convenience — prefer one model + a tenancy
  column, or an explicit authoritative/derived relationship.

## Related

- [[external-contract-verification]] — right store, wrong *shape* (the sibling silent-fail).
- [[rag-corpus-hygiene]] — the corpus is also a data source; the same "what is authoritative"
  discipline applies to what may ground an answer.
