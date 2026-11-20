# RA-8106 / RA-8110: Visual Acceptance Against Founder-Selected Ten Concepts

**Status:** NOT ACCEPTED. Real Chrome/Playwright screenshots of all 10 current synthetic report layouts have been reviewed, and the actual implemented experience is materially simpler than the founder's reference concepts. Passing registry, unit, PDF and responsive tests **does not** establish visual acceptance.

## Canonical comparison and evidence
- **Target:** Founder-selected ten-mode generated concept board and RestoreAssist reporting-experience blueprint in the original ChatGPT conversation, dated 27 October 2026. Asset must be intentionally copied into the approved design reference library and verified before any automated pixel/image-score comparison. Do not replace it with generic stock images or arbitrary screenshots.
- **Actual:** `scripts/report-experience-visual-smoke.mjs` records ten real desktop Chrome screenshots, mobile capture, and PDF with extracted safety/identity/limitations text under a local temporary `restoreassist-report-studio-smoke` directory. The screenshots are prototypes with synthetic data, not evidence of field-product deployment.
- **Render environment:** Next.js 16 dev webpack on MacBook `localhost:3119` works with local Chrome. The LAN HTTP Next.js link returned HTML 200 but failed to load its JS/CSS because the repository's global CSP `upgrade-insecure-requests` turns HTTP subresources into unavailable HTTPS URLs. A 200 result is not acceptance. Do not loosen production CSP merely for a preview.
- **Review sharing:** a temporary **read-only static screenshot gallery** may be served separately on a trusted LAN; gallery interaction is choosing screenshots, not an interactive report. Never equate its success with production app behaviour.

## Visual gap inventory: design intent vs actual

| Mode | Founder-selected reference target | Chrome-observed present implementation | Missing for acceptance |
|---|---|---|---|
| 01 Executive Modern | Premium property photograph, bold hierarchy, live programme and high-trust numeric summary | Clear typographic summary, basic abstract ring and Gantt | Evidence-backed building/room visuals, more developed responsive visual identity and real data |
| 02 Dark Tech | Cinematic model, spatial depth, advanced moving timelines, rich telemetry | Dark colour scheme, basic 2D plan, line/Gantt | Real opt-in technical 3D, purposeful rich layers, contrast/accessibility and authentic evidence |
| 03 Minimal Clean | Premium photography, whitespace, simple trend, clean owner decisions | White lean text, simple Gantt and line chart | Real image and genuinely differentiated client actions |
| 04 Visual Storytelling | Full-bleed photo narrative, milestone progression, photographic comparison | Beige story strip, three blank numbered boxes, basic timeline | Dated authorised photo narrative, coherent stages and real documented changes |
| 05 Technical Dashboard | Dense but usable analytic dashboard, task/resource/risk charts with navigation | Small moisture chart, equipment table and three counters | Detail panels, cross-linked room evidence, richer analysis and printable tables |
| 06 Interactive 3D | Verified navigable property model, cutaway/exploded layers and clickable hotspots | Repeated static conceptual 2D plan; no actual 3D | Real measured 2D/3D with licensed geometry, controls, accessible fallback |
| 07 Safety & Compliance | Safety-led hero, visual risk map, prominent action cards, person/site context | Readable static hazards, room plan and equipment table | Escalation/action evidence, risk category semantics, maps and report-wide accessibility validation |
| 08 Before/During/After | Paired genuine condition photos and working reveal slider | Numbered placeholders without media | Provenanced matching-angle images, interactive compare, PDF snapshots |
| 09 Map & Location | Actual consented geospatial map with risk/route/site layers | Static 2D room plan reused as map; no location map | Permission-scoped geographic data and functioning map with accessible legend |
| 10 Branded Custom | Tenant-approved real logo, typography/palette choices, distinct reusable client template | Bronze accent variant, no configurable tenant branding | Brand editor driven by authorized organisation identity, WCAG guard and PDF parity |

**Visual result:** 10 selectable modes rendered in local Chrome, but **none has been signed off as matching its founder reference.** Do not manufacture a 100-point visual score or state all ten designs are shipped.

## Non-negotiable visual QA workflow
1. Pin a versioned **original reference image** and its rights/usage provenance, with a separate founder acceptance rubric for each mode. The model-generated reference is creative direction, not a source of factual claim data.
2. Render identical synthetic evidence with full data/source labels through all ten modes at 375px mobile and 1280px desktop, plus print and reduced-motion. Capture actual output and compare matched crop/device size, avoiding inflated similarity from shared headers.
3. Require each mode's own visual and functional affordances. A style-colour swap does not count as a distinct layout. Spatial, map, video and before/after experiences must only claim capabilities implemented with verified evidence; otherwise show clearly labelled fallback.
4. Automated pre-acceptance: no horizontal overflow, no runtime exceptions, no missing assets or critical information, keyboard/contrast/label checks, static equivalent on PDF, no private-data leaks, no wrong-company branding, and source-linked contents.
5. Human/founder visual acceptance: reviewer inspects actual desktop/mobile/printed report against the approved reference for hierarchy, photographic/diagram quality, aesthetics, legibility, safety, distinctiveness and overall polish. An agent cannot invent founder signoff.
6. For every failure: file the exact screenshot pair, missing target criterion, severity, next change and rerun. Apply the founder finite 3-attempt causal debugging rule and do not merge visual acceptance into generic unit-test green.
7. Once actual data is integrated, repeat all visual tests against authorised read-only inspection/test tenant, then validate printed report in Acrobat/Preview/Chrome and applicable insurer ingestion pipelines. Never use screenshots or animation as sole evidence.

## Current release gate
**BLOCKED: VISUAL TARGET NOT ACCEPTED; REAL REPORT ADAPTER NOT WIRED.**
Do not mark RA-8106 or RA-8110 Done, declare production readiness, or push/merge/deploy without existing release approvals. The temporary screenshot gallery is only an observation tool.

## Ownership
- RA-8106: engineering work to close all ten design gaps and connect real authorised data.
- RA-8107/8108: animation, comparison media, real 3D/maps and accessibility.
- RA-8109: PDF parity with actual report output.
- RA-8110: screenshot approval matrix, independent QA/JEV where applicable and release evidence.
