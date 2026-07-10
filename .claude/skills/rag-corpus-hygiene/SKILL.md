---
name: rag-corpus-hygiene
description: Catch "content that should never have entered the shared vector corpus" BEFORE ingest — tenant-specific or product-specific dollar figures (a global rate card, cross-product training $ rates) that a no-tier-weighting retriever can surface into the wrong answer. Use whenever you ingest into IicrcChunk / any RAG corpus, author a KNOWLEDGE doc, or change retrieval.
automation: manual
intents: rag, corpus, ingest, embedding, iicrcchunk, provenance, knowledge, pricing, retrieval, margot
---

# RAG Corpus Hygiene

The class: **something gets embedded into a shared corpus that must not ground a
particular answer — a tenant-specific or product-specific number — and because the
retriever has no tenancy/tier filter, it surfaces into the wrong reply.**

> Golden rule: **The shared corpus holds durable, non-tenant, non-priced KNOWLEDGE.
> Anything tenant-specific, product-specific, or a live-changing number (a charge-out
> rate) is INJECTED per-request, never ingested.** Once embedded, you cannot control which
> question retrieves it.

## The two cases that proved it (RA-7026)

1. **Global rate card ingested.** A `DR-PRICINGGUIDE` doc with fixed charge-out rates went
   into the shared `IicrcChunk` KNOWLEDGE tier. `retrieveForReasoning` searches ALL tiers,
   cosine-only, **no tier weighting** — so every contractor's Margot could quote one global
   number. It had to be deleted, and pricing moved to a live per-tenant injection.
2. **Cross-product contamination.** ~40k **CARSI** (a *different* product — a training LMS)
   chunks live in RestoreAssist's KNOWLEDGE tier, carrying training *example* rates
   (`$440/hr`, `$800/hr`, `$30/hr`). On a mixed standards+pricing question those can land
   next to the contractor's real rates. Fix: exclude the KNOWLEDGE tier on pricing intent.

## Front-foot detector (run it BEFORE any ingest)

```bash
node scripts/ci/check-corpus-hygiene.mjs --dir <staging-dir>
```

It scans every `.txt`/`.md` staged for ingest and flags **charge-out dollar patterns**
(`$440/hr`, `120 per day`, `ex-GST` rate lines). A hit means a price is about to enter the
shared corpus — stop and move it to a live injection instead. Job-value *medians* as
aggregate context are lower-risk; charge-out *rates* are the hard deny. Run with
`--strict` to fail the ingest.

## The pre-ingest gate — before you POST to /api/cron/ingest-standards

1. **Provenance is mandatory and correct.** `AUTHORITATIVE_STANDARD` = citable standards
   text only. `KNOWLEDGE` = reasoning-only. Never tag marketing, tenant data, or pricing as
   either — it doesn't belong in the corpus at all.
2. **No charge-out rates.** Run the detector. Pricing is `OrganizationPricingConfig` injected
   at request time (see [[data-source-ssot]]), never embedded.
3. **One product per corpus, or tag the product.** Do not ingest product B's material into
   product A's corpus unless it is genuinely shared domain knowledge AND it carries no
   product-specific numbers. CARSI content in RestoreAssist is the cautionary tale.
4. **No customer PII, names, or addresses.** Aggregate only.
5. **Assume the retriever has no filter.** `retrieveForReasoning` returns all tiers with no
   weighting. Design as if any chunk can surface for any question — because it can. If a
   figure must not appear in answer type X, it must not be in the corpus; gate retrieval by
   intent (e.g. `excludeKnowledge` on pricing questions) as defence-in-depth.

## Removing a bad ingest

Ingest is idempotent-ADD (upsert by contentHash) — re-ingesting a corrected doc does NOT
delete the old chunks. Removal is a scoped `DELETE FROM "IicrcChunk" WHERE standard=...`,
which the prod-write guard blocks until the operator names the table. Plan removal as a
deliberate step, not an afterthought.

## Guardrails

- "It's useful domain knowledge" does not justify embedding a number that changes per tenant
  or per day. Usefulness ≠ admissibility.
- A retrieval tier filter (`excludeKnowledge`) is defence-in-depth, not the primary control.
  The primary control is **not ingesting the figure in the first place.**

## Related

- [[data-source-ssot]] — pricing's authoritative store; why rates are injected, not embedded.
- [[external-contract-verification]] — the other "wrong data reaches the answer" class.
