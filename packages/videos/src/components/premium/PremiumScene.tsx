// packages/videos/src/components/premium/PremiumScene.tsx
// Core 3-layer scene: workflow bg → gradient overlay → floating card + text.
// Platinum aesthetic: light silvery base (#E5E4E2), dark card, dark text, blue accents.
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { WorkflowBackground } from "./WorkflowBackground";

export interface PremiumSceneProps {
  screenshotPath: string;
  label: string;
  headline: string;
  body: string;
  /** Optional per-scene audio — omit when using a single root-level audio track */
  audioSrc?: string;
  /** Offset the background cycle so each scene shows different content */
  bgOffset?: number;
  /** "split" = card left + text right (default); "center" = centered CTA */
  variant?: "split" | "center";
  ctaUrl?: string;
}

// ─── Platinum colour palette ──────────────────────────────────────────────────
const BG = "#E5E4E2"; // platinum silver
const BG_RGB = "229,228,226"; // same as rgba()
const HEADLINE = "#0F0F0F"; // near-black
const BODY = "rgba(15,15,15,0.68)";
const ACCENT = "#1D4ED8"; // blue-700 — pops on light bg
const ACCENT_LIGHT = "#2563EB"; // blue-600
const DIVIDER = "rgba(0,0,0,0.12)";

