# CinematicLandingV2 v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 91s CinematicLandingV2 into a 147s Before/After showcase with a new SplitScene component, real/placeholder screenshots, and 10 re-scripted ElevenLabs voiceovers.

**Architecture:** 10-scene Remotion 4 composition. New `SplitScene` (6 instances) replaces `FullBleedScene`. Root.tsx updated from 2730→4410 frames. Placeholder screenshots copied from existing assets; Playwright capture script provided for live replacement.

**Tech Stack:** Remotion 4, TypeScript, React 18, ElevenLabs eleven_multilingual_v2, Playwright (screenshot capture)

---

## File Map

| Action | File                                                                            |
| ------ | ------------------------------------------------------------------------------- |
| Create | `packages/videos/src/components/cinematic/SplitScene.tsx`                       |
| Modify | `packages/videos/src/components/cinematic/index.ts`                             |
| Modify | `packages/videos/src/scripts/generate-voiceover.ts`                             |
| Modify | `packages/videos/src/components/cinematic/StatCounterScene.tsx`                 |
| Modify | `packages/videos/src/compositions/CinematicLandingV2.tsx`                       |
| Modify | `packages/videos/src/Root.tsx`                                                  |
| Create | `packages/videos/scripts/capture-screenshots.ts`                                |
| Copy   | `packages/videos/public/screenshots/real/*.png` (6 files, from existing assets) |
| Copy   | `packages/videos/public/audio/lp-problem.mp3` etc. (4 placeholder copies)       |

---

## Task 1: Create SplitScene.tsx

**Files:**

- Create: `packages/videos/src/components/cinematic/SplitScene.tsx`

- [ ] **Step 1: Create the file**

