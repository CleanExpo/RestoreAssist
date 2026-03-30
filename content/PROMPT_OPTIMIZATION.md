# Prompt Optimization Constraints

This document defines the human-authored rules that the prompt optimization agent
must follow. It parallels autoresearch's `program.md` — humans write the constraints,
agents iterate within them.

## Immutable Structure

- The 7-section scope format is fixed and cannot be changed
- Section order: 1) Water Source, 2) Emergency Services, 3) Affected Materials,
  4) Psychrometric Conditions, 5) Equipment Setup, 6) Monitoring Protocol, 7) Validation
- Each section must have a numbered heading (## 1. through ## 7.)

## Citation Requirements

- Every section must reference at least one IICRC standard
- S500:2025 for water damage, S520 for mould, S770 for fire/smoke
- Section references (§) must be specific (e.g. §4.2, not just "IICRC S500")
- AS/NZS 3012:2019 must appear in equipment section for electrical load check

## Language

- Australian English throughout (metre not meter, vapour not vapor, etc.)
- No marketing language, no sales copy
- Technical register: write for insurance assessors and senior technicians
- Equipment quantities must be specific numbers (never "adequate" or "appropriate")

## Equipment Ratios (non-negotiable)

- Air movers: 1 per 15 m² (round up)
- Dehumidifiers: 1 per 40 m² (round up)
- HEPA scrubber: mandatory for Category 2 and 3
- AS/NZS 3012:2019 80% electrical load check required

## Category-Specific Requirements

- Category 1: clean water, no special PPE
- Category 2: antimicrobial application required, HEPA scrubber, grey water reference
- Category 3: full PPE (Level B), remove ALL porous materials, hygienist clearance

## Budget & Rollback

- Max 50 Claude API calls per optimization run
- Threshold: new variant must beat current by ≥2 composite points to be promoted
- If production scope quality drops >5 points after optimization, auto-rollback
- All variants stored in PromptVariant table for audit trail