export const PremiumScene: React.FC<PremiumSceneProps> = ({
  screenshotPath,
  label,
  headline,
  body,
  audioSrc,
  bgOffset = 0,
  variant = "split",
  ctaUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ─── Scene enter / exit fades ───────────────────────────────────────────
  const enterOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 18, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ─── Card spring — tilted perspective entrance that flattens (Apple-style) ──
  const cardSpring = spring({
    frame,
    fps,
    config: { damping: 32, stiffness: 52 },
  });
  const cardY = interpolate(cardSpring, [0, 1], [44, 0]);
  const cardScale = interpolate(cardSpring, [0, 1], [0.91, 1]);
  const tiltX = interpolate(cardSpring, [0, 1], [7, 0]);
  const tiltY = interpolate(cardSpring, [0, 1], [-4, 0]);

  // ─── Text stagger ────────────────────────────────────────────────────────
  const labelOpacity = interpolate(frame, [10, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headlineY = interpolate(frame, [18, 46], [28, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headlineOpacity = interpolate(frame, [18, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bodyOpacity = interpolate(frame, [32, 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const urlOpacity = interpolate(frame, [44, 64], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accent line width animation
  const accentLineWidth = interpolate(frame, [6, 24], [0, 28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // URL pill glow pulse
  const glowPulse = 0.5 + 0.5 * Math.sin((frame * Math.PI) / 55);

  return (
    <AbsoluteFill
      style={{
        background: BG,
        fontFamily: "Inter, -apple-system, sans-serif",
      }}
    >
      {/* ── Layer 1: Workflow background — dark app UI at 30% on platinum ── */}
      <WorkflowBackground opacity={0.3} startOffset={bgOffset} />

      {/* ── Layer 2: Directional gradient — protects text readability ─────── */}
      <AbsoluteFill
        style={{
          background:
            variant === "split"
              ? `linear-gradient(105deg, rgba(${BG_RGB},0.94) 0%, rgba(${BG_RGB},0.70) 48%, rgba(${BG_RGB},0.18) 100%)`
              : `radial-gradient(ellipse 110% 90% at 50% 50%, rgba(${BG_RGB},0.82) 0%, rgba(${BG_RGB},0.92) 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* ── Layer 3: Foreground content ──────────────────────────────────── */}
      {variant === "split" ? (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            padding: "56px 96px",
            gap: 72,
            opacity: enterOpacity,
          }}
        >
          {/* LEFT: Floating product screenshot card — dark on platinum */}
          <div
            style={{
              flex: "0 0 54%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                borderRadius: 18,
                overflow: "hidden",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.08), 0 40px 100px rgba(0,0,0,0.28), 0 8px 32px rgba(0,0,0,0.18)",
                transform: `perspective(1400px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${cardScale}) translateY(${cardY}px)`,
                transformOrigin: "center center",
                width: "100%",
                maxWidth: 880,
                position: "relative",
              }}
            >
              <Img
                src={staticFile(screenshotPath)}
                style={{ width: "100%", display: "block" }}
              />
              {/* Subtle gloss on card top edge */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "30%",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>

          {/* RIGHT: Label + Headline + Body */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 22,
            }}
          >
            {/* Label with animated accent bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                opacity: labelOpacity,
              }}
            >
              <div
                style={{
                  width: accentLineWidth,
                  height: 2,
                  background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_LIGHT})`,
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase" as const,
                  color: ACCENT,
                }}
              >
                {label}
              </span>
            </div>

            {/* Headline */}
            <h2
              style={{
                fontSize: 50,
                fontWeight: 700,
                color: HEADLINE,
                lineHeight: 1.1,
                letterSpacing: "-0.025em",
                margin: 0,
                whiteSpace: "pre-line",
                transform: `translateY(${headlineY}px)`,
                opacity: headlineOpacity,
              }}
            >
              {headline}
            </h2>

            {/* Divider */}
            <div
              style={{
                width: 40,
                height: 1,
                background: DIVIDER,
                opacity: bodyOpacity,
              }}
            />

            {/* Body */}
            <p
              style={{
                fontSize: 18,
                fontWeight: 400,
                color: BODY,
                lineHeight: 1.75,
                margin: 0,
                opacity: bodyOpacity,
                letterSpacing: "0.008em",
              }}
            >
              {body}
            </p>
          </div>
        </AbsoluteFill>
      ) : (
        /* ── CENTERED CTA variant ─────────────────────────────────────────── */
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
            padding: "60px 120px",
            opacity: enterOpacity,
          }}
        >
          {/* Logo mark */}
          <Img
            src={staticFile("logo.png")}
            style={{
              width: 72,
              height: 72,
              objectFit: "contain",
              opacity: labelOpacity,
            }}
          />

          {/* Label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              opacity: labelOpacity,
            }}
          >
            <div
              style={{
                width: accentLineWidth,
                height: 2,
                background: `linear-gradient(90deg, transparent, ${ACCENT_LIGHT}, transparent)`,
                borderRadius: 2,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase" as const,
                color: ACCENT,
              }}
            >
              {label}
            </span>
            <div
              style={{
                width: accentLineWidth,
                height: 2,
                background: `linear-gradient(90deg, ${ACCENT_LIGHT}, transparent)`,
                borderRadius: 2,
                flexShrink: 0,
              }}
            />
          </div>

          {/* Headline */}
          <h2
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: HEADLINE,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              margin: 0,
              textAlign: "center",
              whiteSpace: "pre-line",
              transform: `translateY(${headlineY}px)`,
              opacity: headlineOpacity,
            }}
          >
            {headline}
          </h2>

          {/* Body */}
          <p
            style={{
              fontSize: 20,
              fontWeight: 400,
              color: BODY,
              lineHeight: 1.65,
              margin: 0,
              textAlign: "center",
              maxWidth: 680,
              opacity: bodyOpacity,
            }}
          >
            {body}
          </p>

          {/* CTA URL pill */}
          {ctaUrl && (
            <div
              style={{
                marginTop: 8,
                padding: "14px 36px",
                borderRadius: 100,
                background: `rgba(29,78,216,0.08)`,
                border: `1px solid rgba(29,78,216,0.30)`,
                boxShadow: `0 0 ${20 + 10 * glowPulse}px rgba(29,78,216,0.18)`,
                opacity: urlOpacity,
              }}
            >
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: ACCENT,
                  letterSpacing: "0.01em",
                }}
              >
                {ctaUrl}
              </span>
            </div>
          )}
        </AbsoluteFill>
      )}

      {/* ── Audio (only if a per-scene src is provided) ───────────────────── */}
      {audioSrc && <Audio src={staticFile(audioSrc)} volume={1} />}

      {/* ── Enter fade (platinum → transparent) ──────────────────────────── */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(${BG_RGB},${1 - enterOpacity})`,
          pointerEvents: "none",
        }}
      />
      {/* ── Exit fade (transparent → platinum) ───────────────────────────── */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(${BG_RGB},${exitOpacity})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