```typescript
// packages/videos/src/components/cinematic/SplitScene.tsx
import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface SplitSceneProps {
  beforeStat: string;
  beforeStatContext: string;
  painPoints: string[];
  screenshotPath: string;
  afterLabel: string;
  afterCallout: string;
}

const isNumericStat = (s: string) => /^\d+$/.test(s.trim());

export const SplitScene: React.FC<SplitSceneProps> = ({
  beforeStat,
  beforeStatContext,
  painPoints,
  screenshotPath,
  afterLabel,
  afterCallout,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enterOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const leftSpring = spring({ frame, fps, config: { damping: 26, stiffness: 70 } });
  const leftX = interpolate(leftSpring, [0, 1], [-40, 0]);

  const rightSpring = spring({
    frame: Math.max(0, frame - 5),
    fps,
    config: { damping: 26, stiffness: 70 },
  });
  const rightX = interpolate(rightSpring, [0, 1], [40, 0]);

  const beforeLabelOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isNumeric = isNumericStat(beforeStat);
  const statAnimProgress = interpolate(frame, [20, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const statScale = isNumeric ? 1 : interpolate(statAnimProgress, [0, 1], [0.85, 1]);
  const statOpacity = isNumeric ? 1 : statAnimProgress;
  const numericTarget = isNumeric ? parseInt(beforeStat, 10) : 0;
  const numericCount = isNumeric
    ? Math.round(
        interpolate(frame, [20, 60], [0, numericTarget], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        })
      )
    : 0;

  const contextOpacity = interpolate(frame, [65, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const sepScale = interpolate(frame, [70, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const dividerScale = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const vsOpacity = interpolate(frame, [35, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const chipOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const calloutOpacity = interpolate(frame, [80, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const kenBurnsScale = interpolate(
    frame,
    [0, durationInFrames],
    [1.04, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ display: "flex", fontFamily: "Inter, sans-serif", fontSize: 27 }}>
      {/* LEFT PANEL */}
      <div
        style={{
          width: "46%",
          backgroundColor: "#080808",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "7% 8% 7% 9%",
          overflow: "hidden",
          transform: `translateX(${leftX}px)`,
          flexShrink: 0,
        }}
      >
        {/* Red vignette */}
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 20% 50%, rgba(180,10,10,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        {/* 2px red left border */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "15%",
            bottom: "15%",
            width: 2,
            background:
              "linear-gradient(180deg, transparent, #EF4444 40%, #EF4444 60%, transparent)",
          }}
        />
        {/* BEFORE label */}
        <div
          style={{
            fontSize: "0.52em",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase" as const,
            color: "#EF4444",
            marginBottom: 18,
            opacity: beforeLabelOpacity * 0.85,
          }}
        >
          Before
        </div>
        {/* Hero stat */}
        <div
          style={{
            fontSize: "3.8em",
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1,
            marginBottom: 6,
            filter: "brightness(0.75)",
            transform: `scale(${statScale})`,
            opacity: statOpacity,
            transformOrigin: "left center",
          }}
        >
          {isNumeric ? String(numericCount) : beforeStat}
        </div>
        {/* Stat context */}
        <div
          style={{
            fontSize: "0.78em",
            color: "rgba(255,255,255,0.38)",
            fontWeight: 500,
            marginBottom: 28,
            letterSpacing: "0.01em",
            opacity: contextOpacity,
          }}
        >
          {beforeStatContext}
        </div>
        {/* Separator */}
        <div
          style={{
            width: 32,
            height: 1,
            background: "rgba(239,68,68,0.4)",
            marginBottom: 20,
            transformOrigin: "left center",
            transform: `scaleX(${sepScale})`,
          }}
        />
        {/* Pain points */}
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column" as const,
            gap: 10,
          }}
        >
          {painPoints.map((point, i) => {
            const delay = 90 + i * 35;
            const pOpacity = interpolate(frame, [delay, delay + 15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 9,
                  opacity: pOpacity,
                }}
              >
                <span
                  style={{
                    color: "rgba(239,68,68,0.7)",
                    fontSize: "0.6em",
                    fontWeight: 700,
                    marginTop: 1,
                    flexShrink: 0,
                    lineHeight: 1.6,
                  }}
                >
                  ✕
                </span>
                <span
                  style={{
                    fontSize: "0.6em",
                    color: "rgba(255,255,255,0.38)",
                    lineHeight: 1.5,
                  }}
                >
                  {point}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* DIVIDER */}
      <div
        style={{
          width: 1,
          background:
            "linear-gradient(180deg, transparent 0%, rgba(212,165,116,0.6) 25%, #D4A574 50%, rgba(212,165,116,0.6) 75%, transparent 100%)",
          flexShrink: 0,
          position: "relative",
          boxShadow: "0 0 8px rgba(212,165,116,0.3)",
          transformOrigin: "center center",
          transform: `scaleY(${dividerScale})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#080808",
            border: "1px solid rgba(212,165,116,0.4)",
            color: "#D4A574",
            fontSize: "0.38em",
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "3px 7px",
            borderRadius: 3,
            whiteSpace: "nowrap" as const,
            textTransform: "uppercase" as const,
            opacity: vsOpacity,
          }}
        >
          vs
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          transform: `translateX(${rightX}px)`,
        }}
      >
        <Img
          src={staticFile(screenshotPath)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${kenBurnsScale})`,
            transformOrigin: "center center",
          }}
        />
        {/* Light overlay */}
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(135deg, rgba(5,5,5,0.15) 0%, rgba(5,5,5,0.0) 60%)",
            pointerEvents: "none",
          }}
        />
        {/* "With RestoreAssist" chip */}
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "rgba(212,165,116,0.12)",
            border: "1px solid rgba(212,165,116,0.35)",
            color: "#D4A574",
            fontSize: "0.5em",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase" as const,
            padding: "4px 12px",
            borderRadius: 3,
            opacity: chipOpacity,
          }}
        >
          With RestoreAssist
        </div>
        {/* Callout annotation */}
        <div
          style={{
            position: "absolute",
            bottom: "14%",
            right: "8%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            opacity: calloutOpacity,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#D4A574",
              boxShadow: "0 0 8px rgba(212,165,116,0.8)",
              flexShrink: 0,
            }}
          />
          <div style={{ width: 30, height: 1, background: "rgba(212,165,116,0.6)" }} />
          <div
            style={{
              background: "rgba(212,165,116,0.9)",
              color: "#000",
              fontSize: "0.48em",
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: 3,
              whiteSpace: "nowrap" as const,
            }}
          >
            {afterCallout}
          </div>
        </div>
      </div>

      {/* Fade overlays */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(0,0,0,${1 - enterOpacity})`,
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(0,0,0,${exitOpacity})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/videos && npx tsc --noEmit src/components/cinematic/SplitScene.tsx 2>&1 | head -20
```

Expected: no errors (or only "Cannot find module" for remotion which is fine without full project context).

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/components/cinematic/SplitScene.tsx
git commit -m "feat(video): add SplitScene component — Before/After split layout"
```

