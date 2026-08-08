# Encircle vs RestoreAssist — Competitive Gap Analysis

**Date:** 2026-08-08
**Author:** Competitive analysis pass (Claude)
**Scope of evidence:** Encircle claims are from their **public** marketing/help pages, App Store/Play listings, and third-party reviews (G2/Capterra/TradeTech) only — no authenticated area was accessed. RestoreAssist claims are grounded in the local repo at `/Users/phillmcgurk/RestoreAssist` with file paths cited. Where a claim could not be verified it is marked **unknown**.

> **Headline finding:** RestoreAssist already has near-complete feature parity with Encircle across every headline capability area, and is *ahead* on Australian compliance, its RAG/knowledge substrate, moisture-anomaly detection, and native AU job-management/accounting integrations. Genuine gaps are narrow and mostly at the edges: 360°/Insta360 capture, QR-code contents pack-out box tracking, AI video walkthrough summarisation, and a managed "video-to-measured-floor-plan in 6 hours" service. Xactimate/ESX export is a *deliberate* non-goal, not an accidental gap.

---

## 1. Encircle product summary

Encircle is an all-in-one **claims documentation platform for property restoration**, serving three audiences from one data model: restoration contractors/shops (its core, 3,000+ users), insurance adjusters/TPAs, and — via a self-service link — policyholders/homeowners. Its pitch is "capture in the field once, produce carrier-ready output automatically."

Headline capability areas (each with a public source):

| Area | What Encircle does | Source |
|---|---|---|
| Field documentation | Mobile capture of photos, video, 360° imagery, notes; auto-organises photos by room; AI video summaries | https://www.getencircle.com/learn-more/ |
| AI scoping (**Encircle Scope**) | Turns field photos/notes/sketch into IICRC-aligned mitigation scope (~90% complete) with labour calcs and justifications | https://www.getencircle.com/encircle-platform |
| Sketch / floor plan | Phone video → **Xactimate-ready** measured 2D floor plan, ~6-hour turnaround (managed service); imports to Xactimate | https://www.getencircle.com/encircle-platform |
| Water mitigation (**Hydro**) | Drying logs, psychrometric readings, moisture maps overlaid on floor plan, S500-aligned equipment recommendations, "Instant Reading Capture" (AI reads meter from photo) | https://www.getencircle.com/encircle-platform |
| Contents / pack-out | AI item descriptions from photo (brand/model), QR-label box assignment, geo/time-stamped pre-existing damage, Schedule of Loss report | https://www.getencircle.com/contents-packout-software |
| Reports | One-click room-by-room PDF with embedded media, carrier-ready, upload to XactAnalysis | https://www.getencircle.com/solutions/reports/ |
| Office admin | Job tracking, e-signatures, digital forms, milestone management | https://www.getencircle.com/learn-more/ |
| Remote triage (**Link**) | Secure link to the insured to self-capture photos, remote document signing, pre-arrival evidence gathering | https://getencircle.com/vca-partners-with-encircle |
| ROM (**The Edge**) | On-site rough-order-of-magnitude budget with production-rate defensibility, one-click export | https://www.getencircle.com/encircle-platform |
| Integrations | Insta360 cameras (bundled), Xactimate/XactAnalysis, VCA (adjuster network) | https://www.getencircle.com/encircle-platform · https://getencircle.com/vca-partners-with-encircle |

**Where Encircle leads:** contents/pack-out documentation (AI descriptions + QR box tracking is a mature, oft-praised module), the managed video→measured-sketch service with Xactimate hand-off, 360° camera capture, and the deeply-embedded US insurer ecosystem (Xactimate/XactAnalysis/VCA). Reviews rate it 4.8–5.0 and repeatedly call it intuitive; the recurring complaints are **slow mobile→cloud sync**, **high price**, **photos mis-categorised as room vs contents with no easy fix**, and **sketch import to Xactimate bringing in stairs/cabinets that don't map** (Capterra/G2, see §5).

---

## 2. Feature matrix: Encircle vs RestoreAssist

