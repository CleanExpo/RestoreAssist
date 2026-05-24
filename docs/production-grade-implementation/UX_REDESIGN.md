# UX Redesign

Date: 2026-05-24  
Design stance: mobile-first, dark-first, fieldwork-grade, shadcn/ui primitives, no competitor copying.

## UX Goal

RestoreAssist should make a junior technician feel guided and a senior technician feel unblocked. Every screen should answer:

- What job am I on?
- What room am I in?
- What evidence is still missing?
- What is the fastest valid action now?
- Can I speak instead of type?
- Will this be claim-ready when I leave site?

## New Core Workflow

### 1. Zero-Friction Onboarding

Current problem:

New users must understand too much before they see value.

Redesign:

1. Create account.
2. Ask for ABN or NZBN.
3. Pull business name, GST status, state, and defaults.
4. Create first workspace.
5. Ask: "Are you owner, manager, or technician?"
6. Let user start a demo inspection or invite first technician.
7. Defer integrations until after first report, except storage if required.

AI role:

- Setup Agent explains only the next decision.
- It should never show a broad checklist when one action is enough.

### 2. Technician Home

Primary mobile screen:

- Today's jobs.
- One "Start next job" button.
- Offline status.
- Sync status.
- Urgent blockers only.

Do not show:

- Marketing text.
- Analytics dashboards.
- Admin modules.
- Long navigation lists.

### 3. Job Capture Cockpit

The first screen inside an inspection should be a cockpit, not a document page.

Required controls:

- Room selector.
- Big camera button.
- Big voice button.
- Moisture reading button.
- Sketch/floorplan button.
- Evidence completeness ring.
- Next required capture card.
- Offline/sync badge.

States:

- "Ready to leave site" only appears when hard evidence gates pass.
- Missing critical evidence appears before optional admin tasks.
- AI suggestions always land as editable drafts.

### 4. Room-Based Capture

Create a room graph early:

- Import property plan if available.
- Upload existing plan and trace.
- Draw manually.
- Scan/LiDAR later.
- Allow "unknown room" fallback.

Every evidence item should link to a room:

- Photo.
- Moisture reading.
- Psychrometric reading.
- Damage tag.
- Equipment placement.
- Scope item.
- Voice observation.

### 5. Voice-First Field Use

Voice modes:

- Dictation: "Bedroom wall reading 18.5 percent WME."
- Command: "Add photo note: swollen skirting under window."
- Guidance: "What am I missing before I leave?"
- Review: "Read back what you captured in the kitchen."

Interaction rules:

- Voice must confirm destructive or claim-changing actions.
- High-confidence low-risk observations can auto-stage as drafts.
- The technician approves final writes when confidence is medium/low or compliance-sensitive.
- Offline transcription queues audio and transcript events.

### 6. AI-Guided Capture

AI should act as a checklist compression layer:

- "You have the source photo and two affected-area photos. You still need structural moisture baseline in hallway."
- "This photo looks like a meter reading but I cannot see the number. Retake or enter manually?"
- "You placed two air movers. Add serial numbers before final handoff."

AI must not:

- Auto-close jobs.
- Invent compliance citations.
- Commit report text without an editable draft.
- Hide uncertainty.

### 7. Smarter Photo Evidence

Photo capture should include:

- Room and stage.
- GPS/time/device metadata.
- Damage category tag.
- Blur/darkness warning.
- Duplicate warning.
- Meter-reading OCR attempt.
- Before/after pairing.
- Required-photo checklist.

Default photo stages:

- Arrival.
- Source.
- Affected area.
- Moisture reading.
- Equipment placement.
- Drying progress.
- Final.
- Signoff.

### 8. Sketch/Floorplan Flow

Target: normal residential floorplan/mapped sketch in under 5 minutes.

Flow:

1. "Use property plan?" if available.
2. "Upload or photograph plan" if technician has one.
3. "Trace rooms" with snap and calibration.
4. "Drop moisture pins."
5. "Attach photos to rooms."
6. "Export in report."

Avoid:

- Requiring full CAD precision.
- Forcing 3D scans for every loss.
- Making the technician choose from many drawing tools before the room graph exists.

### 9. Report Generation

Report UX should be continuous:

- Live report status builds during capture.
- Missing sections show as capture tasks.
- Report generation is a final assembly step, not a mystery AI event.
- Every AI section has source evidence links.

### 10. Admin/Insurer Handoff

Handoff package:

- Claim summary.
- PDF report.
- Photo index.
- Sketch/floorplan.
- Drying log.
- Moisture readings.
- Equipment log.
- Scope/invoice package.
- Audit log.
- Machine-readable JSON for integrations.

UX:

- One "Prepare handoff" action.
- Shows missing blockers and optional warnings.
- Sends/share-links only after admin confirmation.

## Navigation Model

Mobile technician:

- Jobs.
- Capture.
- Reports.
- Settings.

Manager/admin:

- Dashboard.
- Jobs.
- Team.
- Reports.
- Billing.
- Integrations.
- Settings.

The app can still have all modules, but role-based navigation must hide irrelevant ones.

## Accessibility and Field Constraints

- 44px minimum touch target, 52-56px for field capture tools.
- Works in low light.
- No tiny icon-only actions without accessible labels/tooltips.
- All critical actions must survive offline/retry.
- Use haptics for capture/confirm/failure in mobile shell.
- Large readable status labels for wet-site/noisy conditions.

## Success Metrics

- First inspection created within 3 minutes of signup.
- First valid photo evidence captured within 30 seconds of opening a job.
- Normal residential room graph/sketch under 5 minutes.
- Fewer than 5 taps for common photo plus note capture.
- 90 percent of reports pass evidence completeness before admin review.
- 50 percent reduction in office clarification requests.
- Median AI cost per complete inspection below target budget in `COST_OPTIMIZATION_PLAN.md`.