---

## Task 2: Export SplitScene from index.ts

**Files:**

- Modify: `packages/videos/src/components/cinematic/index.ts`

- [ ] **Step 1: Add export line**

Add these two lines at the end of `packages/videos/src/components/cinematic/index.ts`:

```typescript
export { SplitScene } from "./SplitScene";
export type { SplitSceneProps } from "./SplitScene";
```

- [ ] **Step 2: Commit**

```bash
git add packages/videos/src/components/cinematic/index.ts
git commit -m "feat(video): export SplitScene from cinematic index"
```

---

## Task 3: Update generate-voiceover.ts

**Files:**

- Modify: `packages/videos/src/scripts/generate-voiceover.ts`

Replace the `CINEMATIC_LANDING_V2_SEGMENTS` array (lines 94–135) with the new 10-segment v3 array. Change `VOICE_ID` default from `"onwK4e9ZLuTAKqWW03F9"` to `"aGkVQvWUZi16EH8aZJvT"`.

- [ ] **Step 1: Replace CINEMATIC_LANDING_V2_SEGMENTS and update VOICE_ID**

Replace the entire `CINEMATIC_LANDING_V2_SEGMENTS` constant with:

```typescript
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "aGkVQvWUZi16EH8aZJvT";
```

```typescript
const CINEMATIC_LANDING_V2_SEGMENTS: VoiceoverSegment[] = [
  {
    id: "lp-intro",
    text: "RestoreAssist. Built for Australian restoration professionals who need every job documented, compliant, and paid — without the paperwork chaos.",
    outputPath: "public/audio/lp-intro.mp3",
  },
  {
    id: "lp-problem",
    text: "Australian restoration teams spend more time on paperwork than on restoration. Claims get disputed. Evidence goes missing. And critical data ends up scattered across spreadsheets, phones, and email threads. There's a better way.",
    outputPath: "public/audio/lp-problem.mp3",
  },
  {
    id: "lp-dashboard",
    text: "Every active job, visible from one screen. Status, progress, drying goals, and insurer updates — your command centre for every site you manage.",
    outputPath: "public/audio/lp-dashboard.mp3",
  },
  {
    id: "lp-scope",
    text: "AI generates your complete scope of works in thirty seconds. Every line item calculated from your inspection data. IICRC-cited, evidence-linked, and ready to send.",
    outputPath: "public/audio/lp-scope.mp3",
  },
  {
    id: "lp-compliance",
    text: "IICRC S500, S520, and S700 — cited automatically on every scope item. State-specific compliance triggers fire based on job location. Every inspection builds a court-ready evidence register.",
    outputPath: "public/audio/lp-compliance.mp3",
  },
  {
    id: "lp-report",
    text: "Complete evidence captured on site — moisture readings, photographs, classifications, and observations in a single timestamped record. Nothing assembled from memory after the job.",
    outputPath: "public/audio/lp-report.mp3",
  },
  {
    id: "lp-moisture",
    text: "Floor plans, moisture readings, and drying progression mapped in one view. Watch the affected area dry down over time — and prove it to the insurer.",
    outputPath: "public/audio/lp-moisture.mp3",
  },
  {
    id: "lp-invoice",
    text: "One click to export your scope and invoice directly to Xero, Ascora, ServiceM8, QuickBooks, or MYOB. No re-keying. No transcription errors.",
    outputPath: "public/audio/lp-invoice.mp3",
  },
  {
    id: "lp-stats",
    text: "Over two hours saved per inspection. One hundred percent IICRC-compliant reports across all eight Australian states. RestoreAssist is how professional restoration businesses operate.",
    outputPath: "public/audio/lp-stats.mp3",
  },
  {
    id: "lp-cta",
    text: "Start your free trial today. Three full reports, completely free. No credit card required. Visit restoreassist dot app.",
    outputPath: "public/audio/lp-cta.mp3",
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add packages/videos/src/scripts/generate-voiceover.ts
git commit -m "feat(video): update v3 voiceover scripts — 10 Australian-English segments, new voice ID"
```

---

## Task 4: Update StatCounterScene.tsx

**Files:**

