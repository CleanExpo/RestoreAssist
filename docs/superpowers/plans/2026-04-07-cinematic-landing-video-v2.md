# CinematicLandingV2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a broadcast-quality 90-second Remotion composition (`CinematicLandingV2`) that replaces the blank landing page video with a cinematic letterbox brand reveal, kinetic typography, full-bleed screenshot scenes, animated stat counters, and ElevenLabs Australian voiceover.

**Architecture:** Five self-contained cinematic components in `packages/videos/src/components/cinematic/` drive the composition. The composition wires eight scenes in sequence using Remotion `<Sequence>` tags; each scene plays audio from `packages/videos/public/audio/` via `staticFile()`. A single `render-videos.ts` call produces the MP4 and a poster JPEG at frame 60 output to `public/videos/`.

**Tech Stack:** Remotion v4 (`spring`, `interpolate`, `Easing`, `staticFile`, `Img`, `Audio`), TypeScript, ElevenLabs API (`eleven_multilingual_v2`), Node.js `fs` for asset copy, `@remotion/renderer` `renderStill` for poster frame.

---

## File Map

| Action | Path                                                            | Purpose                                              |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------- |
| Copy   | `packages/videos/public/logo.png`                               | Logo asset for `staticFile("logo.png")`              |
| Create | `packages/videos/src/components/cinematic/LetterboxReveal.tsx`  | Bars sweep + logo + word tagline                     |
| Create | `packages/videos/src/components/cinematic/KineticTextScene.tsx` | Dark/navy bg + staggered bullets + accent underlines |
| Create | `packages/videos/src/components/cinematic/FullBleedScene.tsx`   | Full-frame screenshot + kinetic overlay              |
| Create | `packages/videos/src/components/cinematic/StatCounterScene.tsx` | Animated stat cards with radial glows                |
| Create | `packages/videos/src/components/cinematic/CinematicCTA.tsx`     | Outro letterbox + CTA text + URL glow                |
| Create | `packages/videos/src/components/cinematic/index.ts`             | Barrel export                                        |
| Create | `packages/videos/src/compositions/CinematicLandingV2.tsx`       | 2700-frame composition, 8 scenes                     |
| Modify | `packages/videos/src/Root.tsx`                                  | Register new composition                             |
| Copy   | `packages/videos/public/screenshots/mock/*.png`                 | Mock screenshot assets for FullBleedScenes           |
| Modify | `packages/videos/src/scripts/generate-voiceover.ts`             | Add 8 cinematic voiceover segments                   |
| Modify | `packages/videos/src/scripts/render-videos.ts`                  | Add `CinematicLandingV2` render + poster export      |
| Modify | `app/page.tsx`                                                  | Point video `src` + `poster` at new file             |

---

## Task 1: Logo Asset

**Files:**

- Copy: `public/logo.png` → `packages/videos/public/logo.png`

- [ ] **Step 1: Copy the logo**

```bash
cp public/logo.png packages/videos/public/logo.png
```

- [ ] **Step 2: Verify**

```bash
ls packages/videos/public/
```

Expected output includes: `logo.png  screenshots`

- [ ] **Step 3: Commit**

```bash
git add packages/videos/public/logo.png
git commit -m "feat(video): add logo asset to Remotion public dir"
```

---

## Task 2: LetterboxReveal Component

**Files:**

- Create: `packages/videos/src/components/cinematic/LetterboxReveal.tsx`

Two black bars (135px each = 2.39:1 letterbox) sweep in from top/bottom edges within 20 frames. Logo fades in at centre with `#D4A574` radial flare. Tagline types word-by-word with 12-frame stagger. In `intro` mode: bars sweep back out at frame 210, logo scales to 48px bug and repositions to bottom-right. In `outro` mode: bars stay closed, logo stays centred, no tagline (empty string handled gracefully).

- [ ] **Step 1: Create the component**

