# Financial Model v2 — Transparent Assumptions

> **Critique addressed:** C8 — Projections presented as facts without assumption disclosure  
> **Owner:** CEO/Founder

## The Problem with v1.0 Projections

The original model presented `$1.25B industry savings` and `$800k Year 3 revenue` as point estimates with no methodology. For an insurer, TPA, or investor audience, unsupported figures are either the most compelling thing in the pitch or the thing that causes dismissal — depending on whether they can withstand scrutiny. They couldn't.

## Assumption Register

| Assumption | Value Used | Source | Sensitivity |
|-----------|-----------|--------|-------------|
| Annual AU restoration claims | 250,000 (range 230,000–280,000) | ICA Annual Claims Report (update annually) | ±10% = ±$125M industry savings |
| Per-claim cost from fragmentation | $3,000 mid-point ($1,800–$4,200 range) | HYPOTHESIS — Phase 2 pilot to validate (CLAIM-002) | ±$1,000 = ±$250M industry savings |
| Re-inspection rate (current) | 20% (range 15–25%) | HYPOTHESIS — Phase 2 pilot to validate (CLAIM-003) | ±5% = ±$87.5M |
| NIR adoption rate Year 3 | 50% of market (mid scenario) | Conservative estimate based on AU health IT standards adoption (6–7 year full adoption) | ±10% = ±$80k Year 3 revenue |
| Average subscription Year 3 | $3,200/company/year | Based on 8 reports/month average × $33/report | ±$500/year = ±$125k Year 3 revenue |

## Revenue Scenarios

| Metric | Year 1 | Year 2 | Year 3 | Year 5 |
|--------|--------|--------|--------|--------|
| Companies (Low) | 10 | 50 | 120 | 280 |
| Companies (Mid) | 20 | 100 | 250 | 400 |
| Companies (High) | 30 | 150 | 300 | 450 |
| Revenue (Low) | $25k | $150k | $384k | $896k |
| Revenue (Mid) | $50k | $300k | $800k | $1.4M |
| Revenue (High) | $75k | $450k | $960k | $1.8M |
| Breakeven | No | Mid/High | Yes (all) | Strong |

## Industry Savings — Scenario Model

Publish as range, not point estimate. Always disclose derivation:

| Scenario | Per-claim saving | Industry savings (Year 3, 50% adoption) |
|----------|----------------|-------------------------------------------|
| Low | $1,800 | $225M |
| Mid | $3,000 | $375M |
| High | $4,200 | $525M |

*Methodology: AU claims volume (ICA) × per-claim saving (HYPOTHESIS, Phase 2 to validate) × NIR adoption rate*

## How to Update This Model

When Phase 2 pilot data is available:
1. Update `CLAIM-002` and `CLAIM-003` status to `VALIDATED` in `lib/nir-evidence-architecture.ts`
2. Replace hypothesis ranges in this document with pilot-validated ranges
3. Update the Assumption Register with actual measured values
4. Recalculate all scenario projections
5. The model then becomes an investor-grade projection, not a marketing estimate