| Capability area | Encircle (public evidence) | RestoreAssist (repo evidence) | Gap verdict |
|---|---|---|---|
| Mobile field photo/media capture | Photos, video, notes, room auto-org (learn-more) | `app/dashboard/inspections/[id]/capture/`, `app/dashboard/field/`, `InspectionPhoto`/`MediaAsset`/`EvidenceItem` models | **RA has it** |
| Offline capture | "Works offline in poor-reception environments" (contents-packout) | `lib/evidence-upload-queue.ts` (IndexedDB queue + Background Sync + reconnect drain), `lib/nir-sync-queue.ts` | **RA has it** |
| Contents inventory / pack-out | AI item descriptions, QR box labels, Schedule of Loss (contents-packout) | `lib/ai/contents-manifest.ts` (RA-405 vision→item table, CSV/XLSX), `ContentsPackOutItem` model, `app/api/inspections/[id]/contents-pack-out/` | **RA partial** — has AI vision contents + pack-out records; **no QR box labelling** found |
| Sketch / floor plan | Phone video → measured sketch, 6h managed turnaround, Xactimate import (encircle-platform) | `components/sketch/*` (full editor V2), Apple **RoomPlan/LiDAR** ingest `lib/capacitor-roomplan-bridge.ts`, `lib/sketch/ingest-roomplan.ts`, PDF export `lib/generate-sketch-pdf.ts` | **RA has it (different model)** — self-serve LiDAR/manual vs managed service; no 6h drafting service |
| Moisture / psychrometric logging | Hydro: drying logs, moisture maps, psychrometrics, S500 equipment recs (encircle-platform) | `lib/psychrometric-calculations.ts`, `MoistureReading`/`PsychrometricReading`/`DryingGoalRecord` models, `components/inspection/MoistureMappingCanvas.tsx`, `lib/reports/moisture-map.ts` | **RA has it** |
| Moisture anomaly detection | Not advertised | `lib/compliance/moisture-trend-anomaly.ts` (plateau/rising/stuck-high vs S500 §), `lib/compliance/nz-moisture-gate.ts` | **RA ahead** |
| AI scope generation | Encircle Scope ~90% complete, IICRC-aligned (encircle-platform) | `lib/services/ai/generate-scope.ts`, `lib/ai/scope-quality-evaluator.ts`, `app/api/inspections/[id]/generate-scope/`, `lib/agents/definitions/scope-generation.ts` | **RA has it** |
| Report generation | One-click carrier-ready PDF, embedded media (reports) | `lib/reports/*` (`build-structured-report.ts`, `generate-report-ai.ts`, `append-photo-pages.ts`, `append-sketch-pages.ts`, AI-ownership watermarking) | **RA has it** |
| E-signature | Remote signing via Link (vca-partners) | `components/authority-forms/SignatureCanvas.tsx`, `lib/portal/typed-signature.ts`, `app/api/authority-forms/sign/`, `AuthorityFormSignature` model | **RA has it** |
| Remote homeowner self-capture | Link: insured self-captures via secure link (vca-partners) | `app/capture/[token]/page.tsx` (token-gated guided sketch, no auth), `CaptureToken` + `ClientEvidenceSubmission` models, `app/api/capture/[token]/` | **RA has it** |
| Client / insurer portal | Report sharing to carriers, XactAnalysis upload (reports) | `app/portal/[token]/`, `app/portal/insurer/`, `PortalContent`/`ClientPortalAccount` models, `app/api/reports/[id]/insurer-link/` | **RA has it** |
| Insurance / claims export | Upload to XactAnalysis; carrier-specific reports (reports) | `lib/claims-export.ts`, `lib/export/claims-contract.ts`, `lib/insurer-profiles.ts`, `app/dashboard/claims-analysis/` | **RA partial** — has claims export + insurer profiles, but no XactAnalysis/carrier-network hand-off |
| Xactimate / ESX estimate export | Xactimate-ready sketch + estimate hand-off (encircle-platform) | **Deliberate non-goal** — `lib/export/scope-contract.ts:6` explicitly excludes "ESX/Xactimate, no Cotality/Symbility" | **RA missing (by design)** |
| 360° camera capture | Insta360 integration bundled (encircle-platform) | No `insta360`/360-capture code found | **RA missing** |
| AI photo classification | Auto-org photos by room; AI captures missed items | `lib/ai/auto-classify.ts` (claim-type/category vision), `lib/ai/classify-rules.ts` | **RA has it** |
| AI moisture reading from photo | Hydro "Instant Reading Capture" reads meter from photo (encircle-platform) | `MoistureReadingEntryForm`/`QuickMoistureEntry` are manual entry; no photo-OCR of meter found | **RA missing** |
| AI video walkthrough summary | "AI-powered video summaries", video translation (learn-more) | Voice notes/transcripts exist (`lib/voice`, `VoiceTranscript`), but no field-video summarisation found | **RA partial** (voice, not video) |
| ROM / on-site budget | The Edge: ROM with production rates (encircle-platform) | `CostEstimate`/`Estimate`/`ScopePricingDatabase` models, `lib/services/ai/generate-scope.ts` labour calcs, cost libraries `app/dashboard/cost-libraries/` | **RA has it** |
| Job-management / accounting integrations | US-centric (XactAnalysis, VCA) | **Ascora, DR/NRPG, Xero** integrations (`AscoraIntegration`, `DrNrpgIntegration`, `XeroSyncStatus` models, `app/dashboard/integrations/`) | **RA ahead (for AU)** |
| Australian compliance | Not applicable (US/CA product) | GST 10%, ABN validation, `lib/nir-jurisdictional-matrix.ts`, IICRC S500:2021 citations, NZ moisture gate | **RA ahead** |
| IICRC/standards RAG substrate | AI is "S500-aligned" (marketing claim) | `IicrcChunk`/`StandardsChunk`/`RegulatorySection` models + pgvector RAG (`lib/ai/rag-context.ts`, `lib/ai/embeddings.ts`); prod RAG populated ~40,717 chunks (per MEMORY) | **RA ahead** |
| Voice copilot / live teacher | Not advertised | `VoiceCopilotSession`, `LiveTeacherSession`, `components/live-teacher/VoiceAssistant.tsx` | **RA ahead** |