```tsx
// packages/videos/src/components/cinematic/LetterboxReveal.tsx
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface LetterboxRevealProps {
  mode: "intro" | "outro";
  logoSrc: string;
  tagline?: string;
}

const BAR_HEIGHT = 135;

export const LetterboxReveal: React.FC<LetterboxRevealProps> = ({
  mode,
  logoSrc,
  tagline = "",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bars sweep in from edges over ~20 frames
  const sweepIn = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 120 },
  });

  // Intro mode: bars reverse out at frame 210
  const sweepOut =
    mode === "intro"
      ? spring({
          frame: frame - 210,
          fps,
          config: { damping: 22, stiffness: 120 },
        })
      : 0;

  const topBarY =
    interpolate(sweepIn, [0, 1], [-BAR_HEIGHT, 0]) +
    interpolate(sweepOut, [0, 1], [0, -BAR_HEIGHT]);

  const bottomBarY =
    interpolate(sweepIn, [0, 1], [BAR_HEIGHT, 0]) +
    interpolate(sweepOut, [0, 1], [0, BAR_HEIGHT]);

  // Logo appearance
  const logoOpacity = spring({ frame, fps, config: { damping: 20 } });

  // Intro: logo transitions to bottom-right bug at frame 210
  const logoBugify =
    mode === "intro"
      ? spring({
          frame: frame - 210,
          fps,
          config: { damping: 20, stiffness: 80 },
        })
      : 0;

  const logoSize = interpolate(logoBugify, [0, 1], [160, 48]);
  const logoLeft = interpolate(
    logoBugify,
    [0, 1],
    [(1920 - 160) / 2, 1920 - 40 - 48],
  );
  const logoTop = interpolate(
    logoBugify,
    [0, 1],
    [(1080 - 160) / 2, 1080 - 40 - 48],
  );
  const logoFinalOpacity = interpolate(logoBugify, [0, 1], [logoOpacity, 0.45]);

  // Tagline fades out before bars sweep back (intro only)
  const taglineFade =
    mode === "intro"
      ? interpolate(frame, [195, 210], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const words = tagline.split(" ").filter(Boolean);

  return (
    <AbsoluteFill style={{ backgroundColor: "#050505" }}>
      {/* Radial flare behind logo */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(212,165,116,0.35) 0%, transparent 60%)",
          opacity: logoOpacity,
        }}
      />

      {/* Logo */}
      <Img
        src={staticFile(logoSrc)}
        style={{
          position: "absolute",
          left: logoLeft,
          top: logoTop,
          width: logoSize,
          height: logoSize,
          objectFit: "contain",
          opacity: logoFinalOpacity,
        }}
      />

      {/* Tagline: word by word */}
      {words.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "62%",
            left: 0,
            right: 0,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            justifyContent: "center",
            padding: "0 120px",
            opacity: taglineFade,
          }}
        >
          {words.map((word, i) => {
            const wordOpacity = interpolate(
              frame,
              [i * 12, i * 12 + 10],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            return (
              <span
                key={i}
                style={{
                  color: "white",
                  fontSize: 36,
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  opacity: wordOpacity,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      )}

      {/* Letterbox bars */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: BAR_HEIGHT,
          backgroundColor: "#000",
          transform: `translateY(${topBarY}px)`,
          zIndex: 10,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: BAR_HEIGHT,
          backgroundColor: "#000",
          transform: `translateY(${bottomBarY}px)`,
          zIndex: 10,
        }}
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors. If `packages/videos/tsconfig.json` doesn't exist, run from repo root: `npx tsc --noEmit packages/videos/src/components/cinematic/LetterboxReveal.tsx --jsx react --moduleResolution node --esModuleInterop`

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/components/cinematic/LetterboxReveal.tsx
git commit -m "feat(video): add LetterboxReveal cinematic component"
```

---

## Task 3: KineticTextScene Component

**Files:**

- Create: `packages/videos/src/components/cinematic/KineticTextScene.tsx`

Dark/navy gradient background with subtle SVG film-grain overlay at 3% opacity. Section label in `#8A6B4E` slides in from `x: -80`. Up to 4 bullets stagger in at 20-frame intervals. Accent words get a `#D4A574` underline drawn left-to-right. Logo bug at bottom-right at 45% opacity.

- [ ] **Step 1: Create the component**

```tsx
// packages/videos/src/components/cinematic/KineticTextScene.tsx
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface KineticBullet {
  text: string;
  accentWords?: string[];
}

export interface KineticTextSceneProps {
  label: string;
  bullets: KineticBullet[];
  backgroundVariant?: "dark" | "navy";
}

const LOGO_SIZE = 48;
const LOGO_MARGIN = 40;
const LABEL_DURATION = 25;
const BULLET_STAGGER = 20;

// Static SVG noise data URI (deterministic, no frame dependency needed for grain texture)
const GRAIN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E";

export const KineticTextScene: React.FC<KineticTextSceneProps> = ({
  label,
  bullets,
  backgroundVariant = "dark",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const background =
    backgroundVariant === "navy"
      ? "linear-gradient(160deg, #1C2E47 0%, #0d1e31 100%)"
      : "linear-gradient(160deg, #050505 0%, #1C2E47 100%)";

  // Label slides in from left
  const labelSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90 },
  });
  const labelX = interpolate(labelSpring, [0, 1], [-80, 0]);
  const labelOpacity = interpolate(frame, [0, LABEL_DURATION], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Logo bug fades in from frame 10
  const logoBugOpacity = interpolate(frame, [10, 25], [0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background, fontFamily: "Inter, sans-serif" }}>
      {/* Film grain texture overlay */}
      <AbsoluteFill
        style={{
          backgroundImage: `url("${GRAIN_SVG}")`,
          backgroundRepeat: "repeat",
          opacity: 0.03,
        }}
      />

      {/* Section label */}
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 120,
          color: "#8A6B4E",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "0.3em",
          textTransform: "uppercase" as const,
          transform: `translateX(${labelX}px)`,
          opacity: labelOpacity,
        }}
      >
        {label}
      </div>

      {/* Bullet list */}
      <div
        style={{
          position: "absolute",
          top: 190,
          left: 120,
          right: 120,
          display: "flex",
          flexDirection: "column" as const,
          gap: 52,
        }}
      >
        {bullets.map((bullet, i) => {
          const delay = LABEL_DURATION + i * BULLET_STAGGER;

          const bulletSpring = spring({
            frame: frame - delay,
            fps,
            config: { damping: 18, stiffness: 90 },
          });
          const bulletX = interpolate(bulletSpring, [0, 1], [-60, 0]);
          const bulletOpacity = interpolate(
            frame,
            [delay, delay + 12],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );

          // Accent underline draws 15 frames after the bullet enters
          const underlineDelay = delay + 15;
          const underlineScale = interpolate(
            frame,
            [underlineDelay, underlineDelay + 20],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          const hasAccent = bullet.accentWords && bullet.accentWords.length > 0;

          return (
            <div
              key={i}
              style={{
                transform: `translateX(${bulletX}px)`,
                opacity: bulletOpacity,
              }}
            >
              <p
                style={{
                  color: "white",
                  fontSize: 38,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  margin: 0,
                }}
              >
                {bullet.text}
              </p>
              {hasAccent && (
                <div
                  style={{
                    marginTop: 10,
                    height: 4,
                    width: 480,
                    backgroundColor: "#D4A574",
                    transformOrigin: "left center",
                    transform: `scaleX(${underlineScale})`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Logo bug */}
      <Img
        src={staticFile("logo.png")}
        style={{
          position: "absolute",
          right: LOGO_MARGIN,
          bottom: LOGO_MARGIN,
          width: LOGO_SIZE,
          height: LOGO_SIZE,
          objectFit: "contain",
          opacity: logoBugOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/components/cinematic/KineticTextScene.tsx
git commit -m "feat(video): add KineticTextScene cinematic component"
```

