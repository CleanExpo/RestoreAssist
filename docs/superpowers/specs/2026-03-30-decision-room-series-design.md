# Decision Room — Series Design Document

**Date:** 2026-03-30
**Status:** Approved for implementation
**Scope:** Remotion composition architecture · 8-episode Season 1 · YouTube OAuth pipeline

---

## 1. What We Are Building

A cinematic documentary series called **Decision Room** — eight 5-minute episodes, each revealing one major architectural decision made during the RestoreAssist build. Target audience: restoration industry professionals, solo founders, and developers building compliance software.

**Series framing:** Every episode follows the same six-act structure:

> Methods Evaluated → SWOT Analysis → Decision Granted → Product Alive

No competitor or tool names are mentioned. The narrative is entirely about the problem space, the methods considered, and the decision process that shaped the product.

**Production standard:** Senior production house quality. Frame-precise timing, deliberate colour grading per act, kinetic SWOT reveal, real application screenshots pulled by Playwright, Inter Display typography, ElevenLabs voiceover with pacing markers. Full production bible encoded in the `decision-room-production` skill.

---

## 2. Season 1 — Eight Episodes

| #   | Title                                       | Decision                                   | Product Feature Unlocked                                      |
| --- | ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| 1   | The Sketch Tool Decision                    | Interactive canvas rendering approach      | 9-mode drawing tool, 50-step undo/redo, multi-floor canvas    |
| 2   | Encoding a 200-Page Standard as Code        | IICRC S500 rules engine approach           | Automated drying goal validation, EMC thresholds per material |
| 3   | AI-Generated Compliance Documentation       | Scope narrative generation approach        | Real-time IICRC-cited 7-section scope, SSE streaming          |
| 4   | Connecting to Australian Industry Software  | Legacy job management integration approach | Live Ascora job sync, historical pricing import               |
| 5   | Auto-Filling Property Data at the Jobsite   | Property data retrieval approach           | Auto-populated beds/baths/land size, 90-day cache             |
| 6   | Taking the Platform to the Field            | Mobile delivery approach                   | Offline-first iOS/Android apps, Bluetooth meter pairing       |
| 7   | One Developer. One AI. Ninety Days.         | Solo-founder development approach          | The full RestoreAssist compliance platform                    |
| 8   | Visualising Moisture — The Mapping Decision | Moisture visualisation approach            | SVG moisture map, IICRC equipment placement ratios            |

---

## 3. Episode Architecture

### 3.1 Five Acts, 9,000 Frames (5:00 @ 30fps)

```text
ACT 0  Cold Open          frames    0–270     0:00–0:09   9s
ACT 1  The Problem        frames  270–1350    0:09–0:45  36s
ACT 2  Methods Evaluated  frames 1350–3600    0:45–2:00  75s  (3 methods × 25s)
ACT 3  SWOT               frames 3600–5850    2:00–3:15  75s
ACT 4  Decision Granted   frames 5850–7920    3:15–4:24  69s
ACT 5  Product Alive      frames 7920–9000    4:24–5:00  36s
```

Full frame-by-frame beat map: `~/.claude/skills/decision-room-production/references/timing-chart.md`

### 3.2 Act Principles

**Cold open:** Black screen, single stat or quote, no logo for 8 seconds. The weight lands before the brand.

**Problem act:** Cold colour grade (desaturated navy, cyan at 65%). Facts enter with REVEAL easing. Headline at frame 570. Real Linear ticket citation at frame 960.

**Methods act:** One method per screen. Methods enter and dim as the next arrives — the dimming signals "considered and moved past." Real app screenshots where applicable.

**SWOT act:** Four-beat kinetic sequence. Strengths enter from left. Weaknesses enter from right simultaneously — in visual opposition. Opportunities rise from below. Threats descend briefly from above (8 seconds only). Maximum tension at frame 4620, then Threats fade while Opportunities pulse. Near-darkness before the decision.

**Decision Granted:** Single sentence, full-bleed, Display 80px. 12-frame cut to black before the product screenshot fills the frame. "SHIPPED" at 60% opacity over the live product. First warmth in the episode's colour grade.

**Product Alive:** 3–4 product screenshots cross-dissolving. Progress bar depletes. Final mark. Silence.

---

## 4. Remotion Composition Architecture

### 4.1 File Structure

