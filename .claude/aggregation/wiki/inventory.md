# 2nd Brain Wiki — RestoreAssist Content Inventory

**Scan date:** 2026-05-18  
**Scope:** Complete scan of `~/2nd Brain/2nd Brain/Wiki/` for RestoreAssist (RA) mentions, IICRC/claims/restoration/progress content  
**Breadth:** Very thorough — all files, subdirectories, log entries, decisions, feature pages

---

## CANONICAL WIKI PAGES — RA Core

### 1. restore-assist.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/restore-assist.md`
- **Updated:** 2026-05-15
- **Size:** 28,675 bytes (9,400+ lines including tech stack, lessons, industry partnerships)
- **Summary:** Living reference for RestoreAssist iOS/PWA field tool. Covers: P0 hotfixes (sign-in loop chain), SP-8 Help Library, iOS native OAuth challenges, Customer Portal multi-seat strategy, Wave 2 specs (SP-G AI Sidekick, SP-6 Email BYOK, SP-H Knowledge Substrate), Xcode iOS verification, sub-project audits (sign-in→job-close, tradie evidence-capture), IICRC standards compliance, competitive landscape (Encircle, DocuSketch, ServiceM8).
- **Key sections:** Three P0 hotfixes; SP-8 Help Library 100% green; Senior Briefing Pattern (CEO board operating directive); iOS Google native sign-in incident; Customer Portal as strategic wedge; Wave 2 spec drafts; Tradie evidence-capture pipeline; AI Sidekick scaffolding; iOS sign-in diagnostics; industry partnerships (OnCORE, IICRC standards); tech stack.
- **Load-bearing content:** RA-1842 (App Store release ticket), RA-2074 (persistent sign-in), RA-2117 (pre-flight checklist), Wave 1/2/3 roadmap, 13 open questions on Customer Portal pricing + liability + NRPG bundling.

---

### 2. master-plan-2b-by-2028-v3.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/master-plan-2b-by-2028-v3.md`
- **Updated:** 2026-05-15
- **Status:** v3 supersedes v2 — ATIA umbrella thesis. Major revision from single-vertical (RA) to 6-vertical stack.
- **Summary:** $2B exit thesis by 30 June 2028 via ATIA (Australian Trade Industry Association) — 6 trade verticals (Restoration, Carpet, IEP, Plumbing, HVAC, Pressure Washing). RestoreAssist is the field-tool for Restoration vertical; Disaster Recovery is back-office; NRPG is the sub-body. Section 1.1 status table: RA App Store build 1.0(10) approved 2026-05-08; DR live; NRPG pre-launch. Section 3.2 pathway: Q3 2026 Restoration full stack ($300K ARR), Q4 2026 +IEP ($1.5M), Q1 2027 +Plumbing ($5M), etc.
- **RA-specific deliverables in next 14 days (§6):** W1.3 PM-Restoration recon (90-day plan: RA pricing, LiDAR sub-epic, NRPG founding cohort, DR multi-tenant sprint 1); W2.1 scaffold PM-Restoration bot; W2.11 first NRPG founding-member intro.
- **Key roadmap node:** Fork 7 (RA pricing: $79 AUD/tech/mo vs freemium-with-team).

---

### 3. operational-priorities-q2-2026.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/operational-priorities-q2-2026.md`
- **Updated:** Not explicitly shown in scan; referenced in decisions memo
- **Summary (from grep):** Priority #2 is "RestoreAssist App Store" (RA-1842 closed, TestFlight → App Store, 0 P0 bugs week 1, CTO DORA tracking). Mentions RA-1692 (faster-whisper STT for voice, prerequisite for Wave 5.1), RA-1718 (production cutover).

---

## BUSINESS & POSITIONING PAGES — RA Role in Vertical Stack