**Honesty note:** "RA has it" means code exists in the repo. It does **not** certify production-readiness, UX quality, or that the feature is wired end-to-end — the MASTER_PLAN records that much of the app is live-but-unverified with real but small production usage (72 users, 5 inspections at last snapshot). Encircle has 3,000+ paying shops and years of field hardening; RA's parity is *architectural*, not yet *market-proven*.

---

## 3. Genuine gaps (ranked by value to an Australian restoration contractor)

1. **QR-code contents pack-out box tracking — RA partial, medium-high value.**
   Encircle lets a tech scan a QR label to assign items to a numbered box, preventing duplicate numbering (contents-packout page). RA has AI vision contents drafting (`lib/ai/contents-manifest.ts`) and pack-out item records (`ContentsPackOutItem`), but no QR box-labelling workflow was found. For contractors doing full pack-outs (a high-margin line item), this is the most tangible missing piece — it directly speeds a laborious, error-prone job. **Gap size: a focused feature, not a platform.**

2. **AI "read the meter from the photo" for moisture — RA missing, medium value.**
   Encircle Hydro's "Instant Reading Capture" extracts a moisture reading from a photo of the meter. RA's moisture entry (`MoistureReadingEntryForm`, `QuickMoistureEntry`) is manual. Given RA already has BYOK vision (`lib/ai/byok-vision-client.ts`) and structured moisture models, closing this is low-effort/high-demo-value on-site. **Gap size: one AI task on existing substrate.**

3. **360° capture / Insta360 integration — RA missing, medium value.**
   Encircle bundles Insta360 for whole-room 360° documentation — a genuine "we captured everything" differentiator for disputes. RA has LiDAR/RoomPlan but no 360° path. Hardware-dependent; more relevant to large-loss/commercial jobs. **Gap size: an integration + capture UI.**

4. **AI video walkthrough summarisation — RA partial, medium value.**
   Encircle produces AI summaries (and translation) from a field video. RA has voice-note transcription but not video summarisation. Australian crews often shoot a walkthrough video; auto-turning it into notes/room list is a real time-saver. **Gap size: extend existing AI pipeline to video.**

