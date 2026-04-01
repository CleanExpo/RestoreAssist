import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  spring,
  useVideoConfig,
  interpolate,
} from "remotion";

interface Stat {
  value: string;
  unit?: string;
  label: string;
  detail: string;
  accent?: string;
}

interface StatCardProps {
  title: string;
  stats: Stat[];
}

export const StatCard: React.FC<StatCardProps> = ({ title, stats }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = spring({ frame, fps, config: { damping: 20 } });
  const titleY = interpolate(frame, [0, 20], [30, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1C2E47",
        padding: "70px 100px",
        fontFamily: "Inter, sans-serif",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      <h2
        style={{
          color: "#D4A574",
          fontSize: 44,
          fontWeight: 600,
          marginBottom: 52,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {title}
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(stats.length, 3)}, 1fr)`,
          gap: 32,
        }}
      >
        {stats.map((stat, i) => {
          const delay = 15 + i * 25;
          const cardOpacity = spring({
            frame: frame - delay,
            fps,
            config: { damping: 16, stiffness: 80 },
          });
          const cardY = interpolate(frame - delay, [0, 20], [40, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const accent = stat.accent || "#3b82f6";

          return (
            <div
              key={i}
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: `1px solid rgba(255,255,255,0.1)`,
                borderLeft: `4px solid ${accent}`,
                borderRadius: 16,
                padding: "36px 32px",
                opacity: cardOpacity,
                transform: `translateY(${cardY}px)`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 4,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    color: accent,
                    fontSize: 60,
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  {stat.value}
                </span>
                {stat.unit && (
                  <span
                    style={{
                      color: accent,
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
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 17,
                  lineHeight: 1.4,
                }}
              >
                {stat.detail}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