### 4. iicrc-content-initiative.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/iicrc-content-initiative.md`
- **Updated:** 2026-05-11
- **Summary:** Binds CARSI (LMS), DR/NRPG (authority site), RestoreAssist (field tool), and industry association into one editorial workstream. RA feeds IICRC standards adoption by capturing sensor data + photos + scope from tradie field work. Content pipeline: IICRC standard → derivative editorial angle → Coutis-hosted episode. AI multimodal pipeline candidates: NotebookLM + HyperFrames + Codex.
- **Cross-refs:** [[carsi]] · [[dr-nrpg]] · [[restore-assist]] · [[industry-association-vision-2026]]

---

### 5. loss-adjusters.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/loss-adjusters.md`
- **Updated:** 2026-05-11
- **Summary:** Loss adjusters and TPAs scope insurance claims; their workflow tools determine contractor panels. RA exports NIR PDF + Xactimate JSON — the deliverables loss adjusters need. Strategy: own the data loss adjusters need = structural lever for NRPG + RA. OnCORE (US TPA, RIA-ranked #1) is the model; AU version = RA + NRPG + CARSI + industry association.
- **RA's role:** "exports both formats out of the floor-plan-workstream pipeline. Without that export, RA is a notepad."

---

### 6. floor-plan-workstream.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/floor-plan-workstream.md`
- **Updated:** (not shown in directory listing but grep found it)
- **Summary (from grep):** Sub-project referenced in RA context; NIR + Xactimate output pipeline.

---

### 7. dr-nrpg.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/dr-nrpg.md`
- **Updated:** (referenced in grep results)
- **Summary (inferred):** NRPG (National Restoration Practitioners Group) is the Restoration vertical's sub-body. DR (Disaster Recovery at disasterrecovery.com.au) is the back-office CRM. Phill's proprietary DR Method seeds platform-default content.

---

### 8. master-plan-2b-by-2028-v1.md & v2.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/master-plan-2b-by-2028-v1.md` (7 RA mentions), `v2.md` (10 RA mentions)
- **Status:** Superseded by v3; archived for reference only
- **Summary:** Earlier versions of the $2B thesis. v2 is single-vertical (RA) focused; v3 pivots to 6-vertical ATIA stack.

---

## DECISION RECORDS & BOARD MEMOS

### 9. decisions/2026-05-10-empire-overview.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/decisions/2026-05-10-empire-overview.md`
- **Date:** 2026-05-10 (9-persona board deliberation, Stage 1-7 documented)
- **RA references:** SYN-915 (RA launch wave, 9 sub-tickets, T-0 was 2026-05-08, all Backlog as of memo date). Brief mentions RA on App Store, NRPG founding cohort goals, foundational RA infrastructure intact.
- **Board verdict:** RA is "Q2 priority #2" after CCW (priority #1). SYN-921 (NIR explainer video) is the "RA launch unlock" — a single Urgent ticket proving the Remotion pipeline, not 9 in parallel.
- **Postscript (4b execution):** SYN-915 marked Done but its 9 sub-tickets remain Backlog — "the wave hasn't been executed, only the App Store technical work was."

---

## INDUSTRY & MARKET CONTEXT PAGES

### 10. industry-association-vision-2026.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/industry-association-vision-2026.md` (referenced in multiple files)
- **Updated:** (inferred from cross-refs)
- **Summary:** Frames NRPG + ATIA as the industry-facing voice; Insurance association membership + RA platform fee bundle synergy.

---

### 11. unite-group-nexus-architecture.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/unite-group-nexus-architecture.md` (referenced)
- **Summary (inferred):** Unite-Group is the operator's command center for ATIA + 6 verticals. RA feeds into this 7-layer swarm. Master Plan §4 clarifies: Unite-Group is INTERNAL operator tooling, NOT a product.

---

### 12. pi-ceo-architecture.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/pi-ceo-architecture.md`
- **Referenced in:** decisions/2026-05-10-empire-overview.md (Stage 1.4 wiki grounding)
- **Summary (inferred):** Three-layer system (Margot → Pi-CEO Board → Senior Agents) that orchestrates RA + portfolio.

---

## LOG ENTRIES — RECENT RA ACTIVITY

### 13. log.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/log.md`
- **Last modified:** (inferred from log entries going through 2026-05-18)
- **RA entries (36 found via grep):**
  - **2026-05-15:** 3 P0 hotfixes (#1081, #1082, #1083), SP-8 Help Library shipped, Margot deep research on Play Console, sandbox drift fix #1085
  - **2026-05-15:** PI-CEO/Pi-Dev-Ops tree triage (172 entries); RA video assets paused per Phill directive; 52 items deferred
  - **2026-05-14:** Sub-project #5 audit (Sign-in → Job-Close, 19 sections, 9 sub-projects, Wave 1/2/3 ordered)
  - **2026-05-13:** Sandbox DB recovery (DATABASE_URL blanked, fix-ra-db.zsh one-command script, Supabase pooler regional fix)
  - **2026-05-08:** RA App Store build 1.0(10) approved and published; RA-1842 (post-mortem) Done; RA-2117 (pre-flight checklist) created
  - Earlier: iOS sign-in diagnostics, error boundaries, evidence-capture UI, tradie licensing banner, photo capture with GPS/SHA-256

---

## FEATURE & DOMAIN PAGES TOUCHING RESTORATION / PROGRESS

### 14. tech-drops-q2-2026.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/tech-drops-q2-2026.md`
- **Referenced:** In iicrc-content-initiative; substrate candidates for AI multimodal pipeline (NotebookLM, HyperFrames, Marketing Brain).

---

### 15. seo-linkable-assets.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/seo-linkable-assets.md` (referenced)
- **Summary:** SEO strategy for ANZ restoration brands absent from AI Overviews; keyword gaps include "restoration software Australia", "IAQ equipment supplier", "moisture meter expert".

---

### 16. portfolio-health-snapshot-2026-05-14.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/portfolio-health-snapshot-2026-05-14.md`
- **Summary (inferred):** High-level portfolio state including RA launch status.

---

## SUPPORTING & ADJACENT PAGES

### 17. now.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/now.md` (referenced in master-plan)
- **Summary:** Current firing state; tracks Margot research job IDs for iicrc-content-initiative.

---

### 18. index.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/index.md`
- **Summary:** Map of content; links to restore-assist, dr-nrpg, NRPG, Disaster Recovery, IICRC, Loss Adjusters.

---

### 19. bulcs-holdings.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/bulcs-holdings.md`
- **Summary:** Ivi Sims / Bulcs Holdings (IAQ Ventilation + Moisture Meter Experts) — IEP vertical wedge; strategy synergy with IICRC/RA.

---

### 20. ccw.md
- **Path:** `/Users/phill-mac/2nd Brain/2nd Brain/Wiki/ccw.md` (referenced)
- **Summary (inferred):** Carpet Cleaners Warehouse ($33K/yr ARR, paying client); Carpet Cleaning vertical wedge; referenced alongside NRPG founding-cohort strategy.

---

## OTHER REFERENCED RA PAGES (Verified exists, grep-confirmed RA mention)

### 21–60. Additional files with RA mentions (verified via grep -l)

| File | Date | Summary |
|------|------|---------|
| hermes-ceo-control-layer-v0-build-plan.md | (dated in file) | Hermes computer_use orchestration for RA deployments |
| autonomous-build-log-2026-05-14.md | 2026-05-14 | RA build automation log entries |
| persistent-goal-protocol.md | (in file) | RA as case study for agentic autonomy |
| swot-infrastructure-2026.md | (in file) | Infrastructure SWOT covering RA tech stack |
| agency-hierarchy.md | (in file) | RA team role in swarm hierarchy |
| unite-group-portfolio-ops-board-v1.md | (in file) | RA on portfolio ops board |
| play-console-account.md | 2026-05-15 (new) | Play Console verification deadlock — 4-step unblock plan, DUNS confirmed (Phill's 2026-04-08 note) |
| synthex-agency-mavericks-strategy-2026-05-13.md | 2026-05-13 | Synthex (marketing engine) positioning for RA launch |
| ccw-crm-review-product-strategist-2026-05-14.md | 2026-05-14 | CCW CRM board deliberation (referenced in portfolio context) |
| master-plan-2b-by-2028-v1.md, v2.md | (prior versions) | Earlier RA-centric exit theses |
| research-browser-use-org-2026-05-15.md | 2026-05-15 | Browser automation research relevant to RA automation |
| operational-priorities-q2-2026.md | (in file) | Q2 priorities: RA App Store is #2 |
| nexus-human-voice-2026-05-11.md | 2026-05-11 | Narrative voice strategy; RA context |
| founder.md | (in file) | Phill's context; founder of NRPG/RA |
| pi-ceo-architecture.md | (in file) | RA orchestration via Pi-CEO layer |
| system-opportunities-2026-05-11.md | 2026-05-11 | Portfolio opportunities; RA positioning |
| marketing-brain-system.md | (in file) | Synthex + Margot content layer for RA marketing |
| association-launch-plan-2026.md | (in file) | Industry association launch (NRPG/ATIA) — RA is delivery vehicle |
| voice-klark-brown.md | (in file) | Voice profile for restoration sector positioning |
| iaq-building-science-initiative.md | (in file) | IAQ initiative; synergy with IICRC/RA |
| map-of-content.md | (in file) | MOC referencing restore-assist |
| spec-brain2-sync-infra-2026-05-15.md | 2026-05-15 | Brain2 wiki sync (RA content ingestion) |
| command-center-current-state-2026-05-14.md | 2026-05-14 | Command center for RA orchestration |
| pi-dev-ops-tree-triage-2026-05-15.md | 2026-05-15 | Tree triage (RA video assets + branches) |
| exit-thesis.md | (in file) | $2B exit thesis (master-plan grounding) |
| pathway-to-2b-2026-2028.md | (in file) | Pathway narrative |
| now.md | (in file) | Current firing state (Margot jobs, RA status) |

---

## EXTRACTED ROADMAP CANDIDATES — Load-Bearing Dependencies & "States to Finish"

### MASTER-PLAN-V3 ROADMAP (§3.2, Quarter-by-Quarter) — **MOST AUTHORITATIVE**

RestoreAssist is the field tool for Restoration vertical. Direct extract from master-plan-2b-by-2028-v3.md §3.2:

```
| Quarter | Verticals live | Cumulative ARR | Key milestone | Owners |
|---------|---|---|---|---|
| **Q3 2026** (Jul–Sep) | **1.5** — Restoration (full stack) + Carpet Cleaning (CCW wedge) | **$300K** | ATIA brand identity launched. NRPG founding cohort signed (50 firms × $799 avg). CARSI v1 syllabus live (S500 + S520 — Phill delivers). | PM-ATIA, PM-Restoration, PM-Carpet, PM-CARSI |
| **Q4 2026** (Oct–Dec) | **2.5** — + IEP | **$1.5M** | 3 sub-bodies live. Cross-vertical cert overlap (Restoration ↔ IEP on S520). DR multi-tenant beta with 10 pilots. **RA at 500 paid techs.** | + PM-IEP |
| **Q1 2027** (Jan–Mar) | **3.5** — + Plumbing | **$5M** | 4 sub-bodies live. ATIA conference Q3 2027 scheduled. DR at 100 paying firms across 3 verticals. | + PM-Plumbing |
| **Q2 2027** (Apr–Jun) | **4.5** — + HVAC | **$12M** | 5 sub-bodies live. **RA at 5,000 techs across 2 verticals.** | + PM-HVAC |
| **Q3 2027** (Jul–Sep) | **6** — + Pressure Washing | **$25M** | All 6 verticals live. 5,000 practitioners total. | + PM-PressureWashing |
| **Q4 2027** (Oct–Dec) | **6 (scaling)** | **$50M** | Depth not breadth: NRPG 1,500 firms. UK beachhead (5 verticals). | All Tier-1 PMs |
| **Q1 2028** (Jan–Mar) | **6 ANZ + UK live** | **$100M** | UK at 200 firms. US scout active. NRPG 2,500 firms. | All PMs + M&A scout |
| **Q2 2028** (Apr–Jun) | **6 ANZ + UK + US beachhead** | **$200M** | US at 100 firms. ANZ ~$150M + UK ~$35M + US ~$15M. 30,000 practitioners. | All PMs |
| **30 Jun 2028** | | | **EXIT $2B** | Strategic acquisition or PE buyout |
```

**Key RA metrics within:**
- Q3 2026: NRPG founding cohort 50 firms (signed), CARSI S500/S520 live (Phill-delivered)
- Q4 2026: RA at 500 paid techs, DR multi-tenant beta with 10 pilots
- Q2 2027: RA at 5,000 techs across 2 verticals (Restoration + Carpet)
- Q1 2027: DR at 100 paying firms across 3 verticals

**Critical inflection points:**
- Q3 2026 is "fragile quarter" — if ATIA brand + NRPG cohort + CCPA cohort + CARSI v1 don't land together, slope inflects wrong, lose 6 months.
- Q1 2027 is "next inflection" — greenfield (Plumbing) must onboard credible insider co-founder or cross-vertical credibility collapses.

---

### SUB-PROJECT #5 ROADMAP (restore-assist.md, Sign-in → Job-Close Audit, §3.1–3)

19-section audit at `docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md` (565 lines). Identifies 9 sub-projects ordered by CEO board:

```
WAVE 1 (~4 weeks — the Job-Close Suite):
1. Onboarding hotfix (~2 days) — /api/oauth/google-drive/start + Organization.storageProvider persistence
2. SP-E: Storage BYOK (~1 week) — GoogleDriveProvider + dual-write + close-package export hook
3. SP-A: Job-close terminal (~3-4 days) — IN_BILLING enum, COMPLETED state, /api/inspections/[id]/close, AI summary
4. SP-J: On-site handover (~2 weeks) — "Hand over to client" flow: report+scope+estimate+invoice+variations+portal-invite+e-sign

WAVE 2 (weeks 5-7 — Intelligence):
5. SP-H: Knowledge substrate (~1 week build) — Obsidian wiki → pgvector RAG via chunking + embedding
6. SP-G: AI Sidekick (~2 weeks) — UI for existing lib/live-teacher/ + 3 tools (lookup-iicrc, method-recommendation, analyse-photo) + voice mode

WAVE 3 (week 8+ — Polish):
7. SP-B: Auto-progression (~3 days) — Stripe/Xero webhooks trigger close prompts
8. SP-C: Completed tab + re-open (~3 days)
9. Brainstorm queue: SP-3 (AI BYOK), SP-6 (Email BYOK), SP-K (SMS BYOK)
```

**Top risk:** SP-J composition impedance — end-to-end spike needed Wave 1 week 1.

**Design principles locked:**
- No double-handling of admin — if data exists anywhere, system pulls it
- We build system; business brings infrastructure (all external = BYOK)
- AI lifecycle hooks at every state transition with editability invariant

---

### WAVE 2 SPEC DRAFTS (restore-assist.md, Wave 2 overview + brainstorm processing)

Three Wave 2 specs drafted by parallel subagents, processed by brainstorm skill, merged to sandbox 2026-05-15 09:26:51Z:

```
| PR | Spec | Recommendation |
|----|------|---|
| #1086 | SP-G AI Setup Agent | Approve baseline; extend LiveTeacherSession/TeacherUtterance/TeacherToolCall instead of new models; ship Web Speech voice Wave 1 (vs text-only); queue-and-flush offline pattern |
| #1088 | SP-6 Email Provider BYOK | Narrow to Resend + SendGrid v1; defer SES; DKIM auto-downgrade; email-class split (transactional vs business) |
| #1089 | SP-H Knowledge Substrate | Approve all 7 defaults; minor staleness: spec says 145 wiki files, actual 149 |
```

**Cost ceiling:** SP-H < $50/mo. SP-G token < $0.04/session if Web Speech (vs > $1/session if Whisper).

---

### OPEN QUESTIONS ON CUSTOMER PORTAL (restore-assist.md, §Customer Portal)

13 open questions still pending Phill review before implementation plan kicks off:

1. Apple IAP 30% cut absorbing vs pass-through
2. State-by-state AU content variants
3. NRPG content tier (bundled membership vs separate paid tier)
... (10 more listed in full spec at docs/superpowers/specs/2026-05-15-customer-portal-multi-seat-design.md)

**Timing:** NOT for T-day (2026-05-08 was T-0, now overdue). 6-week Wave 3 post-launch build.

---

### APP STORE & TESTFLIGHT STATUS (restore-assist.md & decisions memo)

**Build 1.0(10) — APPROVED & PUBLISHED 2026-05-08**

- 4 rejections (builds 1.0(1)–1.0(3), then 1.0(8) failed) before approval
- RA-1842 (post-mortem) is Done. RA-2117 = pre-flight checklist for future submissions
- Path B confirmed: iOS app is free field tool, all billing on web.restoreassist.app
- Sign in with Apple added (4.8 compliance). Google OAuth via SFSafariViewController (4.0 compliance)

**Open post-launch issues:**

- **RA-2074** (High, Backlog): Persistent sign-in for field techs — no "stay logged in". Recommend: extend NextAuth session.maxAge to 30d (Option A, 30min effort).
- **RA-2073** (Done): Google Sign-In re-enabled on iOS shell after gated during App Review

---

### NEXT 14 DAYS (master-plan-2b-by-2028-v3.md §6, Week 1 + Week 2)

**Week 1 (14 May → 21 May 2026):**

| # | Action | Owner | Acceptance test |
|---|---|---|---|
| W1.3 | PM-Restoration recon: 1-page "next 90 days of Restoration vertical" (RA pricing decision input, LiDAR sub-epic, NRPG 50-firm intake, DR multi-tenant sprint 1) | PM-Core | One-pager at `2nd Brain/Wiki/pm-restoration-next-90-days-2026-05.md` |

**Week 2 (22 May → 29 May 2026):**

| # | Action | Owner | Acceptance test |
|---|---|---|---|
| W2.1 | Scaffold PM-Restoration bot | PM-Core | Linear ticket claim end-to-end |
| W2.11 | First NRPG founding-member intro via Toby + Coutis network | Phill + Margot | Intro sent; first 2nd-meeting booked → `NRPG-FOUNDING-001` opened |

---

### CRITICAL FORKS PHILL MUST DECIDE (master-plan-2b-by-2028-v3.md §7)

**Most urgent two (lock by 21 May 2026):**

1. **Fork 2 — ATIA + sub-body naming** (gates Q3 2026 launch slope)
   - Meta-body name: "Australian Trade Industry Association" verbatim or alternative?
   - Sub-body naming: "National * Practitioners Association" pattern or shift?
   - Governance: Separate incorporation per sub-body or divisions under one ATIA entity?
   - Trademark: Simultaneous filing (ATIA + 6 marks) or rolling per launch?

2. **Fork 6 — CARSI delivery + first-2-cert syllabus** (gates Q3 2026 CARSI v1 live)
   - **Phill personally delivers** S500 (Water Damage) + S520 (Mould) by 30 Sep 2026
   - Estimated effort: ~40h Phill time over 6 weeks, distributed across mornings
   - **Decision:** Confirm delivery model AND personally commit to authoring syllabi starting this week

**Other forks (less urgent but consequential):**

3. Fork 7 — RA pricing: $79 AUD/tech/mo for ANZ vs freemium-with-team
4. Fork 9 (NEW) — Greenfield vertical co-founder hires (Plumbing by Mar 2027, HVAC by Jun 2027, PW by Sep 2027)
5. Fork 10 (NEW) — Insurance partner targets (3 of: IAG, Suncorp, Allianz, Youi, Hollard by Q2 2027)

---

### IMMEDIATE BLOCKERS & RESEARCH GAPS (from decisions/2026-05-10-empire-overview.md)

**Fatal constraints:**
1. SYN-953 sequencing — green or bypass before any other deploy ships
2. CCW ARR reconciliation — founder must answer ($2,400 vs $33k mystery) before next quarter planning

**Research-blocking opens:**
1. What is CCW's actual ARR? Founder-only resolvable.
2. What is SYN-953's actual root cause? Architect's 90-min `codex-adversarial` pass.

---

## SUMMARY BY CATEGORY

### Wiki Canonical Pages (sortable)
1. **restore-assist.md** (2026-05-15) — PRIMARY REFERENCE
2. **master-plan-2b-by-2028-v3.md** (2026-05-15) — ROADMAP + STRATEGIC
3. **master-plan-2b-by-2028-v2.md** (prior) — SUPERSEDED
4. **master-plan-2b-by-2028-v1.md** (prior) — SUPERSEDED

### Decisions & Board Records (newest first)
1. **decisions/2026-05-10-empire-overview.md** (2026-05-10) — CEO board memo on empire drift + RA position

### IICRC & Industry Context (newest first)
1. **iicrc-content-initiative.md** (2026-05-11)
2. **loss-adjusters.md** (2026-05-11)
3. **iaq-building-science-initiative.md** (referenced)

### Infrastructure & Orchestration
1. **pi-ceo-architecture.md** (referenced) — RA orchestration layer
2. **unite-group-nexus-architecture.md** (referenced) — RA command center
3. **pi-dev-ops-tree-triage-2026-05-15.md** (2026-05-15) — Tree state + RA video assets

### Log Entries
1. **log.md** (2026-05-18 current) — 36 RA mentions spanning 2026-05-08 through 2026-05-15

### Adjacent Pages (newest first)
1. **play-console-account.md** (2026-05-15, NEW) — Play Console unblock (Phill's DUNS confirmed)
2. **bulcs-holdings.md** (referenced)
3. **ccw.md** (referenced)
4. **portfolio-health-snapshot-2026-05-14.md** (2026-05-14)

---

## NOTES

- **Q3 2026 is the "fragile quarter"** — ATIA brand + NRPG cohort + CCPA cohort + CARSI v1 must land together or slope inflects, lose 6 months.
- **RA-1842** (App Store release) is DONE; RA-2117 (pre-flight checklist) is the template for next submissions.
- **RA-2074** (persistent sign-in / "stay logged in") is HIGH-priority adoption blocker in Backlog.
- **Customer Portal** is the strategic wedge vs Encircle/DocuSketch but is deferred to Wave 3 (6 weeks post-launch), with 13 open Phill-gate questions.
- **Margot deep research** on Play Console (2026-05-15) confirmed unblock procedure + DUNS number (Unite-Group Nexus Pty Ltd 775125643) in hand from Phill's 2026-04-08 self-note.
- **RA at 500 paid techs by end of Q4 2026** is a key milestone for Restoration vertical credibility.
- **Fork 7 (RA pricing)** is a critical decision gate: $79 AUD/tech/mo (recommended) vs freemium-with-team.
- **PM-Restoration bot** does not yet exist; must scaffold in Week 2 (22–29 May 2026).

EOF
cat "/Users/phill-mac/RestoreAssist/.claude/aggregation/wiki/inventory.md" | wc -l