- Modify: `packages/videos/src/components/cinematic/StatCounterScene.tsx`

Changes: stat font 72→88px, heading font 44→52px, stagger 25→40 frames, add animated progress bar under each stat.

- [ ] **Step 1: Update the constants and heading font size**

Change:

```typescript
const STAT_STAGGER = 25;
```

To:

```typescript
const STAT_STAGGER = 40;
```

Change heading fontSize from `44` to `52`:

```typescript
fontSize: 52,
```

- [ ] **Step 2: Update stat number font size from 72 to 88 and add progress bar**

In the stat card render block, change `fontSize: 72` to `fontSize: 88`.

After the `{stat.unit && ...}` block, add a progress bar inside the card, after the detail text:

```typescript
{/* Animated progress bar */}
{(() => {
  const barProgress = interpolate(
    frame,
    [delay, delay + 60],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );
  return (
    <div
      style={{
        marginTop: 20,
        height: 3,
        width: "100%",
        background: "rgba(255,255,255,0.08)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${barProgress * 100}%`,
          background: `linear-gradient(90deg, ${stat.accent}, ${stat.accent}88)`,
          borderRadius: 2,
        }}
      />
    </div>
  );
})()}
```

Note: You'll need to add `Easing` to the imports from remotion if not already imported.

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/components/cinematic/StatCounterScene.tsx
git commit -m "feat(video): StatCounterScene — larger fonts, 40f stagger, animated progress bar"
```

---

## Task 5: Update CinematicLandingV2.tsx

**Files:**

- Modify: `packages/videos/src/compositions/CinematicLandingV2.tsx`

Full replacement with 10-scene structure using SplitScene for scenes 3–8.

- [ ] **Step 1: Replace the entire file**

