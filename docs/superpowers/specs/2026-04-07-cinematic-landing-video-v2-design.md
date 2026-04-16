# Cinematic Landing Video V2 — Design Spec

**Date:** 2026-04-07
**Status:** Approved
**Scope:** New Remotion composition `CinematicLandingV2` + matching component library + landing page wire-up

---

## 1. Context & Problem

The landing page video section (`app/page.tsx` lines 395–466) embeds `/videos/landing-page-overview.mp4`, which does not exist. The player renders as a blank black box. The existing Remotion composition `LandingPageOverview` was scaffolded but uses flat navy backgrounds and basic spring animations — functional placeholders, not broadcast quality.

**Goal:** Replace with a professionally produced 90-second cinematic video rendered via Remotion. Warner Bros–standard production quality: letterbox brand reveal, kinetic typography, full-bleed screenshot scenes, animated stat counters, ElevenLabs Australian voiceover + music bed.

---

## 2. Approach

Option chosen: **New composition + new component library** (Option 2).

- Create `CinematicLandingV2` composition alongside existing compositions
- Build an isolated set of cinematic components in `packages/videos/src/components/cinematic/`
- Existing `ProductExplainer`, `IndustryInsight`, and `LandingPageOverview` compositions are untouched
- Landing page `src` and `poster` attributes updated to point at the new rendered file
- Old composition remains available for reference

---

## 3. Composition Specification

| Property       | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Composition ID | `CinematicLandingV2`                                           |
| Duration       | 2700 frames                                                    |
| FPS            | 30                                                             |
| Width          | 1920                                                           |
| Height         | 1080                                                           |
| Output file    | `public/videos/landing-page-overview-v2.mp4`                   |
| Poster frame   | `public/videos/landing-page-overview-v2-poster.jpg` (frame 60) |
| Codec          | H.264, CRF 18                                                  |

**Default props registered in Root.tsx:**

```ts
defaultProps: {
  title: "RestoreAssist — One System. Fewer Gaps. More Confidence.",
  description: "AI-powered damage assessment for Australian restoration professionals.",
  version: "2.0"
}
```

---

## 4. Scene Map

| #   | Scene                  | Frames    | Time   | Component          | Audio segment       |
| --- | ---------------------- | --------- | ------ | ------------------ | ------------------- |
| 1   | Letterbox Brand Reveal | 0–300     | 0–10s  | `LetterboxReveal`  | `lp-intro.mp3`      |
| 2   | System Overview        | 300–660   | 10–22s | `KineticTextScene` | `lp-overview.mp3`   |
| 3   | Dashboard Full-Bleed   | 660–990   | 22–33s | `FullBleedScene`   | `lp-dashboard.mp3`  |
| 4   | Key Advantages         | 990–1350  | 33–45s | `KineticTextScene` | `lp-advantages.mp3` |
| 5   | Australian Compliance  | 1350–1680 | 45–56s | `FullBleedScene`   | `lp-compliance.mp3` |
| 6   | AI Scope Generation    | 1680–2010 | 56–67s | `FullBleedScene`   | `lp-scope.mp3`      |
| 7   | Impact Stats           | 2010–2400 | 67–80s | `StatCounterScene` | `lp-stats.mp3`      |
| 8   | Cinematic CTA Outro    | 2400–2700 | 80–90s | `CinematicCTA`     | `lp-cta.mp3`        |

All scenes share a continuous background music bed mixed at -18dB under the voiceover.

---

## 5. Component Library

All components live in `packages/videos/src/components/cinematic/`. Each is self-contained with no shared state.

### 5.1 `LetterboxReveal`

**Used in:** Scene 1 (open), Scene 8 (close/callback)

**Behaviour:**

- Two black bars (`height: 135px` each = 2.39:1 ratio) animate in from top and bottom simultaneously using `spring({ damping: 22, stiffness: 120 })`, meeting at the vertical extremes within 20 frames
- Logo (`/public/logo.png`, 160×160px) fades in at centre with `spring` opacity, backed by a `#D4A574` radial gradient flare (`radial-gradient(circle, rgba(212,165,116,0.35) 0%, transparent 60%)`)
- Tagline types word-by-word: `"One System. Fewer Gaps. More Confidence."` — each word fades in on a 12-frame stagger using `interpolate` with `clamp`
- At frame 210: bars animate back out (reverse spring), frame opens to full 1920×1080
- Transition out: tagline fades, logo scales to `0.3` and repositions to bottom-right bug position as Scene 2 begins

**Scene 8 variant (`mode="outro"`):**

- Bars sweep back in from top/bottom
- Logo returns to centre with flare
- CTA text and URL animate in (see `CinematicCTA`)

**Props:**

```ts
interface LetterboxRevealProps {
  mode: "intro" | "outro";
  logoSrc: string; // "/logo.png"
  tagline: string;
}
```

---

### 5.2 `KineticTextScene`

**Used in:** Scenes 2 & 4

**Behaviour:**

