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
  /** Optional product screenshot shown blurred/dimmed on the right half */
  backgroundSrc?: string;
}

const LOGO_SIZE = 48;
const LOGO_MARGIN = 40;
const LABEL_REVEAL_FRAMES = 40;
const DIVIDER_DELAY = 28;
// 80 frames ≈ 2.7s between bullets — cinematic pacing
const BULLET_STAGGER = 80;

export const KineticTextScene: React.FC<KineticTextSceneProps> = ({
  label,
  bullets,
  backgroundVariant = "dark",
  backgroundSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Scene fade-in over 20f, fade-out over last 20f
  const sceneEnterOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sceneExitOpacity = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Dot grid fades in with the scene
  const dotGridOpacity = interpolate(frame, [0, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const background =
    backgroundVariant === "navy"
      ? "linear-gradient(145deg, #0a1828 0%, #1C2E47 55%, #0d1e31 100%)"
      : "linear-gradient(145deg, #050505 0%, #0d1a30 55%, #1C2E47 100%)";

  // Label slides in from left — softer spring
  const labelSpring = spring({
    frame,
    fps,
    config: { damping: 24, stiffness: 70 },
  });
  const labelX = interpolate(labelSpring, [0, 1], [-100, 0]);
  const labelOpacity = interpolate(frame, [0, LABEL_REVEAL_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Decorative divider line expands from left after label
  const dividerScale = interpolate(
    frame,
    [DIVIDER_DELAY, DIVIDER_DELAY + 35],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Logo bug
  const logoBugOpacity = interpolate(frame, [15, 35], [0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle radial glow that breathes
  const glowPulse = 0.7 + 0.3 * Math.sin(frame * (Math.PI / 60));

  return (
    <AbsoluteFill
      style={{
        background,
        fontFamily: "Inter, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Animated dot grid background — subtle depth layer */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle, rgba(212,165,116,0.12) 1.5px, transparent 1.5px)`,
          backgroundSize: "64px 64px",
          opacity: dotGridOpacity * 0.9,
        }}
      />

      {/* Soft radial glow — centre-left anchor */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 900px 600px at 30% 55%, rgba(212,165,116,0.08) 0%, transparent 70%)`,
          opacity: glowPulse,
        }}
      />

      {/* Optional product screenshot — right half, blurred and dimmed */}
      {backgroundSrc && (
        <>
          <Img
            src={staticFile(backgroundSrc)}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: "55%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "left top",
              filter: "blur(3px) brightness(0.35)",
              opacity: interpolate(frame, [0, 40], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
          {/* Fade gradient — blends screenshot into the text area */}
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: "70%",
              height: "100%",
              background:
                "linear-gradient(90deg, rgba(5,5,5,1) 0%, rgba(5,5,5,0.85) 28%, rgba(5,5,5,0.1) 100%)",
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* Left accent bar — brand colour gradient */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          background:
            "linear-gradient(180deg, #D4A574 0%, #8A6B4E 60%, transparent 100%)",
          opacity: sceneEnterOpacity,
        }}
      />

      {/* Section label */}
      <div
        style={{
          position: "absolute",
          top: 108,
          left: 120,
          color: "#D4A574",
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: "0.35em",
          textTransform: "uppercase" as const,
          transform: `translateX(${labelX}px)`,
          opacity: labelOpacity,
        }}
      >
        {label}
      </div>

      {/* Animated horizontal divider */}
      <div
        style={{
          position: "absolute",
          top: 148,
          left: 120,
          height: 2,
          width: 300,
          background:
            "linear-gradient(90deg, #D4A574 0%, rgba(138,107,78,0.5) 70%, transparent 100%)",
          transformOrigin: "left center",
          transform: `scaleX(${dividerScale})`,
        }}
      />

      {/* Bullet list */}
      <div
        style={{
          position: "absolute",
          top: 195,
          left: 120,
          right: 120,
          display: "flex",
          flexDirection: "column" as const,
          gap: 60,
        }}
      >
        {bullets.map((bullet, i) => {
          const delay = LABEL_REVEAL_FRAMES + i * BULLET_STAGGER;

          // Softer spring for more elegant entrance
          const bulletSpring = spring({
            frame: Math.max(0, frame - delay),
            fps,
            config: { damping: 26, stiffness: 65 },
          });
          const bulletY = interpolate(bulletSpring, [0, 1], [60, 0]);
          const bulletOpacity = interpolate(
            frame,
            [delay, delay + 22],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          // Number badge scale spring
          const badgeSpring = spring({
            frame: Math.max(0, frame - delay - 4),
            fps,
            config: { damping: 18, stiffness: 180 },
          });
          const badgeScale = interpolate(badgeSpring, [0, 1], [0.5, 1]);

          // Accent underline draws 22f after bullet enters
          const underlineDelay = delay + 22;
          const underlineScale = interpolate(
            frame,
            [underlineDelay, underlineDelay + 28],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          const hasAccent = bullet.accentWords && bullet.accentWords.length > 0;
          const num = String(i + 1).padStart(2, "0");

          return (
            <div
              key={i}
              style={{
                transform: `translateY(${bulletY}px)`,
                opacity: bulletOpacity,
                display: "flex",
                alignItems: "flex-start",
                gap: 28,
              }}
            >
              {/* Animated number badge */}
              <div
                style={{
                  flexShrink: 0,
                  width: 62,
                  height: 62,
                  borderRadius: 14,
                  background: `rgba(212,165,116,${0.1 + 0.08 * badgeSpring})`,
                  border: `1.5px solid rgba(212,165,116,${0.35 + 0.45 * badgeSpring})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#D4A574",
                  fontSize: 19,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  marginTop: 4,
                  transform: `scale(${badgeScale})`,
                  boxShadow:
                    badgeSpring > 0.8
                      ? `0 0 ${10 + 6 * Math.sin((frame * Math.PI) / 40)}px rgba(212,165,116,0.25)`
                      : "none",
                }}
              >
                {num}
              </div>

              {/* Text + underline */}
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    color: "white",
                    fontSize: 46,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    margin: 0,
                  }}
                >
                  {bullet.text}
                </p>
                {hasAccent && (
                  <div
                    style={{
                      marginTop: 14,
                      height: 3,
                      width: 380,
                      background:
                        "linear-gradient(90deg, #D4A574, rgba(138,107,78,0.4))",
                      boxShadow:
                        underlineScale === 1
                          ? `0 0 ${10 + 6 * Math.sin((frame * Math.PI) / 45)}px rgba(212,165,116,0.65)`
                          : "none",
                      transformOrigin: "left center",
                      transform: `scaleX(${underlineScale})`,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Corner decoration — bottom right geometric accent */}
      <div
        style={{
          position: "absolute",
          right: 100,
          bottom: 100,
          width: 80,
          height: 80,
          borderRight: "2px solid rgba(212,165,116,0.3)",
          borderBottom: "2px solid rgba(212,165,116,0.3)",
          opacity: sceneEnterOpacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 80,
          width: 50,
          height: 50,
          borderLeft: "2px solid rgba(212,165,116,0.2)",
          borderTop: "2px solid rgba(212,165,116,0.2)",
          opacity: sceneEnterOpacity,
        }}
      />

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

      {/* Scene enter/exit fade overlays */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(0,0,0,${1 - sceneEnterOpacity})`,
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(0,0,0,${sceneExitOpacity})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
