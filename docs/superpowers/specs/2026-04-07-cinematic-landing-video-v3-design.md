# CinematicLandingV2 — Video v3 Redesign

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Rebuild the 91s placeholder-screenshot video into a production-quality 147s Before/After showcase using real Playwright-captured app screenshots, a new `SplitScene` component, and 10 re-generated Australian-English ElevenLabs voiceovers.

**Architecture:** 10-scene Remotion composition (`CinematicLandingV2`). New `SplitScene` component handles scenes 3–8. Playwright script captures 6 real app screenshots at 1920×1080. All existing cinematic components retained and improved.

**Tech Stack:** Remotion 4, TypeScript, Playwright, ElevenLabs `eleven_multilingual_v2`, Inter font (Google Fonts)

---

## Scene Structure

| #   | Component          | `from` (f) | `dur` (f) | Duration | Content                                               |
| --- | ------------------ | ---------- | --------- | -------- | ----------------------------------------------------- |
| 1   | `LetterboxReveal`  | 0          | 390       | 13s      | Brand logo reveal + tagline                           |
| 2   | `KineticTextScene` | 390        | 420       | 14s      | "The Industry Problem" — 3 pain-point bullets         |
| 3   | `SplitScene`       | 810        | 450       | 15s      | Before: scattered jobs → After: Dashboard             |
| 4   | `SplitScene`       | 1260       | 480       | 16s      | Before: 2h 47m per job → After: AI Scope Generation   |
| 5   | `SplitScene`       | 1740       | 450       | 15s      | Before: 0 citations → After: IICRC Compliance view    |
| 6   | `SplitScene`       | 2190       | 450       | 15s      | Before: photos on 3 phones → After: Inspection Report |
| 7   | `SplitScene`       | 2640       | 450       | 15s      | Before: hand-drawn sketches → After: Moisture Mapping |
| 8   | `SplitScene`       | 3090       | 390       | 13s      | Before: re-keyed 3 times → After: Invoice/Export      |
| 9   | `StatCounterScene` | 3480       | 510       | 17s      | Animated impact counters                              |
| 10  | `CinematicCTA`     | 3990       | 420       | 14s      | Free-trial CTA outro                                  |

**Total:** 4410 frames = 147s ≈ 2 min 27s

Root.tsx `durationInFrames`: 4410

---

## Component: `SplitScene` (new)

**File:** `packages/videos/src/components/cinematic/SplitScene.tsx`

### Props

```typescript
export interface SplitSceneProps {
  // LEFT — Before
  beforeStat: string; // e.g. "2h 47m"
  beforeStatContext: string; // e.g. "Average documentation time per job"
  painPoints: string[]; // exactly 3 items
  // RIGHT — After
  screenshotPath: string; // relative to Remotion public dir, e.g. "screenshots/real/dashboard.png"
  afterLabel: string; // e.g. "Dashboard — Command Centre"
  afterCallout: string; // e.g. "Every job. One screen."
}
```

### Left Panel (46% width)

- Background: `#080808`
- Subtle red radial vignette: `rgba(180,10,10,0.12)` at 20% 50%
- 2px left border: `linear-gradient(180deg, transparent, #EF4444 40%, #EF4444 60%, transparent)`
- **"BEFORE" label**: 0.52em, `#EF4444`, letter-spacing 0.22em, uppercase — fades in frames 0–15
- **Hero stat**: 3.8em, weight 900, white, `filter: brightness(0.75)` — animation over frames 20–60: if the stat is purely numeric (e.g. `"6"`, `"0"`, `"3"`) use count-up from 0; otherwise (e.g. `"2h 47m"`, `"3×"`) use `scale(0.85)→scale(1)` + `opacity(0)→opacity(1)` with `Easing.out(Easing.cubic)`
- **Stat context**: 0.78em, `rgba(255,255,255,0.38)`, appears at frame 65
- **32px separator line**: `rgba(239,68,68,0.4)`, scaleX 0→1 over frames 70–85
- **Pain points**: 3 items, each at 0.6em, `rgba(255,255,255,0.38)`, stagger every 35 frames starting frame 90. `✕` icon in `rgba(239,68,68,0.7)`

### Divider (1px)

- `linear-gradient(180deg, transparent 0%, rgba(212,165,116,0.6) 25%, #D4A574 50%, rgba(212,165,116,0.6) 75%, transparent 100%)`
- `box-shadow: 0 0 8px rgba(212,165,116,0.3)`
- Draws in scaleY 0→1 from centre over frames 10–30
- Centre label `"vs"`: `background: #080808`, `border: 1px solid rgba(212,165,116,0.4)`, `color: #D4A574`, 0.38em, appears at frame 35

### Right Panel (flex: 1)

