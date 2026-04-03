import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  spring,
  useVideoConfig,
} from "remotion";

interface CTASlideProps {
  primaryLabel: string;
  primaryUrl: string;
  secondaryLabel?: string;
  secondaryUrl?: string;
  slogan: string;
}

export const CTASlide: React.FC<CTASlideProps> = ({
  primaryLabel,
  primaryUrl,
  secondaryLabel,
  secondaryUrl,
  slogan,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({ frame, fps, config: { damping: 20 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1C2E47",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Inter, sans-serif",
      }}
    >
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
          opacity,
        }}
      >
        <span style={{ color: "white", fontSize: 32, fontWeight: 700 }}>
          RA
        </span>
      </div>
      <h2
        style={{
          color: "white",
          fontSize: 56,
          fontWeight: 700,
          opacity,
          marginBottom: 32,
        }}
      >
        {slogan}
      </h2>
      <div style={{ display: "flex", gap: 24, opacity }}>
        <div
          style={{
            padding: "16px 48px",
            backgroundColor: "#8A6B4E",
            borderRadius: 12,
            color: "white",
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          {primaryLabel}
        </div>
        {secondaryLabel && (
          <div
            style={{
              padding: "16px 48px",
              border: "2px solid #8A6B4E",
              borderRadius: 12,
              color: "white",
              fontSize: 28,
              fontWeight: 600,
            }}
          >
            {secondaryLabel}
          </div>
        )}
      </div>
      <p
        style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: 18,
          marginTop: 40,
          opacity,
        }}
      >
        {primaryUrl}
      </p>
    </AbsoluteFill>
  );
};
