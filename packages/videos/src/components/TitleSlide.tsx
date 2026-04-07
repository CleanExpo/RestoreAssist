import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";

interface TitleSlideProps {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
}

export const TitleSlide: React.FC<TitleSlideProps> = ({
  title,
  subtitle,
  showLogo = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = spring({ frame, fps, config: { damping: 20 } });
  const subtitleOpacity = spring({
    frame: frame - 15,
    fps,
    config: { damping: 20 },
  });
  const titleY = interpolate(frame, [0, 30], [40, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1C2E47",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {showLogo && (
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 16,
            background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 40,
            opacity: titleOpacity,
          }}
        >
          <span style={{ color: "white", fontSize: 32, fontWeight: 700 }}>
            RA
          </span>
        </div>
      )}
      <h1
        style={{
          color: "white",
          fontSize: 64,
          fontWeight: 700,
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          maxWidth: 1200,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            color: "#D4A574",
            fontSize: 32,
            fontWeight: 400,
            textAlign: "center",
            opacity: subtitleOpacity,
            marginTop: 24,
            maxWidth: 900,
          }}
        >
          {subtitle}
        </p>
      )}
    </AbsoluteFill>
  );
};