---

## Task 4: FullBleedScene Component

**Files:**

- Create: `packages/videos/src/components/cinematic/FullBleedScene.tsx`

Screenshot fills 1920×1080 with `object-fit: cover` and `rgba(5,5,5,0.72)` overlay. Primary statement enters from `y: 80` with spring. `#D4A574` accent bar draws left-to-right over 20 frames. Supporting line fades in at frame 45. Overlay darkens in the last 15 frames for clean scene transition. Logo bug at 45% opacity.

- [ ] **Step 1: Create the component**

```tsx
// packages/videos/src/components/cinematic/FullBleedScene.tsx
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface FullBleedSceneProps {
  screenshotPath: string;
  primaryStatement: string;
  supportingLine: string;
  accentBarWidth?: number;
}

const LOGO_SIZE = 48;
const LOGO_MARGIN = 40;

export const FullBleedScene: React.FC<FullBleedSceneProps> = ({
  screenshotPath,
  primaryStatement,
  supportingLine,
  accentBarWidth = 480,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Primary statement: enter from y:80 starting frame 15
  const primarySpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 20, stiffness: 80 },
  });
  const primaryY = interpolate(primarySpring, [0, 1], [80, 0]);
  const primaryOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accent bar draws left-to-right after primary settles
  const accentScale = interpolate(frame, [45, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Supporting line fades in at frame 45
  const supportOpacity = interpolate(frame, [45, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Exit overlay darkens in last 15 frames
  const exitDark = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [0, 0.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Logo bug
  const logoBugOpacity = interpolate(frame, [10, 25], [0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* Full-bleed screenshot */}
      <Img
        src={staticFile(screenshotPath)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* Cinematic dark overlay */}
      <AbsoluteFill
        style={{ backgroundColor: `rgba(5,5,5,${0.72 + exitDark})` }}
      />

      {/* Primary statement + accent bar + supporting line */}
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: "34%",
        }}
      >
        <h1
          style={{
            color: "white",
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1.1,
            margin: 0,
            fontFamily: "Inter, sans-serif",
            opacity: primaryOpacity,
            transform: `translateY(${primaryY}px)`,
          }}
        >
          {primaryStatement}
        </h1>

        {/* Accent bar */}
        <div
          style={{
            marginTop: 24,
            height: 4,
            width: accentBarWidth,
            backgroundColor: "#D4A574",
            transformOrigin: "left center",
            transform: `scaleX(${accentScale})`,
          }}
        />

        {/* Supporting line */}
        <p
          style={{
            color: "#D4A574",
            fontSize: 32,
            fontWeight: 500,
            marginTop: 20,
            fontFamily: "Inter, sans-serif",
            opacity: supportOpacity,
          }}
        >
          {supportingLine}
        </p>
      </div>

      {/* Logo bug */}
      <Img
        src={staticFile("logo.png")}
        style={{
          position: "absolute",
          right: LOGO_MARGIN,
          bottom: LOGO_MARGIN,
          width: LOGO_SIZE,
          height: LOGO_SIZE,
          objectFit: "contain",
          opacity: logoBugOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/components/cinematic/FullBleedScene.tsx
git commit -m "feat(video): add FullBleedScene cinematic component"
```