```text
src/
├── shared\
│   ├── brand.tsx          — tokens, LogoMark, GlowOrb, GridOverlay, CyanRule
│   ├── motion.ts          — 6 named easing curves, 2 spring configs
│   ├── typography.tsx     — Display, Heading, Body, Mono, Label components
│   └── transitions.tsx    — SceneTransition, ActTransition, WhiteFlash
├── boardroom\
│   ├── ColdOpenScene.tsx  — stat/quote fade-in, logo reveal, episode badge
│   ├── ProblemScene.tsx   — facts, headline, sub-headline, ticket citation
│   ├── MethodScene.tsx    — takes method index + content + optional screenshot
│   ├── SWOTScene.tsx      — four-beat kinetic sequence with split-screen tension
│   ├── DecisionScene.tsx  — full-bleed statement, 12f black cut, SHIPPED reveal
│   └── ProductScene.tsx   — screenshot cross-dissolve, progress bar, final mark
├── BoardroomComposition.tsx   — composition ID: "BoardroomDecisionRoom"
├── VideoGuideComposition.tsx  — composition ID: "VideoGuide" (unchanged)
└── index.ts               — registers both compositions
```

Each scene file stays under 200 lines. Shared primitives are imported, never duplicated.

### 4.2 Motion Language

Six named curves, used consistently across all scenes:

| Name              | Curve                                     | Use                                      |
| ----------------- | ----------------------------------------- | ---------------------------------------- |
| REVEAL            | `cubic-bezier(0.16, 1, 0.3, 1)`           | Content entering — fast out, slow settle |
| EMPHASIS          | `cubic-bezier(0.34, 1.56, 0.64, 1)`       | Stats, headlines — slight overshoot      |
| DISMISS           | `linear`                                  | Methods dimming as next arrives          |
| SCENE_TRANSITION  | white flash 3f + cross-fade 15f           | Act boundaries                           |
| DECISION_SNAP     | `spring({ damping: 14, stiffness: 180 })` | Decision statement only                  |
| SCREENSHOT_REVEAL | `cubic-bezier(0.25, 0.46, 0.45, 0.94)`    | Product screenshots                      |

Spring animations are used **only** for DECISION_SNAP and the CTA scale-in. Everything else uses the named curves above.

### 4.3 Colour System

Grade shifts across acts to carry emotional weight:

| Act       | Background                    | Feel                |
| --------- | ----------------------------- | ------------------- |
| Cold Open | `#0a0f1a`                     | Before anything     |
| Problem   | `#101827`                     | Cold, urgent        |
| Methods   | `#152338` (base navy)         | Neutral, considered |
| SWOT      | Split: warm left / cool right | Tension             |
| Decision  | `#1a1508`                     | First warmth        |
| Product   | `#0f172a`                     | Confident close     |

Full hex values with glow orb positions: `~/.claude/skills/decision-room-production/references/color-system.md`

### 4.4 Typography

```text
Display:  Inter Display 800   — headlines, decision statement (72–96px, tracking -2.5)
Heading:  Inter 700            — method names, SWOT headers (40–52px, tracking -1.0)
Body:     Inter 400            — facts, descriptions (20–24px, tracking 0)
Mono:     JetBrains Mono 400  — code, ticket refs, timestamps (16–18px)
Label:    Inter 500 ALL CAPS  — episode badge, act labels, "SHIPPED" (12–14px, tracking +3.0)
```

### 4.5 Episode Content Schema

Content lives in `content/resources/{slug}.json`, extended with Decision Room fields:

```typescript
interface DecisionRoomEpisode {
  slug: string;
  title: string;
  episodeNumber: number;
  coldOpenStat: string; // ≤12 words, single striking line
  problem: {
    headline: string; // ≤8 words
    facts: string[]; // 2–3 facts, ≤20 words each
    ticketRef?: string; // e.g. "RA-93"
  };
  methods: Array<{
    name: string; // ≤6 words, no product/tool names
    description: string; // ≤30 words
    screenshotName?: string; // from public/screenshots/
    consequence?: string; // "if chosen: …" ≤20 words
  }>;
  swot: {
    strengths: [string, string];
    weaknesses: [string, string];
    opportunities: [string, string];
    threats: [string, string];
  };
  decisionStatement: string; // THE sentence. ≤20 words. One only.
  shippedScreenshot: string; // from public/screenshots/
  productScreenshots: string[]; // 3–4 filenames, cross-dissolve sequence
  videoScript: string; // ElevenLabs TTS with [PAUSE] markers
  tags: string[];
}
```

---

## 5. Production Pipeline

### 5.1 Full Run (one episode)