```typescript
// packages/videos/src/compositions/CinematicLandingV2.tsx
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  CinematicCTA,
  KineticTextScene,
  LetterboxReveal,
  SplitScene,
  StatCounterScene,
} from "../components/cinematic";

const tryAudio = (path: string, volume = 1) => {
  return <Audio src={staticFile(path)} volume={volume} />;
};

export const CinematicLandingV2: React.FC = () => {
  const frame = useCurrentFrame();

  const bgMusicVolume = interpolate(
    frame,
    [0, 30, 4380, 4410],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>

      {tryAudio("audio/bg-music.mp3", bgMusicVolume)}

      {/* Scene 1: Letterbox Brand Reveal — 0f, 390f (13s) */}
      <Sequence from={0} durationInFrames={390}>
        <LetterboxReveal
          mode="intro"
          logoSrc="logo.png"
          tagline="Built for Australian Restoration Professionals"
        />
        {tryAudio("audio/lp-intro.mp3")}
      </Sequence>

      {/* Scene 2: The Industry Problem — 390f, 420f (14s) */}
      <Sequence from={390} durationInFrames={420}>
        <KineticTextScene
          label="The Industry Problem"
          bullets={[
            {
              text: "Restoration teams across Australia spend more time on paperwork than restoration",
              accentWords: ["more time on paperwork"],
            },
            {
              text: "Insurance claims get disputed because scopes lack IICRC citations and evidence",
              accentWords: ["disputed"],
            },
            {
              text: "Critical data lives across spreadsheets, phones, and email threads — never in one place",
              accentWords: ["never in one place"],
            },
          ]}
          backgroundVariant="dark"
        />
        {tryAudio("audio/lp-problem.mp3")}
      </Sequence>

      {/* Scene 3: Dashboard — 810f, 450f (15s) */}
      <Sequence from={810} durationInFrames={450}>
        <SplitScene
          beforeStat="6"
          beforeStatContext="Separate tools to manage one job"
          painPoints={[
            "Jobs tracked across spreadsheets, email threads, and paper dockets",
            "No single view of what's active, overdue, or waiting on insurer",
            "Updates manually communicated — nothing is automatic",
          ]}
          screenshotPath="screenshots/real/dashboard.png"
          afterLabel="Dashboard — Command Centre"
          afterCallout="Every job. One screen."
        />
        {tryAudio("audio/lp-dashboard.mp3")}
      </Sequence>

      {/* Scene 4: AI Scope Generation — 1260f, 480f (16s) */}
      <Sequence from={1260} durationInFrames={480}>
        <SplitScene
          beforeStat="2h 47m"
          beforeStatContext="Average scope writing time per water damage job"
          painPoints={[
            "Scope written line-by-line from memory or handwritten notes",
            "No IICRC citations included — insurers push back on approval",
            "Quantities estimated by eye, not calculated from measurements",
          ]}
          screenshotPath="screenshots/real/scope.png"
          afterLabel="AI Scope Generation"
          afterCallout="Full scope in 30 seconds"
        />
        {tryAudio("audio/lp-scope.mp3")}
      </Sequence>

      {/* Scene 5: IICRC Compliance — 1740f, 450f (15s) */}
      <Sequence from={1740} durationInFrames={450}>
        <SplitScene
          beforeStat="0"
          beforeStatContext="IICRC citations on a typical scope of works"
          painPoints={[
            "Compliance checked manually against printed standards documents",
            "State-specific triggers missed — building code breaches go unnoticed",
            "Disputed claims due to insufficient evidence of standard adherence",
          ]}
          screenshotPath="screenshots/real/compliance.png"
          afterLabel="IICRC Compliance Engine"
          afterCallout="S500 · S520 · S700 cited"
        />
        {tryAudio("audio/lp-compliance.mp3")}
      </Sequence>

      {/* Scene 6: Inspection Report — 2190f, 450f (15s) */}
      <Sequence from={2190} durationInFrames={450}>
        <SplitScene
          beforeStat="3"
          beforeStatContext="Different phones photos are spread across"
          painPoints={[
            "Evidence captured across multiple devices with no central record",
            "Moisture readings noted on paper, typed up later — errors introduced",
            "Court-ready documentation assembled after the fact, not captured on site",
          ]}
          screenshotPath="screenshots/real/report.png"
          afterLabel="Inspection Report"
          afterCallout="Court-ready evidence, captured on site"
        />
        {tryAudio("audio/lp-report.mp3")}
      </Sequence>

      {/* Scene 7: Moisture Mapping — 2640f, 450f (15s) */}
      <Sequence from={2640} durationInFrames={450}>
        <SplitScene
          beforeStat="0"
          beforeStatContext="Digital records of drying progress on most jobs"
          painPoints={[
            "Floor plans sketched by hand on paper or in basic drawing apps",
            "Moisture readings mapped manually — no visual overlay",
            "Drying progress tracked in separate spreadsheets, not linked to the plan",
          ]}
          screenshotPath="screenshots/real/moisture.png"
          afterLabel="Moisture Mapping"
          afterCallout="Readings plotted. Progress tracked."
        />
        {tryAudio("audio/lp-moisture.mp3")}
      </Sequence>

      {/* Scene 8: Invoice & Export — 3090f, 390f (13s) */}
      <Sequence from={3090} durationInFrames={390}>
        <SplitScene
          beforeStat="3×"
          beforeStatContext="Data re-keyed to create one invoice"
          painPoints={[
            "Scope items manually re-entered into accounting software",
            "Line items transcribed from report to Xero or MYOB by hand",
            "Hours lost weekly to data re-entry that should never happen",
          ]}
          screenshotPath="screenshots/real/invoice.png"
          afterLabel="Invoice & Export"
          afterCallout="One click to Xero, Ascora, MYOB"
        />
        {tryAudio("audio/lp-invoice.mp3")}
      </Sequence>

      {/* Scene 9: Impact Stats — 3480f, 510f (17s) */}
      <Sequence from={3480} durationInFrames={510}>
        <StatCounterScene
          heading="Why Restoration Teams Choose RestoreAssist"
          stats={[
            {
              targetValue: 2,
              unit: "+ hrs",
              label: "Saved per inspection",
              detail: "AI scope generation replaces manual line-item entry",
              accent: "#06b6d4",
            },
            {
              targetValue: 100,
              unit: "%",
              label: "IICRC compliant reports",
              detail: "S500, S520 & S700 citations on every scope item",
              accent: "#D4A574",
            },
            {
              targetValue: 8,
              label: "Australian states covered",
              detail: "State-specific building codes & regulatory triggers built in",
              accent: "#3b82f6",
            },
          ]}
        />
        {tryAudio("audio/lp-stats.mp3")}
      </Sequence>

      {/* Scene 10: Cinematic CTA — 3990f, 420f (14s) */}
      <Sequence from={3990} durationInFrames={420}>
        <CinematicCTA />
        {tryAudio("audio/lp-cta.mp3")}
      </Sequence>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/videos/src/compositions/CinematicLandingV2.tsx
git commit -m "feat(video): CinematicLandingV2 v3 — 10 scenes, SplitScene Before/After, 147s"
```

