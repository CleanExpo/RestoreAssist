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
const STAT_STAGGER = 40;

export const StatCounterScene: React.FC<StatCounterSceneProps> = ({
  heading,
  stats,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const sceneEnterOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const sceneExitOpacity = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

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
          fontSize: 52,
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

          const cardSpring = spring({
            frame: frame - delay,
            fps,
            config: { damping: 22, stiffness: 100 },
          });
          const cardY = interpolate(cardSpring, [0, 1], [40, 0]);

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
                transform: `translateY(${cardY}px)`,
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
                    fontSize: 88,
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
                  },
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