```bash
# Step 1: Generate voiceover (ElevenLabs)
npx tsx scripts/video-pipeline/index.ts \
  --slug sketch-tool-decision \
  --step voiceover \
  --voice 21m00Tcm4TlvDq8ikWAM

# Step 2: Capture screenshots (Playwright, app must be running)
npx tsx scripts/video-pipeline/index.ts \
  --slug sketch-tool-decision \
  --step screenshot

# Step 3: Render (Remotion, 9000 frames)
npx tsx scripts/video-pipeline/index.ts \
  --slug sketch-tool-decision \
  --step render \
  --composition BoardroomDecisionRoom \
  --frames 9000

# Step 4: Upload to YouTube (private by default — review before publishing)
npx tsx scripts/video-pipeline/index.ts \
  --slug sketch-tool-decision \
  --step upload

# Or run all steps at once:
npx tsx scripts/video-pipeline/index.ts \
  --slug sketch-tool-decision
```

### 5.2 Required Environment Variables

```bash
# Voiceover
ELEVENLABS_API_KEY=

# YouTube upload
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=       # generated once via get-youtube-token.ts
```

---

## 6. YouTube OAuth Automation

### 6.1 One-Time Token Generator

New script: `scripts/video-pipeline/get-youtube-token.ts`

**Flow:**

1. Reads `YOUTUBE_CLIENT_ID` + `YOUTUBE_CLIENT_SECRET` from env
2. Generates the OAuth consent URL with `https://www.googleapis.com/auth/youtube.upload` scope
3. Opens it in the default browser (`open` / `start`)
4. Spins up a local HTTP server on `localhost:8080/callback`
5. Captures the auth code from the callback redirect
6. Exchanges code for tokens via `googleapis`
7. Writes `YOUTUBE_REFRESH_TOKEN=<token>` to `.env.local`
8. Prints confirmation and exits

**Run once. Token persists in `.env.local`. Never needs to be run again** unless access is revoked.

```bash
npx tsx scripts/video-pipeline/get-youtube-token.ts
```

### 6.2 Upload Behaviour

- All uploads default to `privacyStatus: "private"`
- Thumbnail sourced from `public/screenshots/dashboard.png` if present
- Category: `28` (Science & Technology)
- Description sourced from `content/resources/{slug}.json` → `description` field
- Tags sourced from `tags` array

After upload, review in YouTube Studio and set to Public/Unlisted manually.

---

## 7. What Is Not In Scope

- Audio mixing beyond ElevenLabs voiceover (no music bed, no SFX in this phase)
- Animated captions / subtitles (separate future phase)
- Remotion Studio preview deployment (local rendering only)
- Auto-publishing to YouTube (always starts private — intentional)
- Season 2 episode content (this spec covers Season 1 scaffolding only)

---

## 8. Implementation Sequence

1. **Shared library** — extract primitives from `VideoGuideComposition.tsx` into `src/shared/`
2. **Motion + typography modules** — `motion.ts`, `typography.tsx`
3. **Six boardroom scene files** — `ColdOpenScene`, `ProblemScene`, `MethodScene`, `SWOTScene`, `DecisionScene`, `ProductScene`
4. **`BoardroomComposition.tsx`** — assembles scenes, reads episode JSON, registers as `BoardroomDecisionRoom`
5. **`index.ts` update** — registers new composition alongside existing `VideoGuide`
6. **Episode JSON files** — `content/resources/` for all 8 episodes (scripts + SWOT + assets)
7. **`get-youtube-token.ts`** — OAuth one-time flow, writes refresh token to `.env.local`
8. **Pipeline CLI update** — `--composition` flag passthrough to render step
9. **Screenshot capture additions** — any episode-specific pages not in current `DEFAULT_PAGES`
10. **End-to-end test render** — Episode 1 (Sketch Tool), dry-run upload

---

## 9. Success Criteria

- [ ] `BoardroomComposition` renders without TypeScript errors
- [ ] Cold open: black screen for 8 seconds (240 frames) before any logo
- [ ] SWOT: Strengths and Weaknesses enter simultaneously from opposing sides
- [ ] Decision Granted: 12-frame cut to black before product screenshot
- [ ] "SHIPPED" visible over product screenshot at 60% opacity
- [ ] Real app screenshot (not placeholder) in MethodScene for Episode 1
- [ ] Episode 1 renders to MP4 at correct 9,000 frames (5:00 @ 30fps)
- [ ] `get-youtube-token.ts` writes `YOUTUBE_REFRESH_TOKEN` to `.env.local` after OAuth flow
- [ ] Upload script posts Episode 1 as private to YouTube successfully
