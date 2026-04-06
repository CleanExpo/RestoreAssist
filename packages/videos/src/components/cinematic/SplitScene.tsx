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
  // LEFT — Before
  beforeStat: string; // e.g. "2h 47m" or "6" (pure numeric = count-up)
  beforeStatContext: string; // e.g. "Average documentation time per job"
  painPoints: string[]; // exactly 3 items
  // RIGHT — After
  screenshotPath: string; // relative to Remotion public dir, e.g. "screenshots/real/dashboard.png"
  afterLabel: string; // e.g. "Dashboard — Command Centre"
  afterCallout: string; // e.g. "Every job. One screen."
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

  // Scene fade-in 0–20f, fade-out last 20f
  const enterOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Left panel: spring from -40px → 0
  const leftSpring = spring({
    frame,
    fps,
    config: { damping: 26, stiffness: 70 },
  });
  const leftX = interpolate(leftSpring, [0, 1], [-40, 0]);

  // Right panel: spring from +40px → 0, 5-frame delay
  const rightSpring = spring({
    frame: Math.max(0, frame - 5),
    fps,
    config: { damping: 26, stiffness: 70 },
  });
  const rightX = interpolate(rightSpring, [0, 1], [40, 0]);

  // "BEFORE" label: fades in 0–15
  const beforeLabelOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Hero stat animation 20–60
  const isNumeric = isNumericStat(beforeStat);
  const statAnimProgress = interpolate(frame, [20, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  // Numeric: count-up; Non-numeric: scale+fade
  const statScale = isNumeric
    ? 1
    : interpolate(statAnimProgress, [0, 1], [0.85, 1]);
  const statOpacity = isNumeric ? 1 : statAnimProgress;
  const numericTarget = isNumeric ? parseInt(beforeStat, 10) : 0;
  const numericCount = isNumeric
    ? Math.round(
        interpolate(frame, [20, 60], [0, numericTarget], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }),
      )
    : 0;

  // Stat context fades in at 65–80
  const contextOpacity = interpolate(frame, [65, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Separator scaleX 0→1 frames 70–85
  const sepScale = interpolate(frame, [70, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Divider scaleY 0→1 frames 10–30
  const dividerScale = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // VS label opacity at frame 35–45
  const vsOpacity = interpolate(frame, [35, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "With RestoreAssist" chip at frame 25–40
  const chipOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Callout at frame 80–95
  const calloutOpacity = interpolate(frame, [80, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Ken Burns: scale 1.04 → 1.0 over scene
  const kenBurnsScale = interpolate(frame, [0, durationInFrames], [1.04, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ display: "flex", fontFamily: "Inter, sans-serif", fontSize: 27 }}
    >
      {/* LEFT PANEL — Before */}
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
        {/* Subtle red radial vignette */}
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

        {/* "BEFORE" label */}
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

        {/* Separator line */}
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

      {/* DIVIDER — 1px gold gradient with "vs" label */}
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

      {/* RIGHT PANEL — After (real screenshot + overlay) */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          transform: `translateX(${rightX}px)`,
        }}
      >
        {/* Screenshot with Ken Burns pan */}
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

        {/* Very light overlay — preserves screenshot clarity */}
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(135deg, rgba(5,5,5,0.15) 0%, rgba(5,5,5,0.0) 60%)",
            pointerEvents: "none",
          }}
        />

        {/* "With RestoreAssist" chip — top right */}
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

        {/* Callout annotation — dot + line + tag */}
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
          <div
            style={{
              width: 30,
              height: 1,
              background: "rgba(212,165,116,0.6)",
            }}
          />
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

      {/* Scene enter overlay (black → transparent) */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(0,0,0,${1 - enterOpacity})`,
          pointerEvents: "none",
        }}
      />
      {/* Scene exit overlay (transparent → black) */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(0,0,0,${exitOpacity})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
