# RestoreAssist Report Experience Engine (RA-8104)

**Status (27/10/2026):** Ten-mode registry, development-only synthetic theme studio, responsive/print CSS, Playwright smoke and pure permission-specific report snapshot are implemented locally. Actual report/inspection DB adapter, external customer viewer, production PDF integration, true 3D/media modules and release are NOT complete.
**Source:** 27/10/2026 founder-selected ten-design moodboard.
**Base:** CleanExpo/RestoreAssist current origin/main at worktree creation.
**Purpose:** Replace fixed report presentation with composable reader-specific web experiences and print-safe documents, without forking evidence or access control.

## Existing starting points (verified in repository)
- `app/reports/[id]/view/page.tsx` -> server authorised homeowner report view, 30-day token path; session path currently author-only.
- `components/reports/damage-report-view.tsx` -> client-rendered property-owner report; print mode and secondary PDF download; existing icon imports violate newer design no-icon-library convention, so avoid copying that pattern.
- `app/api/reports/[id]/pdf/route.ts` -> role-sensitive PDF authorization and existing report/photo/sketch aggregation; financial reach uses `resolveReportFinancialReach` for authenticated readers, unlike author-only homeowner page.
- `lib/generate-iicrc-report-pdf`, `lib/reports/append-sketch-pages`, `lib/reports/append-photo-pages` -> preserve original print evidence and source links.
- `lib/drying/target-curve.ts`, `lib/portal/drying-timeline.ts`, SketchRoom/ClaimSketch and evidence modules -> reuse rather than duplicate.
- `lib/clients/brand`, `lib/reports/workspace-business.ts` -> signed company branding, not author-only contact fields.
- `framer-motion`, `motion`, `recharts`, `pdf-lib`, `jspdf`, `puppeteer` already present in package dependencies. Add no new dependency without measurements.

## Data architecture (typed projection built; live adapter not implemented)
```
Existing Report / Inspection / Evidence / Scope / Room / Floor / Hazard / Photo
           | Authorised, version-bound server-side aggregation
           v
ReportExperienceSnapshot { reportId, revision, sourceManifest, digest,
   viewerCapabilities, mandatorySafety, verifiedReadings, jobTimeline,
   affectedRooms, scopes, photos, owner/organisationBrand, limitations }
           |               |               |
           v               v               v
    Web renderer      Mobile/portal     Static PDF composer
    ten presets       permitted roles    evidence-first, print-safe
           |               |               |
           +---------------+---------------+
                           |
                     Version/QA receipt
```

The web and PDF must consume the **same revision** or explicitly disclose a superseded document. Never recompute drying percentages, unsupported target dates or severity from theme choices. AI may offer proposed explanations only with approved references and a clearly labelled review state. No invented evidence.

Snapshot adapter gates are server-side: authentication or valid share token; per-report and organisation role; allowed financial and personal fields; safe media access; source hash/version; signed evidence URL expiry; limited data lifetime and resource counts; rejected geo disclosure unless approved. Do not treat hiding a component as authorisation.

## Ten actual presentation modes
| Preset | Layout | Primary focus | PDF |
| --- | --- | --- | --- |
| Executive Modern | Summary | Decisions, milestones, next action | High-trust summary + itemised links |
| Dark Tech | Dashboard | Optional low-light technical operator view | Neutral/light print alternative |
| Minimal Clean | Document | Legible homeowner mobile view | Lean typography and large section labels |
| Visual Storytelling | Story | Assessment -> planned work -> verified evidence | Dated photo/step sequence |
| Technical Dashboard | Dashboard | WME/g/kg, equipment, durations, cost | Charts paired with source tables |
| Interactive 3D & Models | Spatial | Confirmed geometry / room evidence | Grounded 2D plans with annotations |
| Safety & Compliance | Document | Critical hazard, action, owner, time | Safety-first accessible hazard register |
| Before / During / After | Story | Photos and measured change through time | Labelled sequences, provenance |
| Map & Location | Spatial | Site/zone relationship with permissions | Location plan only when authorised |
| Branded Custom Theme | Summary | Customer's verified organisation brand | Accessible client brand + claim identity |

Style selection changes visual grammar, not truth. A mode must never remove mandatory evidence, safety, limitations or signoff. Viewer may combine modules independent of the main preset once actual capability composition is implemented.

