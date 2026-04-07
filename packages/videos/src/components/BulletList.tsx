import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  spring,
  useVideoConfig,
  interpolate,
} from "remotion";

interface BulletListProps {
  title: string;
  bullets: string[];
  startFrame?: number;
  framesPerBullet?: number;
}

export const BulletList: React.FC<BulletListProps> = ({
  title,
  bullets,
  startFrame = 0,
  framesPerBullet = 45,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 20 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1C2E47",
        padding: "80px 120px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <h2
        style={{
          color: "#D4A574",
          fontSize: 48,
          fontWeight: 600,
          marginBottom: 48,
          opacity: titleOpacity,
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {bullets.map((bullet, i) => {
          const bulletDelay = startFrame + 20 + i * framesPerBullet;
          const bulletOpacity = spring({
            frame: frame - bulletDelay,
            fps,
            config: { damping: 15, stiffness: 80 },
          });
          const bulletX = interpolate(frame - bulletDelay, [0, 20], [60, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 20,
                opacity: bulletOpacity,
                transform: `translateX(${bulletX}px)`,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: "#8A6B4E",
                  marginTop: 12,
                  flexShrink: 0,
                }}
              />
              <p
                style={{
                  color: "white",
                  fontSize: 28,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {bullet}
              </p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