- `<Img>` with `objectFit: "cover"`, Ken Burns: `scale(1.04)` → `scale(1.0)` over full scene duration
- Overlay: `linear-gradient(135deg, rgba(5,5,5,0.15) 0%, rgba(5,5,5,0.0) 60%)` — very light, screenshot should be clearly visible
- **"With RestoreAssist" chip**: top-right, `rgba(212,165,116,0.12)` bg, `1px solid rgba(212,165,116,0.35)` border, `#D4A574` text, appears frame 25
- **Callout annotation**: bottom-right, dot (8px `#D4A574` + glow) + 30px line + pill tag, appears frame 80
  - Dot: `box-shadow: 0 0 8px rgba(212,165,116,0.8)`
  - Line: `1px rgba(212,165,116,0.6)`
  - Tag: `background: rgba(212,165,116,0.9)`, `color: #000`, 0.48em, bold

### Entry Animation

- Entire left panel: `translateX(-40px)` → `translateX(0)` spring `{ damping: 26, stiffness: 70 }` from frame 0
- Entire right panel: `translateX(40px)` → `translateX(0)` spring `{ damping: 26, stiffness: 70 }` from frame 5 (slight delay)
- Scene fade-in overlay: black → transparent over frames 0–20
- Scene fade-out overlay: transparent → black over last 20 frames

---

## Scene Content — SplitScene Data

### Scene 3 — Dashboard

- `beforeStat`: `"6"`
- `beforeStatContext`: `"Separate tools to manage one job"`
- `painPoints`: `["Jobs tracked across spreadsheets, email threads, and paper dockets", "No single view of what's active, overdue, or waiting on insurer", "Updates manually communicated — nothing is automatic"]`
- `afterLabel`: `"Dashboard — Command Centre"`
- `afterCallout`: `"Every job. One screen."`
- `screenshotPath`: `"screenshots/real/dashboard.png"`

### Scene 4 — AI Scope Generation

- `beforeStat`: `"2h 47m"`
- `beforeStatContext`: `"Average scope writing time per water damage job"`
- `painPoints`: `["Scope written line-by-line from memory or handwritten notes", "No IICRC citations included — insurers push back on approval", "Quantities estimated by eye, not calculated from measurements"]`
- `afterLabel`: `"AI Scope Generation"`
- `afterCallout`: `"Full scope in 30 seconds"`
- `screenshotPath`: `"screenshots/real/scope.png"`

### Scene 5 — IICRC Compliance

- `beforeStat`: `"0"`
- `beforeStatContext`: `"IICRC citations on a typical scope of works"`
- `painPoints`: `["Compliance checked manually against printed standards documents", "State-specific triggers missed — building code breaches go unnoticed", "Disputed claims due to insufficient evidence of standard adherence"]`
- `afterLabel`: `"IICRC Compliance Engine"`
- `afterCallout`: `"S500 · S520 · S700 cited"`
- `screenshotPath`: `"screenshots/real/compliance.png"`

### Scene 6 — Inspection Report

- `beforeStat`: `"3"`
- `beforeStatContext`: `"Different phones photos are spread across"`
- `painPoints`: `["Evidence captured across multiple devices with no central record", "Moisture readings noted on paper, typed up later — errors introduced", "Court-ready documentation assembled after the fact, not captured on site"]`
- `afterLabel`: `"Inspection Report"`
- `afterCallout`: `"Court-ready evidence, captured on site"`
- `screenshotPath`: `"screenshots/real/report.png"`

### Scene 7 — Moisture Mapping

- `beforeStat`: `"0"`
- `beforeStatContext`: `"Digital records of drying progress on most jobs"`
- `painPoints`: `["Floor plans sketched by hand on paper or in basic drawing apps", "Moisture readings mapped manually — no visual overlay", "Drying progress tracked in separate spreadsheets, not linked to the plan"]`
- `afterLabel`: `"Moisture Mapping"`
- `afterCallout`: `"Readings plotted. Progress tracked."`
- `screenshotPath`: `"screenshots/real/moisture.png"`

### Scene 8 — Invoice & Export

- `beforeStat`: `"3×"`
- `beforeStatContext`: `"Data re-keyed to create one invoice"`
- `painPoints`: `["Scope items manually re-entered into accounting software", "Line items transcribed from report to Xero or MYOB by hand", "Hours lost weekly to data re-entry that should never happen"]`
- `afterLabel`: `"Invoice & Export"`
- `afterCallout`: `"One click to Xero, Ascora, MYOB"`
- `screenshotPath`: `"screenshots/real/invoice.png"`

---

## Scene 2 — KineticTextScene Content

```typescript
label="The Industry Problem"
bullets={[
  { text: "Restoration teams across Australia spend more time on paperwork than restoration", accentWords: ["more time on paperwork"] },
  { text: "Insurance claims get disputed because scopes lack IICRC citations and evidence", accentWords: ["disputed"] },
  { text: "Critical data lives across spreadsheets, phones, and email threads — never in one place", accentWords: ["never in one place"] },
]}
backgroundVariant="dark"
```

---

## Screenshot Capture Script

**File:** `packages/videos/scripts/capture-screenshots.ts`

Uses Playwright to authenticate and capture 6 screenshots at 1920×1080.