---

## Task 5: StatCounterScene Component

**Files:**

- Create: `packages/videos/src/components/cinematic/StatCounterScene.tsx`

`#1C2E47` background with three radial glows. Section heading in `#D4A574` slides up at frame 0. Three stat cards stagger in at 25-frame intervals; each card counter animates from 0 → target using `Easing.out(Easing.cubic)` over 45 frames. Logo bug present.

- [ ] **Step 1: Create the component**

```tsx
// packages/videos/src/components/cinematic/StatCounterScene.tsx
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

export interface StatItem {
  targetValue: number;
  unit?: string;
  label: string;
  detail: string;
  accent: string;
}

export interface StatCounterSceneProps {
  heading: string;
  stats: StatItem[];
}

const LOGO_SIZE = 48;
const LOGO_MARGIN = 40;
const STAT_STAGGER = 25;

export const StatCounterScene: React.FC<StatCounterSceneProps> = ({
  heading,
  stats,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Heading slides up
  const headingSpring = spring({ frame, fps, config: { damping: 20 } });
  const headingY = interpolate(headingSpring, [0, 1], [30, 0]);

  // Logo bug
  const logoBugOpacity = interpolate(frame, [10, 25], [0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ backgroundColor: "#1C2E47", fontFamily: "Inter, sans-serif" }}
    >
      {/* Radial glows behind each card */}
      {stats.map((stat, i) => (
        <div
          key={`glow-${i}`}
          style={{
            position: "absolute",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${stat.accent}2e 0%, transparent 70%)`,
            left: `${10 + i * 30}%`,
            top: "25%",
            pointerEvents: "none",
          }}
        />
      ))}

      {/* Section heading */}
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "#D4A574",
          fontSize: 44,
          fontWeight: 700,
          opacity: headingSpring,
          transform: `translateY(${headingY}px)`,
        }}
      >
        {heading}
      </div>

      {/* Stat cards */}
      <div
        style={{
          position: "absolute",
          top: 220,
          left: 80,
          right: 80,
          display: "flex",
          gap: 40,
          justifyContent: "center",
        }}
      >
        {stats.map((stat, i) => {
          const delay = i * STAT_STAGGER;

          const cardOpacity = interpolate(frame, [delay, delay + 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const count = interpolate(
            frame,
            [delay, delay + 45],
            [0, stat.targetValue],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            },
          );

          return (
            <div
              key={i}
              style={{
                flex: 1,
                maxWidth: 500,
                backgroundColor: "rgba(255,255,255,0.05)",
                borderLeft: `4px solid ${stat.accent}`,
                borderRadius: 12,
                padding: "48px 40px",
                opacity: cardOpacity,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    color: stat.accent,
                    fontSize: 72,
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  {Math.round(count)}
                </span>
                {stat.unit && (
                  <span
                    style={{
                      color: stat.accent,
                      fontSize: 30,
                      fontWeight: 600,
                    }}
                  >
                    {stat.unit}
                  </span>
                )}
              </div>
              <div
                style={{
                  color: "white",
                  fontSize: 22,
                  fontWeight: 700,
                  marginBottom: 12,
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 17,
                  lineHeight: 1.5,
                }}
              >
                {stat.detail}
              </div>
            </div>
          );
        })}
      </div>

      {/* Logo bug */}
      <Img
        src={staticFile("logo.png")}
        style={{
          position: "absolute",
          right: LOGO_MARGIN,
          bottom: LOGO_MARGIN,
          width: LOGO_SIZE,
          height: LOGO_SIZE,
          objectFit: "contain",
          opacity: logoBugOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/components/cinematic/StatCounterScene.tsx
git commit -m "feat(video): add StatCounterScene cinematic component"
```

---

## Task 6: CinematicCTA Component

**Files:**

- Create: `packages/videos/src/components/cinematic/CinematicCTA.tsx`

Composes `LetterboxReveal mode="outro"` (bars close, logo at centre, no tagline). CTA heading and URL appear after frame 30. URL has a sine-wave glow pulse. Tagline reprise fades in at frame 90. Final 30 frames fade to black.

- [ ] **Step 1: Create the component**

```tsx
// packages/videos/src/components/cinematic/CinematicCTA.tsx
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { LetterboxReveal } from "./LetterboxReveal";

export const CinematicCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // CTA content enters at frame 30 (bars have swept in by then)
  const ctaSpring = spring({
    frame: frame - 30,
    fps,
    config: { damping: 20, stiffness: 80 },
  });
  const ctaY = interpolate(ctaSpring, [0, 1], [30, 0]);
  const ctaOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // URL glow pulse: 60-frame sine cycle
  const glowIntensity = Math.sin(frame * (Math.PI / 30)) * 0.5 + 0.5;

  // Tagline reprise at frame 90
  const taglineOpacity = interpolate(frame, [90, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade to black in last 30 frames
  const fadeToBlack = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      {/* Letterbox bars, logo, flare — no tagline (handled below) */}
      <LetterboxReveal mode="outro" logoSrc="logo.png" />

      {/* CTA content: positioned below the centred logo */}
      <div
        style={{
          position: "absolute",
          top: 660,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <h1
          style={{
            color: "white",
            fontSize: 72,
            fontWeight: 700,
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
            margin: 0,
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
          }}
        >
          Start Your Free Trial
        </h1>

        <div
          style={{
            color: "#D4A574",
            fontSize: 36,
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            opacity: ctaOpacity,
            textShadow: `0 0 ${20 + glowIntensity * 20}px rgba(212,165,116,${0.4 + glowIntensity * 0.35})`,
          }}
        >
          restoreassist.app
        </div>

        <p
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: 28,
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
            margin: "10px 0 0 0",
            opacity: taglineOpacity,
          }}
        >
          One System. Fewer Gaps. More Confidence.
        </p>
      </div>

      {/* Fade to black */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(0,0,0,${fadeToBlack})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/components/cinematic/CinematicCTA.tsx
git commit -m "feat(video): add CinematicCTA cinematic component"
```

---

## Task 7: Barrel Export

**Files:**

- Create: `packages/videos/src/components/cinematic/index.ts`

- [ ] **Step 1: Create the barrel**

```ts
// packages/videos/src/components/cinematic/index.ts
export { LetterboxReveal } from "./LetterboxReveal";
export type { LetterboxRevealProps } from "./LetterboxReveal";

export { KineticTextScene } from "./KineticTextScene";
export type { KineticTextSceneProps, KineticBullet } from "./KineticTextScene";

export { FullBleedScene } from "./FullBleedScene";
export type { FullBleedSceneProps } from "./FullBleedScene";

export { StatCounterScene } from "./StatCounterScene";
export type { StatCounterSceneProps, StatItem } from "./StatCounterScene";

export { CinematicCTA } from "./CinematicCTA";
```

- [ ] **Step 2: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/components/cinematic/index.ts
git commit -m "feat(video): add cinematic component barrel export"
```

---

## Task 8: CinematicLandingV2 Composition

**Files:**

- Create: `packages/videos/src/compositions/CinematicLandingV2.tsx`

2700 frames (90s @ 30fps). 8 scenes wired per the scene map. Audio loaded gracefully (`tryAudio` helper). Background music at -18dB (volume 0.12) with 30-frame fade in/out.

Scene map:
| Scene | From → To | Component |
|---|---|---|
| 1 Letterbox Brand Reveal | 0–300 | `LetterboxReveal mode="intro"` |
| 2 System Overview | 300–660 | `KineticTextScene` |
| 3 Dashboard Full-Bleed | 660–990 | `FullBleedScene` |
| 4 Key Advantages | 990–1350 | `KineticTextScene` |
| 5 Australian Compliance | 1350–1680 | `FullBleedScene` |
| 6 AI Scope Generation | 1680–2010 | `FullBleedScene` |
| 7 Impact Stats | 2010–2400 | `StatCounterScene` |
| 8 Cinematic CTA Outro | 2400–2700 | `CinematicCTA` |

- [ ] **Step 1: Create the composition**

```tsx
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
  FullBleedScene,
  KineticTextScene,
  LetterboxReveal,
  StatCounterScene,
} from "../components/cinematic";

// Gracefully skip audio when files are not yet generated
const tryAudio = (path: string, volume = 1) => {
  try {
    return <Audio src={staticFile(path)} volume={volume} />;
  } catch {
    return null;
  }
};

export const CinematicLandingV2: React.FC = () => {
  const frame = useCurrentFrame();

  // Background music: fade in over 30f, fade out over last 30f of 2700
  const bgMusicVolume = interpolate(
    frame,
    [0, 30, 2670, 2700],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      {/* Background music bed — mixed at -18dB (volume 0.12) */}
      {tryAudio("audio/bg-music.mp3", bgMusicVolume)}

      {/* Scene 1: Letterbox Brand Reveal — 0–10s (0–300f) */}
      <Sequence from={0} durationInFrames={300}>
        <LetterboxReveal
          mode="intro"
          logoSrc="logo.png"
          tagline="One System. Fewer Gaps. More Confidence."
        />
        {tryAudio("audio/lp-intro.mp3")}
      </Sequence>

      {/* Scene 2: System Overview — 10–22s (300–660f) */}
      <Sequence from={300} durationInFrames={360}>
        <KineticTextScene
          label="What RestoreAssist Does"
          bullets={[
            {
              text: "One system for inspection reports, scope of works, and cost estimates",
              accentWords: ["one system"],
            },
            {
              text: "IICRC standards built in — evidence attached to every line item",
              accentWords: ["IICRC standards"],
            },
            {
              text: "Export directly to Xero, Ascora, ServiceM8, QuickBooks, and MYOB",
              accentWords: ["Export"],
            },
          ]}
        />
        {tryAudio("audio/lp-overview.mp3")}
      </Sequence>

      {/* Scene 3: Dashboard Full-Bleed — 22–33s (660–990f) */}
      <Sequence from={660} durationInFrames={330}>
        <FullBleedScene
          screenshotPath="screenshots/mock/dashboard-mock.png"
          primaryStatement="Your Command Centre"
          supportingLine="Every active job — at a glance"
        />
        {tryAudio("audio/lp-dashboard.mp3")}
      </Sequence>

      {/* Scene 4: Key Advantages — 33–45s (990–1350f) */}
      <Sequence from={990} durationInFrames={360}>
        <KineticTextScene
          label="The Advantages"
          backgroundVariant="navy"
          bullets={[
            {
              text: "Save over 2 hours per inspection — AI generates your scope instantly",
              accentWords: ["2 hours"],
            },
            {
              text: "Never miss a scope item — every item is evidence-linked and IICRC-cited",
              accentWords: ["Never miss"],
            },
            {
              text: "Fully compliant with building codes across all 8 Australian states",
              accentWords: ["all 8 Australian states"],
            },
          ]}
        />
        {tryAudio("audio/lp-advantages.mp3")}
      </Sequence>

      {/* Scene 5: Australian Compliance — 45–56s (1350–1680f) */}
      <Sequence from={1350} durationInFrames={330}>
        <FullBleedScene
          screenshotPath="screenshots/mock/compliance-mock.png"
          primaryStatement="Built for Australian Law"
          supportingLine="IICRC S500, S520 & S700 — state-specific triggers — court-ready evidence"
        />
        {tryAudio("audio/lp-compliance.mp3")}
      </Sequence>

      {/* Scene 6: AI Scope Generation — 56–67s (1680–2010f) */}
      <Sequence from={1680} durationInFrames={330}>
        <FullBleedScene
          screenshotPath="screenshots/mock/scope-mock.png"
          primaryStatement="Scope in 30 Seconds"
          supportingLine="What used to take two hours — now done before you leave the site"
        />
        {tryAudio("audio/lp-scope.mp3")}
      </Sequence>

      {/* Scene 7: Impact Stats — 67–80s (2010–2400f) */}
      <Sequence from={2010} durationInFrames={390}>
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
              detail:
                "State-specific building codes & regulatory triggers built in",
              accent: "#3b82f6",
            },
          ]}
        />
        {tryAudio("audio/lp-stats.mp3")}
      </Sequence>

      {/* Scene 8: Cinematic CTA Outro — 80–90s (2400–2700f) */}
      <Sequence from={2400} durationInFrames={300}>
        <CinematicCTA />
        {tryAudio("audio/lp-cta.mp3")}
      </Sequence>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/compositions/CinematicLandingV2.tsx
git commit -m "feat(video): add CinematicLandingV2 composition (90s, 8 scenes)"
```

---

## Task 9: Register in Root.tsx

**Files:**

- Modify: `packages/videos/src/Root.tsx`

- [ ] **Step 1: Add the import and composition**

Open `packages/videos/src/Root.tsx`. The file currently contains three `<Composition>` registrations. Add the import and a fourth registration:

```tsx
// packages/videos/src/Root.tsx
import React from "react";
import { Composition } from "remotion";
import { ProductExplainer } from "./compositions/ProductExplainer";
import { IndustryInsight } from "./compositions/IndustryInsight";
import { LandingPageOverview } from "./compositions/LandingPageOverview";
import { CinematicLandingV2 } from "./compositions/CinematicLandingV2";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ProductExplainer"
        component={ProductExplainer}
        durationInFrames={1800}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="IndustryInsight"
        component={IndustryInsight}
        durationInFrames={4500}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="LandingPageOverview"
        component={LandingPageOverview}
        durationInFrames={2700}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CinematicLandingV2"
        component={CinematicLandingV2}
        durationInFrames={2700}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: "RestoreAssist — One System. Fewer Gaps. More Confidence.",
          description:
            "AI-powered damage assessment for Australian restoration professionals.",
          version: "2.0",
        }}
      />
    </>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/videos/src/Root.tsx
git commit -m "feat(video): register CinematicLandingV2 in Remotion Root"
```

---

## Task 10: Mock Screenshot Assets

**Files:**

- Create: `packages/videos/public/screenshots/mock/` (directory + 3 PNG files)

The three `FullBleedScene` components reference mock screenshots. Reuse existing screenshots from `packages/videos/public/screenshots/` as stand-ins. Real final assets can be replaced before render without code changes.

- [ ] **Step 1: Create the mock directory and copy assets**

```bash
mkdir -p packages/videos/public/screenshots/mock

cp packages/videos/public/screenshots/dashboard-new-inspection.png \
   packages/videos/public/screenshots/mock/dashboard-mock.png

cp packages/videos/public/screenshots/scope-items-generated.png \
   packages/videos/public/screenshots/mock/compliance-mock.png

cp packages/videos/public/screenshots/integrations-export.png \
   packages/videos/public/screenshots/mock/scope-mock.png
```

- [ ] **Step 2: Verify**

```bash
ls packages/videos/public/screenshots/mock/
```

Expected: `compliance-mock.png  dashboard-mock.png  scope-mock.png`

- [ ] **Step 3: Commit**

```bash
git add packages/videos/public/screenshots/mock/
git commit -m "feat(video): add mock screenshot assets for CinematicLandingV2"
```

---

## Task 11: Voiceover Segments

**Files:**

- Modify: `packages/videos/src/scripts/generate-voiceover.ts`

Add `CINEMATIC_LANDING_V2_SEGMENTS` array with the 8 scene scripts. Output paths use `public/audio/lp-{scene}.mp3` so `staticFile("audio/lp-intro.mp3")` resolves correctly in Remotion.

- [ ] **Step 1: Read the current file**

Read `packages/videos/src/scripts/generate-voiceover.ts` to find the end of `INDUSTRY_INSIGHT_SEGMENTS` and the `generateAll()` function.

- [ ] **Step 2: Add the new segment array and update generateAll**

After the `INDUSTRY_INSIGHT_SEGMENTS` declaration (before `generateVoiceover`), add:

```ts
const CINEMATIC_LANDING_V2_SEGMENTS: VoiceoverSegment[] = [
  {
    id: "lp-intro",
    text: "RestoreAssist. The platform built for Australian restoration professionals who need every job documented, compliant, and paid — without the paperwork chaos.",
    outputPath: "public/audio/lp-intro.mp3",
  },
  {
    id: "lp-overview",
    text: "One system that handles your inspection report, scope of works, and cost estimate. With IICRC standards built in and evidence attached to every line item.",
    outputPath: "public/audio/lp-overview.mp3",
  },
  {
    id: "lp-dashboard",
    text: "Your command centre for every active job. See what needs attention, track drying progress, and push updates to insurers — all from one screen.",
    outputPath: "public/audio/lp-dashboard.mp3",
  },
  {
    id: "lp-advantages",
    text: "Save over two hours per inspection. Never miss a scope item. Export directly to Xero, Ascora, ServiceM8, QuickBooks, and MYOB. And stay fully compliant across all eight Australian states.",
    outputPath: "public/audio/lp-advantages.mp3",
  },
  {
    id: "lp-compliance",
    text: "Built for Australian law. IICRC S500, S520, and S700 standards are automatically applied. State-specific regulatory triggers fire based on job location. Every inspection builds a court-ready evidence register.",
    outputPath: "public/audio/lp-compliance.mp3",
  },
  {
    id: "lp-scope",
    text: "AI generates your complete scope of works in seconds. Every item is IICRC-cited, evidence-linked, and ready for the insurer. What used to take two hours now takes thirty seconds.",
    outputPath: "public/audio/lp-scope.mp3",
  },
  {
    id: "lp-stats",
    text: "Over two hours saved per inspection. One hundred percent IICRC-compliant reports. Coverage across all eight Australian states. RestoreAssist is how professional restoration businesses operate.",
    outputPath: "public/audio/lp-stats.mp3",
  },
  {
    id: "lp-cta",
    text: "Start your free trial today. No credit card required. Three full reports, completely free. Visit restoreassist.app and get your first job documented in under ten minutes.",
    outputPath: "public/audio/lp-cta.mp3",
  },
];
```

Then update `generateAll()` to include the new segments:

```ts
async function generateAll(): Promise<void> {
  const allSegments = [
    ...PRODUCT_EXPLAINER_SEGMENTS,
    ...INDUSTRY_INSIGHT_SEGMENTS,
    ...CINEMATIC_LANDING_V2_SEGMENTS,
  ];

  console.log(`\nGenerating ${allSegments.length} voiceover segments...\n`);

  for (const segment of allSegments) {
    await generateVoiceover(segment);
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\nAll voiceover segments generated successfully.");
}
```

- [ ] **Step 3: Ensure the output directory exists at runtime**

The `generateVoiceover` function already calls `fs.mkdirSync(dir, { recursive: true })` before writing, so `public/audio/` will be created automatically. No additional changes needed.

- [ ] **Step 4: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/videos/src/scripts/generate-voiceover.ts
git commit -m "feat(video): add CinematicLandingV2 voiceover segment scripts"
```

---

## Task 12: Render Pipeline Update

**Files:**

- Modify: `packages/videos/src/scripts/render-videos.ts`

Add `CinematicLandingV2` render call and a `renderStill` call to export frame 60 as the poster JPEG.

- [ ] **Step 1: Add the import for renderStill**

Open `packages/videos/src/scripts/render-videos.ts`. Find the `import` block at the top and add `renderStill` to the `@remotion/renderer` import:

Current:

```ts
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
```

Replace with:

```ts
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import path from "path";
```

- [ ] **Step 2: Add the CinematicLandingV2 render + poster export to main()**

In `main()`, after the three existing `renderVideo()` calls, add:

```ts
// CinematicLandingV2 — outputs to public/videos/landing-page-overview-v2.mp4
await renderVideo("CinematicLandingV2", "landing-page-overview-v2.mp4");

// Export frame 60 as poster JPEG
console.log("\nExporting poster frame...");
const bundleForPoster = await bundle({
  entryPoint: path.resolve(__dirname, "../index.ts"),
  webpackOverride: (config) => config,
});
const posterComposition = await selectComposition({
  serveUrl: bundleForPoster,
  id: "CinematicLandingV2",
});
const posterPath = path.resolve(
  __dirname,
  "../../../../public/videos",
  "landing-page-overview-v2-poster.jpg",
);
await renderStill({
  composition: posterComposition,
  serveUrl: bundleForPoster,
  output: posterPath,
  frame: 60,
  imageFormat: "jpeg",
  jpegQuality: 90,
});
console.log(`Poster exported: ${posterPath}`);
```

- [ ] **Step 3: Type-check**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/videos/src/scripts/render-videos.ts
git commit -m "feat(video): add CinematicLandingV2 to render pipeline + poster frame export"
```

---

## Task 13: Landing Page Wire-Up

**Files:**

- Modify: `app/page.tsx`

Single change: update the `<video>` element's `src` and `poster` attributes. The video section is at approximately lines 435–436.

- [ ] **Step 1: Find the current src attribute**

Search `app/page.tsx` for `landing-page-overview.mp4`:

```bash
grep -n "landing-page-overview" app/page.tsx
```

Expected output: a line like `435:        src="/videos/landing-page-overview.mp4"`

- [ ] **Step 2: Update src and poster**

Find the `<video` element in `app/page.tsx`. It will look like:

```tsx
<video
  ref={videoRef}
  src="/videos/landing-page-overview.mp4"
  ...
```

Change `src` to the new file and add `poster`:

```tsx
<video
  ref={videoRef}
  src="/videos/landing-page-overview-v2.mp4"
  poster="/videos/landing-page-overview-v2-poster.jpg"
  ...
```

Note: if a `poster` attribute already exists, replace its value. If it doesn't exist, add it on the line after `src`.

- [ ] **Step 3: Type-check the main app**

```bash
npx tsc --noEmit
```

Expected: no new errors introduced by this change.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(video): wire landing page to CinematicLandingV2 output"
```

---

## Task 14: Full Verification

**Files:** none (verification only)

- [ ] **Step 1: Full type check — Remotion package**

```bash
cd packages/videos && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Full type check — main app**

```bash
cd ../.. && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Launch Remotion Studio to preview the composition**

```bash
cd packages/videos && npm run preview
```

Open the Remotion Studio URL shown in the terminal (usually `http://localhost:3000`).

- [ ] **Step 4: Verify in Remotion Studio**

Navigate to `CinematicLandingV2` in the composition picker. Scrub through the timeline and confirm:

| Frame range | Expected                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| 0–20        | Black bars sweep in from top/bottom ✓                                       |
| 20–50       | Logo fades in at centre, radial flare visible ✓                             |
| 50–145      | Words of tagline appear one by one ✓                                        |
| 210+        | Bars sweep back out, logo migrates to bottom-right bug ✓                    |
| 300         | KineticTextScene: dark gradient, label slides in from left ✓                |
| 320+        | Bullets stagger in, accent underlines draw ✓                                |
| 660         | FullBleedScene: screenshot fills frame, dark overlay, primary text enters ✓ |
| 2010        | StatCounterScene: navy bg, radial glows, counters animate 0→value ✓         |
| 2400        | CinematicCTA: bars sweep in, logo returns, CTA text appears ✓               |
| 2670+       | Fade to black ✓                                                             |

**What NOT to see:**

- TypeScript errors in console
- White/blank scenes
- Logo showing as broken image (if so: confirm `packages/videos/public/logo.png` exists)
- Missing screenshot warnings (if so: confirm `packages/videos/public/screenshots/mock/*.png` exist)

- [ ] **Step 5: Confirm voiceover script is ready to run**

```bash
cd packages/videos && npx ts-node src/scripts/generate-voiceover.ts 2>&1 | head -5
```

If `ELEVENLABS_API_KEY` is not set: expected output includes `[SKIP] No ELEVENLABS_API_KEY set — writing placeholder for lp-intro`. This confirms the script runs without crashing.

If `ELEVENLABS_API_KEY` is set: real MP3s will be generated into `packages/videos/public/audio/`.

---

## Render & Deploy Checklist (Post-Verification)

Once the Studio preview looks correct:

1. **Generate voiceover**: Set `ELEVENLABS_API_KEY` and run `cd packages/videos && npm run voiceover`
2. **Place background music**: Copy a royalty-free cinematic instrumental to `packages/videos/public/audio/bg-music.mp3`
3. **Replace mock screenshots** (optional): Replace `packages/videos/public/screenshots/mock/*.png` with real anonymised product screenshots
4. **Render**: Run `cd packages/videos && npm run render` — produces `public/videos/landing-page-overview-v2.mp4` and `public/videos/landing-page-overview-v2-poster.jpg`
5. **Deploy**: The rendered files in `public/videos/` are committed and served as static assets via Next.js
