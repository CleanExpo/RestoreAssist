# Standards-First Content Gate

> **Critique addressed:** C6 — SEO content strategy runs ahead of standards proof  
> **Owner:** Product Lead + Restoration Technical Lead

## The Principle

E.E.A.T (Experience, Expertise, Authoritativeness, Trust) is the primary ranking signal for professional services SEO. It is destroyed if published content claims IICRC standards alignment but the underlying product documentation cannot demonstrate actual standards competence.

**The gate rule:** No customer-facing content that references NIR capabilities, IICRC standards, or cost savings claims may be published until the relevant gate condition is met.

## Gate Conditions by Domain

| Content Domain             | Gate Requirement                                                                                                            | Gate Owner                 | Content Types Unlocked                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| Water damage               | S500 standards mapping in `lib/nir-standards-mapping.ts` reviewed and signed off by a WRT-certified technician              | Restoration Technical Lead | Blog posts, case studies, landing pages, social — all water damage topics |
| Mould remediation          | S520 mapping reviewed by CMRS or ASD-certified technician                                                                   | Restoration Technical Lead | Blog posts, case studies — mould remediation                              |
| Fire/smoke                 | S700 mapping reviewed by FSRT-certified technician                                                                          | Restoration Technical Lead | Blog posts, case studies — fire and smoke                                 |
| Cost/savings claims        | Phase 2 pilot data available (minimum 50 claims, all CLAIM-00X promoted to VALIDATED in `lib/nir-evidence-architecture.ts`) | Product Lead               | Any content citing NIR cost savings                                       |
| "Industry standard" claims | ICA working group submission lodged                                                                                         | CEO/Founder                | Any content claiming NIR is "the" industry standard                       |

## How to Check Gate Status

```typescript
import {
  getPublishableClaims,
  assertClaimsPublishable,
} from "@/lib/nir-evidence-architecture";

// Before publishing content that uses claims:
assertClaimsPublishable(["CLAIM-001", "CLAIM-003"]); // throws if any not VALIDATED
```

## What This Enables

Once gates are passed, the SEO content strategy (Inspection-to-SEO Authority workflow) becomes extremely powerful because:

1. Content references specific IICRC clauses — competitors cannot replicate without doing the same standards work
2. Claims are backed by pilot data — E.E.A.T signals are genuine, not asserted
3. Jurisdictional specificity (QLD flood codes, VIC BAL ratings) creates content that generic national competitors cannot match
