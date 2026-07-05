# RestoreAssist — Positioning

**Date:** 2026-05-13
**Owner:** Phill McGurk
**Brand voice:** direct · grounded · informed · human (BrandConfig `ra.voice.tone`)
**Reading level target:** 4 (hard fail at 8)

---

## Single-sentence positioning statement

RestoreAssist is the Australian water-damage CRM that is AI-driven from the moment you type your ABN — not after the seventh setup screen.

## The gap we close

Every CRM in this category claims to be "AI-powered". In practice the AI shows up in a single button on a report screen, six weeks after a tradesperson has typed their ABN, ACN, address, GST status, and logo URL into static forms.

RestoreAssist treats the **first 90 seconds** as the AI proof point. One field — your ABN — drives three parallel hydration jobs:

1. ABR pulls your legal name, trading names, ACN, state, address, and GST registration.
2. Website scrape pulls your logo, primary colour, accent colour, and an "about us" paragraph.
3. Pricing engine seeds state-specific labour and equipment rates from a 2026 Australian dataset, adjusted by business size.

The setup wizard ends with a live Feature Health card that proves — for this tenant, on this device, right now — that AI report generation and connected integrations actually work. Chain-of-custody, sample-report rendering, and welcome-email checks ship as live gates in Phase 5+. The dashboard then opens with the user's own branding already in place and a draft sample report already written.

That is the difference between "AI-powered" as a marketing claim and AI-driven as a workflow.

## Jobs to be done

A restoration owner-operator hires RestoreAssist to:

- **Get billable on day one** — turn an ABN into a configured, branded, ready-to-quote workspace without a 14-step checklist.
- **Walk into a claim dispute with the report already written** — IICRC S500:2021 §7.1 references in the footer, GPS-stamped photos with a verifiable chain of custody, GST at 10% calculated correctly, state-specific clauses applied.
- **Stop the bookkeeping bleed** — push completed jobs into Xero, MYOB, or QuickBooks without re-keying line items.
- **Know the platform is healthy before a 2am callout** — a single page that shows green or red on every advertised capability, including the AI itself.

## What we are NOT

- Not a generic field service CRM with a restoration "vertical pack" bolted on. The data model, the report templates, and the IICRC references are first-class, not afterthoughts.
- Not a marketing-AI wrapper. Reports cite IICRC S500:2021 §7.1, S520:2024 §12, and state building codes by their actual authority names — not "industry standards".
- Not a US product retranslated for Australia. GST is 10%. ABN is 11 digits. State codes route through correct jurisdictional matrices, not zip-code regex.
- Not pay-per-AI-call. Platform Gemma drives setup hydration for free; BYOK is optional and lives behind a collapsible section in the wizard.
- Not a quote-generator. RestoreAssist runs the job from first-call to insurer-accepted report, with photos and pricing intact.

## Category claim

**AI-driven restoration CRM, configured by your ABN.**

We sit in the same shelf as ServiceM8 and Ascora, but we earn that position by being the only one that proves the AI works *before* the customer pays for it.

## Voice anchors (from BrandConfig)

- Tone: direct, grounded, informed, human.
- Cadence: short. Active voice. Plain English alongside every technical term in the same sentence.
- Never imply the National Inspection Standard is optional or vendor-specific.
- Never write copy that manufactures urgency — the reader is already mid-flood.
- Never end a post with a CTA that pushes the reader to a brand destination — direct them to act in their own interest.
- Forbidden vocabulary: leverage, utilise, best-in-class, world-class, game-changer, revolutionary, seamless, powerful, unlock, journey, excited, thrilled, delighted.

## Proof points (verifiable today on `/setup`, `/dashboard/learn`, `/dashboard/settings/health`)

- ABN-anchored setup at `/setup` — single input, three parallel hydration jobs, no static form-filling.
- Workspace Health page at `/dashboard/settings/health` — live status of AI generation, cloud storage, and accounting integration. Sample-report render, photo chain-of-custody, and welcome-email gates roll out in Phase 5+.
- Tutorials hub at `/dashboard/learn` — six short walk-throughs covering signup, sign-in, setup wizard, dashboard, integrations, and Workspace Health.
- IICRC citations carry edition and section in every report footer.
- Photos are stamped with SHA-256 + UTC at capture today. The full C2PA-style manifest with GPS + device + user hash and read-time verification is on the Phase 5+ roadmap.