## Feature plugin backlog
1. Animated Gantt: authoritative scope/tasks + revisions, real dates, owner and forecast assumptions. Missing dates show unknown; never manufacture project progress.
2. Moisture trends: WME and psychrometric g/kg from actual instruments, room, material, inspection time and calibration evidence; printed exact data rows.
3. Before/during/after: approved photos with capture provenance, camera angles and labels; no generative image pretending to be real evidence.
4. 2D plan -> verified 3D: operator-measured geometry only. Render 2D fallback for generated but unconfirmed floors; no fabricated structural accuracy.
5. Safety hotspots: priority and required action always explicit without movement or colour. No autoplay flashing or deceptive severity.
6. Site map: no default precise private home location exposure; address alone does not grant GPS use.
7. Optional video/timelapse/audio: only consented/licensed verified media, poster frames and transcripts in PDF.
8. Equipment and cost: use shared scope/contract GST/quantity calculation; audience permission controls whether totals appear.

## Delivery method (six Linear children)
- RA-8105: typed theme catalogue now locally implemented/tested; **snapshot adapter and permission guards not built**.
- RA-8106: actual shadcn theme picker, gallery, ten real layout treatments, mobile/desktop/brand and print contrast verification.
- RA-8107: Gantt, trends, hazard and before/after modules; paused/reduced-motion static parity.
- RA-8108: verified floor/room spatial/3D/map/media plugins, fallback and privacy.
- RA-8109: snapshot/parity validation, recipient permissions, revised PDF and versioned evidence chain.
- RA-8110: full 10-theme x role x device x print QA, independent review, rollout canary and closeout.

## Local implementation and observed checks
- `lib/report-experience/snapshot.ts` projects already-authorised evidence by report/organisation grant with content digest, expiry and permitted financial/address fields. It does **not** authenticate the grant itself, and is not yet wired to database access rules.
- `components/report-experience/ReportDesignStudio.tsx` and CSS + `app/dev/report-experience/page.tsx` create the **development-only** ten-theme report gallery. It uses clearly marked synthetic readings, hazards and plan geometry. The route intentionally 404s outside `NODE_ENV=development`.
- `scripts/report-experience-visual-smoke.mjs` exercises ten theme switches at desktop and mobile sizes, reduced motion, safe PDF mode and extracts the generated PDF text, preventing a repeat of the global print-CSS blank-output defect. The existing global stylesheet hides every element except `#visual-report-content` and `#quote-print-content` during print; the gallery correctly uses `#visual-report-content`.
- Verified development server: `next dev --webpack` using the MacBook's existing Chrome. Turbopack fails when `node_modules` is symlinked outside its project filesystem root; this is a development-environment issue, not a bypass of any security control. Playwright `localhost` works; the `127.0.0.1` dev origin failed to hydrate reliably in this setup. A production build still needs its own clean dependency installation.

## Required test suite and acceptance gates
- Synthetic multi-floor loss with valid readings, unconfirmed geometry, Category 3 hazard, equipment, time sequence, consented photos, separate client and insurer disclosure.
- All 10 styles visibly distinct but derive identical numerical, safety and source evidence for the same snapshot.
- Browser/mobile 375px and 1280px, keyboard, screen reader, reduced-motion, high-contrast/monochrome, complete print/PDF static alternatives.
- Video absent, map unavailable, missing room dimensions, unknown dry target/date and lost network render safe understandable alternatives, not silent empty panels.
- Web/PDF/portal same revision and tenant scope; unauthorized client B cannot view A's cost/evidence; rotated/revoked link no longer works.
- Actual Acrobat, Chrome, Safari/Preview and iOS/Android PDF verification; features unsupported by PDF cannot be required to understand warnings.
- PDF diff/render tests compare safety count, reading values, room IDs, report number, signature, revision, dates and org identity; independent screenshot/print acceptance.
- Existing `RA-7665` incorrect S500 compliance labels must be corrected independently via `standardCite()` before content expansion; do not overclaim S500/S520 approval or certification.
- Existing `RA-7746` wrong author-vs-business identity is a blocker for proper white-label report output.
- No unexpected external spend, schema migration, production publication or main merge. Existing founder release rules apply.

## Non-goals in the first PR
- No animation or script embedded into PDF.
- No independent second report database, no recalculation of evidence from visuals, no 3D reconstruction from unverifiable photos.
- No AI-generated safety facts, invented drying progress, hallucinated standard quotations.
- No broad touch of unrelated legacy screens.

## Measurable product goals
Track reader comprehension of the top three risks and next action, time to find the room/damage cause, completion of insurer review steps, claim correction rate, export success across viewers, median/mobile render time, PDF size and source data mismatch incidents. Set the target thresholds using observed baseline; don't invent them in advance.

**Report theme catalogue implemented** under `lib/report-experience/catalog.ts` and `lib/report-experience/__tests__/catalog.test.ts`; nine targeted tests passed before review. This is a code foundation, not evidence that the ten UIs or PDF pipeline are shipped.