---

## Task 6: Update Root.tsx

**Files:**

- Modify: `packages/videos/src/Root.tsx`

- [ ] **Step 1: Change durationInFrames from 2730 to 4410**

In `packages/videos/src/Root.tsx`, the `CinematicLandingV2` Composition has `durationInFrames={2730}`. Change it to `durationInFrames={4410}`.

- [ ] **Step 2: Commit**

```bash
git add packages/videos/src/Root.tsx
git commit -m "feat(video): Root.tsx — CinematicLandingV2 duration 2730→4410 (147s)"
```

---

## Task 7: Create capture-screenshots.ts

**Files:**

- Create: `packages/videos/scripts/capture-screenshots.ts`

- [ ] **Step 1: Create the Playwright capture script**

```typescript
/**
 * packages/videos/scripts/capture-screenshots.ts
 *
 * Captures 6 real app screenshots at 1920×1080 for the CinematicLandingV2 v3 video.
 *
 * Prerequisites:
 *   - App running at NEXTAUTH_URL (default: http://localhost:3001)
 *   - CAPTURE_EMAIL and CAPTURE_PASSWORD set in .env.local
 *   - npx playwright install chromium
 *
 * Usage:
 *   cd packages/videos
 *   NEXTAUTH_URL=http://localhost:3001 CAPTURE_EMAIL=... CAPTURE_PASSWORD=... npx ts-node scripts/capture-screenshots.ts
 */

import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3001";
const EMAIL = process.env.CAPTURE_EMAIL || "";
const PASSWORD = process.env.CAPTURE_PASSWORD || "";
const OUT_DIR = path.resolve(__dirname, "../public/screenshots/real");

interface Capture {
  name: string;
  route: string;
  output: string;
  waitFor?: string; // CSS selector to wait for
}

async function findFirstId(
  page: import("playwright").Page,
  listRoute: string,
  linkPattern: RegExp,
): Promise<string | null> {
  await page.goto(`${BASE_URL}${listRoute}`, { waitUntil: "networkidle" });
  const links = await page.$$eval("a[href]", (els) =>
    els.map((el) => el.getAttribute("href") || ""),
  );
  for (const href of links) {
    const m = href.match(linkPattern);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error(
      "[capture] Set CAPTURE_EMAIL and CAPTURE_PASSWORD in .env.local",
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Login
  console.log("[capture] Logging in...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/dashboard**`, { timeout: 15000 });
  console.log("[capture] Logged in.");

  // Resolve real IDs
  const reportId = await findFirstId(
    page,
    "/dashboard/reports",
    /\/dashboard\/reports\/([a-z0-9-]+)/,
  );
  const inspectionId = await findFirstId(
    page,
    "/dashboard/inspections",
    /\/dashboard\/inspections\/([a-z0-9-]+)/,
  );

  const captures: Capture[] = [
    {
      name: "dashboard",
      route: "/dashboard",
      output: "dashboard.png",
    },
    {
      name: "scope",
      route: reportId
        ? `/dashboard/reports/${reportId}/edit`
        : "/dashboard/reports",
      output: "scope.png",
    },
    {
      name: "compliance",
      route: reportId ? `/dashboard/reports/${reportId}` : "/dashboard/reports",
      output: "compliance.png",
    },
    {
      name: "report",
      route: inspectionId
        ? `/dashboard/inspections/${inspectionId}`
        : "/dashboard/inspections",
      output: "report.png",
    },
    {
      name: "moisture",
      route: inspectionId
        ? `/dashboard/inspections/${inspectionId}/sketch-preview`
        : "/dashboard/inspections",
      output: "moisture.png",
    },
    {
      name: "invoice",
      route: "/dashboard/invoices",
      output: "invoice.png",
    },
  ];

  for (const capture of captures) {
    console.log(`[capture] ${capture.name}: ${capture.route}`);
    try {
      await page.goto(`${BASE_URL}${capture.route}`, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      const outPath = path.join(OUT_DIR, capture.output);
      await page.screenshot({ path: outPath, type: "png" });
      console.log(`[capture] ✓ ${capture.output}`);
    } catch (err) {
      console.warn(
        `[capture] ✗ ${capture.name} failed: ${(err as Error).message}`,
      );
    }
  }

  await browser.close();
  console.log(`\n[capture] Done. Screenshots in: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[capture] FAILED:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/videos/scripts/capture-screenshots.ts
git commit -m "feat(video): add Playwright screenshot capture script for real app screens"
```

---

## Task 8: Set up placeholder screenshots and audio

- [ ] **Step 1: Create screenshots/real/ directory and copy placeholder images**

```bash
mkdir -p packages/videos/public/screenshots/real

# Dashboard — use best available dashboard screenshot
cp packages/videos/public/screenshots/dashboard-new-inspection.png \
   packages/videos/public/screenshots/real/dashboard.png

# Scope — use scope-items-generated screenshot
cp packages/videos/public/screenshots/scope-items-generated.png \
   packages/videos/public/screenshots/real/scope.png

# Compliance — re-use scope screenshot (closest available)
cp packages/videos/public/screenshots/scope-items-generated.png \
   packages/videos/public/screenshots/real/compliance.png

# Report — re-use dashboard-new-inspection (inspection view)
cp packages/videos/public/screenshots/dashboard-new-inspection.png \
   packages/videos/public/screenshots/real/report.png

# Moisture — use mock dashboard (no sketch screenshot available)
cp packages/videos/public/screenshots/mock/dashboard-mock.png \
   packages/videos/public/screenshots/real/moisture.png

# Invoice — use integrations-export screenshot
cp packages/videos/public/screenshots/integrations-export.png \
   packages/videos/public/screenshots/real/invoice.png
```

- [ ] **Step 2: Copy placeholder audio for missing VOs**

```bash
# lp-problem (scene 2) — no equivalent, reuse lp-overview
cp packages/videos/public/audio/lp-overview.mp3 \
   packages/videos/public/audio/lp-problem.mp3

# lp-report (scene 6) — reuse lp-compliance
cp packages/videos/public/audio/lp-compliance.mp3 \
   packages/videos/public/audio/lp-report.mp3

# lp-moisture (scene 7) — reuse lp-dashboard
cp packages/videos/public/audio/lp-dashboard.mp3 \
   packages/videos/public/audio/lp-moisture.mp3

# lp-invoice (scene 8) — reuse lp-stats
cp packages/videos/public/audio/lp-stats.mp3 \
   packages/videos/public/audio/lp-invoice.mp3
```

- [ ] **Step 3: Verify files exist**

```bash
ls packages/videos/public/screenshots/real/
ls packages/videos/public/audio/lp-*.mp3
```

Expected: 6 PNG files in real/, all 10 lp-\*.mp3 files present.

- [ ] **Step 4: Commit**

```bash
git add packages/videos/public/screenshots/real/
git add packages/videos/public/audio/lp-problem.mp3 \
        packages/videos/public/audio/lp-report.mp3 \
        packages/videos/public/audio/lp-moisture.mp3 \
        packages/videos/public/audio/lp-invoice.mp3
git commit -m "assets(video): placeholder screenshots + audio for v3 render"
```

---

## Task 9: Render video

- [ ] **Step 1: Run the render**

```bash
cd packages/videos && node render-cinematic.js
```

Expected output:

```
[render] Bundling Remotion composition...
[render] Bundling... 100%
[render] Composition: 4410 frames @ 30fps (147.0s)
[render] Output: .../public/videos/landing-page-overview-v2.mp4
[render] Frame 4410/4410 (100%)
[render] Video rendered.
[render] Poster exported: .../public/videos/landing-page-overview-v2-poster.jpg
✓ Render complete!
```

- [ ] **Step 2: Verify output**

```bash
ls -lh public/videos/landing-page-overview-v2.mp4
ls -lh public/videos/landing-page-overview-v2-poster.jpg
```

Expected: video file exists and is >50MB, poster exists.

- [ ] **Step 3: Commit**

```bash
git add public/videos/landing-page-overview-v2.mp4 \
        public/videos/landing-page-overview-v2-poster.jpg
git commit -m "feat(video): rendered CinematicLandingV2 v3 — 147s Before/After showcase"
```
