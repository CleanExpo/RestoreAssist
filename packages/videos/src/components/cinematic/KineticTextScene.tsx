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