- Background: `linear-gradient(160deg, #050505 0%, #1C2E47 100%)` with an animated film-grain SVG filter overlay (`feTurbulence` + `feDisplacementMap`) at 3% opacity — adds cinematic texture without distracting
- Section label: small-caps, `tracking-widest`, `#8A6B4E`, slides in from `x: -80` with spring over 25 frames
- Up to 4 bullet lines stagger in at 20-frame intervals. Each line:
  - Enters from `x: -60px, opacity: 0` → `x: 0, opacity: 1` with `spring({ damping: 18, stiffness: 90 })`
  - Accent words (passed as `accentWords: string[]`) receive a `#D4A574` underline drawn left-to-right via `scaleX: 0→1` interpolation, triggered 8 frames after the line settles
- Logo bug: `48×48px` `/public/logo.png`, bottom-right, `opacity: 0.45`, present from frame 10

**Props:**

```ts
interface KineticTextSceneProps {
  label: string;
  bullets: Array<{ text: string; accentWords?: string[] }>;
  backgroundVariant?: "dark" | "navy"; // default: "dark"
}
```

---

### 5.3 `FullBleedScene`

**Used in:** Scenes 3, 5 & 6

**Behaviour:**

- Screenshot (`Img` from Remotion) fills full 1920×1080 with `object-fit: cover`; all screenshots use mock data (no real user data)
- Overlay: `rgba(5, 5, 5, 0.72)` — screenshot reads as cinematic atmosphere, not UI demo
- **Primary kinetic statement** (80–96px, white, bold): animates up from `y: 80px, opacity: 0` with `spring({ damping: 20, stiffness: 80 })` at frame 15
- Accent bar: a 4px `#D4A574` horizontal rule, `width: 0→480px`, drawn left-to-right via `interpolate` over 20 frames after primary text settles
- **Supporting line** (32px, `#D4A574`): fades in at frame 45
- Exit: overlay darkens to `rgba(5,5,5,0.92)` over 15 frames before scene end, providing clean transition
- Logo bug: same as `KineticTextScene`

**Mock screenshot assets** (to be created/placed in `public/screenshots/mock/`):

- `dashboard-mock.png` — dashboard with anonymised job data
- `compliance-mock.png` — scope items with IICRC citations, dummy client name
- `scope-mock.png` — generated scope of works, dummy property address

**Props:**

```ts
interface FullBleedSceneProps {
  screenshotPath: string; // path under public/
  primaryStatement: string;
  supportingLine: string;
  accentBarWidth?: number; // default: 480
}
```

---

### 5.4 `StatCounterScene`

**Used in:** Scene 7

**Behaviour:**

- Background: `#1C2E47` with three radial glows positioned behind each stat card (colours: `#06b6d4`, `#D4A574`, `#3b82f6` at 18% opacity)
- Section heading (`"Why Restoration Teams Choose RestoreAssist"`) in `#D4A574`, 44px, slides up at frame 0
- Three stat cards stagger in at 25-frame intervals:
  - Counter: `interpolate(frame, [delay, delay+45], [0, targetValue])` with `Easing.out(Easing.cubic)` — rounds to integer for display
  - Unit suffix (e.g. `"+ hrs"`, `"%"`) in accent colour, 30px
  - Label: white, 22px, bold
  - Detail: `rgba(255,255,255,0.55)`, 17px
  - Card background: `rgba(255,255,255,0.05)`, left border `4px solid accent`
- Logo bug present

**Props:**

```ts
interface StatCounterSceneProps {
  heading: string;
  stats: Array<{
    targetValue: number;
    unit?: string;
    label: string;
    detail: string;
    accent: string;
  }>;
}
```

---

### 5.5 `CinematicCTA`

**Used in:** Scene 8

**Behaviour:**

- Wraps `LetterboxReveal mode="outro"` — bars close in from top and bottom by frame 30
- Inside the letterbox band: logo reappears with `#D4A574` flare (same as Scene 1, callback)
- Below logo: `"Start Your Free Trial"` in 72px bold white, spring-entrance from `y: 30`
- URL `restoreassist.app` in `#D4A574`, 36px, with a subtle `box-shadow` pulse animation (glow in/out over 60-frame cycle)
- Tagline reprise: `"One System. Fewer Gaps. More Confidence."` fades in at frame 90, 28px, `rgba(255,255,255,0.75)`
- Final 30 frames: slow fade to black

**No props** — values are hardcoded from `BRAND` constants sourced at composition level.

---

## 6. Logo Presence

| Location         | Size      | Opacity | Position                  |
| ---------------- | --------- | ------- | ------------------------- |
| Scene 1 opener   | 160×160px | 100%    | Centre frame              |
| Scenes 2–7 (bug) | 48×48px   | 45%     | Bottom-right, 40px margin |
| Scene 8 outro    | 160×160px | 100%    | Centre frame              |

Logo source: `staticFile("logo.png")` via Remotion's asset system (copies from `public/logo.png` at render time).

---

## 7. Audio

### 7.1 Voiceover