```typescript
// Auth: POST /api/auth/credentials with env vars
// Routes to capture (script queries DB via Prisma to resolve real IDs for report/inspection):
const CAPTURES = [
  { route: "/dashboard", output: "dashboard.png" },
  { route: "/dashboard/reports/{firstReportId}/edit", output: "scope.png" },
  { route: "/dashboard/reports/{firstReportId}", output: "compliance.png" },
  { route: "/dashboard/inspections/{firstInspectionId}", output: "report.png" },
  {
    route: "/dashboard/inspections/{firstInspectionId}/sketch-preview",
    output: "moisture.png",
  },
  { route: "/dashboard/invoices", output: "invoice.png" },
];
// Script resolves {firstReportId} and {firstInspectionId} by querying:
//   prisma.report.findFirst({ orderBy: { createdAt: 'desc' } })
//   prisma.inspection.findFirst({ orderBy: { createdAt: 'desc' } })
// Output dir: packages/videos/public/screenshots/real/
// Viewport: 1920×1080
// Wait: networkidle before capture
```

The script uses `NEXTAUTH_URL`, `CAPTURE_EMAIL`, `CAPTURE_PASSWORD`, and `DATABASE_URL` from `.env.local`.

---

## Voiceover Scripts (Australian English)

10 scripts for `generate-voiceover.ts`, voice `aGkVQvWUZi16EH8aZJvT`, `eleven_multilingual_v2`:

| ID              | Script                                                                                                                                                                                                                                 | ~Duration |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `lp-intro`      | "RestoreAssist. Built for Australian restoration professionals who need every job documented, compliant, and paid — without the paperwork chaos."                                                                                      | 9s        |
| `lp-problem`    | "Australian restoration teams spend more time on paperwork than on restoration. Claims get disputed. Evidence goes missing. And critical data ends up scattered across spreadsheets, phones, and email threads. There's a better way." | 12s       |
| `lp-dashboard`  | "Every active job, visible from one screen. Status, progress, drying goals, and insurer updates — your command centre for every site you manage."                                                                                      | 9s        |
| `lp-scope`      | "AI generates your complete scope of works in thirty seconds. Every line item calculated from your inspection data. IICRC-cited, evidence-linked, and ready to send."                                                                  | 10s       |
| `lp-compliance` | "IICRC S500, S520, and S700 — cited automatically on every scope item. State-specific compliance triggers fire based on job location. Every inspection builds a court-ready evidence register."                                        | 11s       |
| `lp-report`     | "Complete evidence captured on site — moisture readings, photographs, classifications, and observations in a single timestamped record. Nothing assembled from memory after the job."                                                  | 11s       |
| `lp-moisture`   | "Floor plans, moisture readings, and drying progression mapped in one view. Watch the affected area dry down over time — and prove it to the insurer."                                                                                 | 10s       |
| `lp-invoice`    | "One click to export your scope and invoice directly to Xero, Ascora, ServiceM8, QuickBooks, or MYOB. No re-keying. No transcription errors."                                                                                          | 9s        |
| `lp-stats`      | "Over two hours saved per inspection. One hundred percent IICRC-compliant reports across all eight Australian states. RestoreAssist is how professional restoration businesses operate."                                               | 11s       |
| `lp-cta`        | "Start your free trial today. Three full reports, completely free. No credit card required. Visit restoreassist dot app."                                                                                                              | 8s        |

All output paths: `public/audio/lp-{id}.mp3` (same location as existing files — will overwrite).

---

## Updated Components

### `StatCounterScene` improvements

- Add animated progress bar (0% → 100% of target) beneath each stat number
- Increase stat font: 72px → 88px
- Increase heading font: 44px → 52px
- Stat stagger: 25 → 40 frames

### `CinematicLandingV2` wiring

- Replace all 8 old `<Sequence>` blocks with 10 new blocks matching scene table above
- `bgMusicVolume` keyframes: `[0, 30, 4380, 4410]`
- Add Google Fonts `<style>` import (already present, keep)
- Audio files: lp-intro, lp-problem, lp-dashboard, lp-scope, lp-compliance, lp-report, lp-moisture, lp-invoice, lp-stats, lp-cta

### `Root.tsx`

- `CinematicLandingV2` `durationInFrames`: 2730 → 4410

---

## File Summary

| Action      | File                                                                           |
| ----------- | ------------------------------------------------------------------------------ |
| **Create**  | `packages/videos/src/components/cinematic/SplitScene.tsx`                      |
| **Create**  | `packages/videos/scripts/capture-screenshots.ts`                               |
| **Update**  | `packages/videos/src/scripts/generate-voiceover.ts` — new 10 scripts           |
| **Update**  | `packages/videos/src/components/cinematic/StatCounterScene.tsx`                |
| **Update**  | `packages/videos/src/compositions/CinematicLandingV2.tsx`                      |
| **Update**  | `packages/videos/src/Root.tsx`                                                 |
| **Replace** | `packages/videos/public/screenshots/real/*.png` (6 files, Playwright-captured) |
| **Replace** | `packages/videos/public/audio/lp-*.mp3` (10 files, ElevenLabs)                 |
| **Replace** | `public/videos/landing-page-overview-v2.mp4` (re-rendered output)              |
| **Replace** | `public/videos/landing-page-overview-v2-poster.jpg` (re-rendered poster)       |
