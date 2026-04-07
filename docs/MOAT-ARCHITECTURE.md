# Competitive Moat Architecture

> **Critique addressed:** C7 — Competitive advantages are functional benefits, not structural moats  
> **Owner:** CEO/Founder + Product Lead

## The Problem with v1.0 Positioning

The original NIR specification listed functional benefits as competitive advantages (consistency, speed, cost savings). Any competitor with similar development budget can build a competing "national standard" and market it identically. These are not moats.

## The Three Structural Moats

### Moat 1 — Standards Committee Positioning (Institutional Moat)

If RestoreAssist is the organisation that _proposes, develops, and maintains_ the national standard, a competitor cannot copy the format and compete — they would be competing against the standard itself.

**Actions required:**

- Seek IICRC Australia chapter membership — present NIR as a candidate for IICRC's recommended Australian report format
- Submit formal NIR proposal to AIIA Claims Standardisation Working Group (voluntary industry standard path)
- Engage Master Builders Australia and Housing Industry Association as downstream stakeholders

**Timeline:** Phase 4 (Year 2)

**Why it works:** Institutional association is not copyable. A well-resourced competitor can build better software, but they cannot become the organisation that wrote the standard.

---

### Moat 2 — Claims Data Asset (Data Moat)

Every NIR processed adds to an anonymised claims dataset that becomes uniquely valuable at scale. No competitor starting from zero can match this.

**Data asset capabilities at scale:**

- Industry benchmarking: average restoration cost by claim type, state, property age, damage category
- Predictive scope modelling: what items high-accuracy technicians include that others miss
- Insurer data products: anonymised aggregate sold as benchmark service (separate revenue stream)
- Training calibration: identify technicians who systematically underscope or overscope

**Compounding effect:** More NIR users → richer benchmarks → NIR more valuable → more users adopt

**Timeline:** Data asset becomes significant at 10,000+ claims (Year 2–3)

---

### Moat 3 — API Integration Lock-in (Switching Cost Moat)

Once a major insurer's Guidewire or Majesco instance has been integrated to accept NIR JSON, switching costs become significant.

**Lock-in mechanisms:**

- NIR JSON schema becomes the integration standard — replacement format requires re-integrating the insurer's claims system
- API versioning protocol ensures backwards compatibility — integrations built against NIR v1 continue to work
- White-label API option maintains data compatibility while enabling restoration company differentiation

**Timeline:** First insurer integration Phase 4 (Year 2). Lock-in compounds as more insurers integrate.

---

## Moat Development Sequence

```
Phase 2 Pilot → Phase 3 Launch → Phase 4 Growth → Phase 5 Dominance
     |                |                |                |
  Generate         Publish          Submit ICA       IICRC chapter
  pilot data       open API         working group    membership
     |                |             proposal              |
  Data asset       Integration      Institutional     Standards
  begins           spec live        moat begins       moat locked
```