- Provider: ElevenLabs API (existing integration via `lib/deepseek-api.ts` pattern)
- Voice: Australian English — voice ID configured in `ELEVENLABS_VOICE_ID` env var
- 8 segments generated independently, one per scene, named `lp-intro.mp3` through `lp-cta.mp3`
- Generated by `scripts/video-pipeline/generate-voiceover.ts` — add `CinematicLandingV2` as a target composition
- Audio files stored in `packages/videos/public/audio/`

### 7.2 Voiceover Scripts (per scene)

| Scene          | Script                                                                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 – Intro      | _"RestoreAssist. The platform built for Australian restoration professionals who need every job documented, compliant, and paid — without the paperwork chaos."_                                                      |
| 2 – Overview   | _"One system that handles your inspection report, scope of works, and cost estimate. With IICRC standards built in and evidence attached to every line item."_                                                        |
| 3 – Dashboard  | _"Your command centre for every active job. See what needs attention, track drying progress, and push updates to insurers — all from one screen."_                                                                    |
| 4 – Advantages | _"Save over two hours per inspection. Never miss a scope item. Export directly to Xero, Ascora, ServiceM8, QuickBooks, and MYOB. And stay fully compliant across all eight Australian states."_                       |
| 5 – Compliance | _"Built for Australian law. IICRC S500, S520, and S700 standards are automatically applied. State-specific regulatory triggers fire based on job location. Every inspection builds a court-ready evidence register."_ |
| 6 – Scope      | _"AI generates your complete scope of works in seconds. Every item is IICRC-cited, evidence-linked, and ready for the insurer. What used to take two hours now takes thirty seconds."_                                |
| 7 – Stats      | _"Over two hours saved per inspection. One hundred percent IICRC-compliant reports. Coverage across all eight Australian states. RestoreAssist is how professional restoration businesses operate."_                  |
| 8 – CTA        | _"Start your free trial today. No credit card required. Three full reports, completely free. Visit restoreassist.app and get your first job documented in under ten minutes."_                                     |

### 7.3 Background Music

- Royalty-free cinematic/corporate instrumental (placeholder: `packages/videos/public/audio/bg-music.mp3`)
- Mixed at -18dB under voiceover via separate `<Audio>` component with `volume={0.12}`
- Fades in over first 30 frames, fades out over last 30 frames via `interpolate`

---

## 8. Mock Data Requirements

All `FullBleedScene` screenshots must use mock data. Required assets (create before render):

| File                                          | Content                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `public/screenshots/mock/dashboard-mock.png`  | Dashboard view — job list with names like "Smith Residence", "123 Test St", placeholder readings |
| `public/screenshots/mock/compliance-mock.png` | Scope items view — IICRC citations visible, client name "Demo Client Pty Ltd"                    |
| `public/screenshots/mock/scope-mock.png`      | Generated scope of works — property "456 Example Ave, Sydney NSW 2000"                           |

Screenshots can be real product screenshots with data replaced, or Remotion-rendered static frames.

---

## 9. File Structure

```
packages/videos/src/
  components/
    cinematic/                        ← NEW
      LetterboxReveal.tsx
      KineticTextScene.tsx
      FullBleedScene.tsx
      StatCounterScene.tsx
      CinematicCTA.tsx
      index.ts                        ← barrel export
  compositions/
    CinematicLandingV2.tsx            ← NEW composition
    LandingPageOverview.tsx           ← UNCHANGED
    ProductExplainer.tsx              ← UNCHANGED
    IndustryInsight.tsx               ← UNCHANGED
  Root.tsx                            ← add CinematicLandingV2 registration

public/
  videos/
    landing-page-overview-v2.mp4     ← rendered output
    landing-page-overview-v2-poster.jpg ← frame 60 export
  screenshots/
    mock/
      dashboard-mock.png
      compliance-mock.png
      scope-mock.png
```

---

## 10. Landing Page Wire-Up

Single change to `app/page.tsx` (lines 435–436):

```tsx
// Before
src = "/videos/landing-page-overview.mp4";

// After
src = "/videos/landing-page-overview-v2.mp4";
poster = "/videos/landing-page-overview-v2-poster.jpg";
```

No other changes to the video section — the cinematic player shell (aspect-ratio wrapper, play button overlay, motion entrance) is already production-quality.

---

## 11. Render Pipeline

1. `pnpm video:voiceover` — generates 8 ElevenLabs segments into `packages/videos/public/audio/`
2. Place background music at `packages/videos/public/audio/bg-music.mp3`
3. Place mock screenshots at `public/screenshots/mock/`
4. `pnpm video:render` — renders `CinematicLandingV2` to `public/videos/landing-page-overview-v2.mp4`
5. Export frame 60 as poster JPG (add to render script)
6. Deploy — video and poster served as static assets via Next.js `public/`

---

## 12. Out of Scope

- Rebuilding `ProductExplainer`, `IndustryInsight`, or `LandingPageOverview` compositions
- Interactive Remotion Player embed (deferred — Option 3 from the design session)
- Automatic video re-rendering on content change (manual render step is intentional)
- Subtitles/captions (can be added in a follow-up)