5. **Managed video→measured-floor-plan (6-hour turnaround) with estimate hand-off — RA different model, situational value.**
   Encircle's sketch is a *managed service* (submit video, get an Xactimate-ready measured plan back in ~6h). RA is self-serve LiDAR + manual editor — arguably better where a modern iPhone/iPad is on site, but it has no fallback for crews without LiDAR hardware or who want a hands-off draft. **Gap size: an operational/service offering, not just code.**

6. **US insurer-ecosystem hand-off (Xactimate/ESX, XactAnalysis, adjuster networks) — RA missing by design, low value in AU.**
   `lib/export/scope-contract.ts` explicitly excludes ESX/Xactimate/Symbility. This is correct for an AU-first product (Xactimate penetration is lower and RA integrates AU job-management tools instead) but becomes a real gap the moment RA targets insurers who mandate Xactimate, or expands to North America. **Gap size: strategic, revisit on market expansion.**

**Everything else Encircle leads on (contents AI, offline, moisture maps, scope, reports, e-sign, remote capture, portal) RA already matches** — see §2.

---

## 4. AI-feature opportunities (where AI can leapfrog, not just match)

RA's substrate for these is unusually strong: BYOK vision (`lib/ai/byok-vision-client.ts`), a model router (`lib/ai/model-router.ts`), a populated IICRC/standards RAG corpus (`lib/ai/rag-context.ts`, ~40k chunks), and structured domain models. That means several of these are *extensions*, not greenfield.

| Opportunity | User job | Input → Output | RA substrate support |
|---|---|---|---|
| **Auto-classify damage photos to IICRC category/class + affected material** | Tech shoots a room; system tags water Cat 1/2/3, Class 1–4, material, and flags missing evidence | Photos → structured classification + evidence-gap list | **Strong** — `lib/ai/auto-classify.ts` + `MissingElement`/`MissingElement` gap tracking already exist; extend to per-material + evidence completeness |
| **Auto-drafted Scope of Works with S500 citations** | Turn captured evidence into a defensible, cited mitigation scope | Inspection evidence → scope items + IICRC S500 §refs + labour | **Strong** — `lib/services/ai/generate-scope.ts` + RAG already do this; leapfrog = *inline citation of the exact S500 clause* (Encircle only claims "S500-aligned"), which RA's `IicrcChunk` corpus uniquely enables |
| **Psychrometric anomaly / drying-failure prediction** | Warn before a job stalls or a claim reopens | Time-series moisture/psychro readings → plateau/rising/stuck alerts + cause hypotheses | **Already partly built** — `lib/compliance/moisture-trend-anomaly.ts`; leapfrog = predictive ("won't dry by target date, add N air movers") using GBB/equipment models |
| **Contents list from a room video** | Eliminate manual contents entry | Walkthrough video → itemised contents manifest (desc/brand/condition/value) | **Medium** — `lib/ai/contents-manifest.ts` does this from photos; extend to sampled video frames → beats Encircle's per-photo flow |
| **Moisture reading OCR from meter photo** | Kill manual keying on site | Photo of meter display → numeric reading auto-logged to location | **Strong** — vision client + `MoistureReading` model exist; small, high-visibility win that matches Hydro's marquee feature |
| **AU compliance / SWMS/WHS auto-check** | Ensure job docs meet AU standards before submission | Report/scope → pass/fail against S500 edition+section, AS refs, GST/ABN, state building codes | **Strong & unique** — `SwmsDraft`, `WHSIncident`, `lib/nir-jurisdictional-matrix.ts`, standards RAG; **no US competitor can do AU compliance checking** — this is the clearest leapfrog |
| **Adjuster/insurer negotiation assistant** | Pre-empt carrier pushback on a claim | Scope + insurer profile → likely-disputed line items + supporting S500 justification | **Present** — `lib/ai/adjuster-agent.ts`, `lib/insurer-profiles.ts`, `lib/dispute-pack.ts` already exist; productise as a "will this claim get challenged?" pass |

