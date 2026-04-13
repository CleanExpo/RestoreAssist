---
name: australian-context
description: Auto-loaded Australian compliance context for RestoreAssist — Privacy Act, IICRC AS S500:2025, GST, ABN, state building codes
type: context
auto_load: true
---

# Australian Compliance Context

This skill is auto-loaded on every session. It ensures all work on RestoreAssist meets Australian legal, regulatory, and industry requirements.

## Privacy Act 1988 (Cth)

- **APP 8** — Cross-border disclosure: storing personal information on overseas servers (Canada, USA) triggers APP 8 obligations. The entity remains liable under **s 16C** if the overseas recipient breaches the APPs.
- **NDB Scheme** — Notifiable Data Breaches: eligible data breaches must be reported to OAIC and affected individuals. Cloud provider incidents count.
- **Privacy and Other Legislation Amendment Act 2024** (Royal Assent 10 Dec 2024):
  - Serious/repeated breaches: up to **AUD $50,000,000** or 30% of adjusted turnover in the breach period
  - Director personal liability for repeated failures
- RestoreAssist stores all data in Australia — this satisfies APP 8 by design.

## IICRC Standards — Australian Edition

- Current standard: **AS-IICRC S500:2025** (published February 2025 — Australian national standard)
- Always cite with edition and section: `"IICRC S500:2025 §7.1"` — never omit the version
- The US S500 and AS-IICRC S500:2025 differ — always use the Australian edition for AU claims
- Related standards: AS-IICRC S520 (mould), AS-IICRC S700 (fire)

## APRA CPS 234 (Insurance Industry)

- Applies to APRA-regulated insurers and their supply chains
- Contractors using offshore platforms (DASH, Xactimate) create measurable risk the insurer must manage
- "We use RestoreAssist — Australian-hosted, Privacy Act compliant" is a genuine panel application differentiator

## GST & ABN

- GST is always **10%** — no exceptions
- ABN format: **11 digits** (validate before display or export)
- Tax invoices must show ABN, GST amount, and date

## State Building Codes

Building codes vary by jurisdiction — always use `lib/nir-jurisdictional-matrix.ts`:

- NSW: BCA + NSW Fair Trading requirements
- VIC: Building Act 1993 + VBA
- QLD: Queensland Building and Construction Commission Act
- WA: Building Services (Registration) Act 2011
- SA, TAS, ACT, NT: BCA with local variations

## Australian Date & Currency Format

- Dates: DD/MM/YYYY (not MM/DD/YYYY)
- Currency: AUD with $ symbol
- Phone: +61 format or 0X XXXX XXXX
- Postcodes: 4 digits

## Key Competitors & Data Sovereignty

- **Encircle** — Canadian HQ, but hosts AU data in Australia. Non-compliant with AS S500:2025 (uses US standard).
- **DASH/Cotality** — US/Singapore servers. Full APP 8 exposure for contractors using it.
- **Xactimate** — US servers. APP 8 exposure. Pricing tool only — not a documentation platform.