**Net:** the strongest AI leapfrog for the AU market is **compliance-aware drafting + checking** (scope/report/contents all cited to the exact IICRC/AS clause), which Encircle structurally cannot match without an AU standards corpus. The quickest *demo* wins that close visible Encircle gaps are **meter-photo OCR** and **contents-from-video**.

---

## 5. UX "human stickiness" friction points (removable)

Framed as removable friction. Encircle-side items are from public reviews/UX; RA-side items are from repo routes (UX not visually verified — flagged as **unverified**).

**Observed in Encircle's public UX / reviews (opportunities for RA to be better):**
- **Slow mobile→cloud sync.** Repeated Capterra complaint that data takes an extended time to sync device→desktop. RA already has an IndexedDB queue with Background Sync (`lib/evidence-upload-queue.ts`) — *make sync speed/visibility a marketed advantage.* Source: https://www.capterra.com/p/160202/Encircle/reviews/
- **Photos mis-categorised as "room" vs "contents" with no easy re-assign.** A named review pain. RA opportunity: **one-tap re-classify** + bulk move, using `lib/ai/auto-classify.ts` to pre-sort but always allowing cheap correction. Source: https://www.capterra.com/p/160202/Encircle/reviews/
- **Sketch→Xactimate imports junk (stairs/cabinets that don't map).** RA sidesteps this by not targeting Xactimate, but the lesson is **export fidelity** — whatever RA exports (`lib/export/*`) must round-trip cleanly. Source: https://www.capterra.com/p/160202/Encircle/reviews/
- **Price is "on the higher side."** Direct wedge for RA's $79/tech/mo positioning (MASTER_PLAN Fork 7). Source: https://www.capterra.com/p/160202/Encircle/reviews/

**Removable friction inside RA's own flows (from routes — UX unverified, worth a design pass):**
- **Manual moisture keying.** `MoistureReadingEntryForm` / `QuickMoistureEntry` require typed entry per reading — remove via meter-photo OCR and/or Bluetooth meter pairing (a `app/dashboard/field/bluetooth-pair/` route already exists — verify it auto-logs readings, not just pairs).
- **Re-keying across scope → estimate → invoice.** RA has separate `Scope`, `Estimate`, `Invoice` models — confirm data flows through without re-entry; any manual re-typing between them is removable friction. **Unverified.**
- **Contents entry without QR.** Without box-QR (gap §3.1), pack-out numbering is manual and duplication-prone — the exact pain Encircle solved. Removable with a QR box workflow on the existing `ContentsPackOutItem` model.
- **One-hand mobile capture.** Field capture pages exist (`app/dashboard/field/`, `app/dashboard/mobile/`) but thumb-reachability / one-hand ergonomics are **unverified** — worth a mobile UX audit against the "gloves on, phone in one hand, basement, bad signal" reality Encircle optimises for.
- **Homeowner self-capture completeness.** `app/capture/[token]/` gives homeowners a guided sketch — verify it *guides to completeness* (prompts for the rooms/angles a claim needs) rather than leaving gaps a tech must chase. **Unverified.**
- **No confirmed bulk actions** (bulk photo tag, bulk contents move, bulk report regen) surfaced in routes — Encircle reviewers implicitly want them (the re-categorise complaint). Worth confirming/adding. **Unverified.**

---

## Verification notes / limits

- Encircle: **only public pages/reviews inspected**; no login, no app/API probing. Named modules (Scope, Hydro, Link/Triage, The Edge, Contents, Floor Plan) and the 6h sketch turnaround are from their marketing — real-world behaviour not independently tested.
- RestoreAssist: claims are **code-presence** in the repo, not runtime verification. Several "RA has it" rows are architecturally present but production-unverified per `.claude/aggregation/MASTER_PLAN.md`. UX-friction RA-side items are **inferred from route structure, not from running the app** — each is flagged unverified and should be confirmed by a hands-on mobile pass before acting.
- "RA ahead" on RAG chunk count (~40,717) is from machine memory (`MEMORY.md` RA-6934 note), not re-counted this session.
