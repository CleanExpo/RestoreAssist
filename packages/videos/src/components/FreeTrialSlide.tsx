import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  spring,
  useVideoConfig,
  interpolate,
} from "remotion";

export const FreeTrialSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = spring({ frame, fps, config: { damping: 18 } });
  const headerY = interpolate(frame, [0, 25], [50, 0], {
    extrapolateRight: "clamp",
  });

  const card1Opacity = spring({
    frame: frame - 20,
    fps,
    config: { damping: 15, stiffness: 80 },
  });
  const card2Opacity = spring({
    frame: frame - 35,
    fps,
    config: { damping: 15, stiffness: 80 },
  });
  const card3Opacity = spring({
    frame: frame - 50,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  const card1Y = interpolate(frame - 20, [0, 20], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const card2Y = interpolate(frame - 35, [0, 20], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const card3Y = interpolate(frame - 50, [0, 20], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaOpacity = spring({
    frame: frame - 75,
    fps,
    config: { damping: 18 },
  });

  const logoOpacity = spring({ frame, fps, config: { damping: 20 } });

  const cards = [
    {
      icon: "📋",
      number: "3",
      label: "Free Reports",
      detail: "Full reports. No limitations.",
      opacity: card1Opacity,
      y: card1Y,
    },
    {
      icon: "💳",
      number: "0",
      label: "Credit Card Required",
      detail: "Sign up with just your email.",
      opacity: card2Opacity,
      y: card2Y,
    },
    {
      icon: "📅",
      number: "30",
      label: "Day Free Trial",
      detail: "Cancel anytime, no questions asked.",
      opacity: card3Opacity,
      y: card3Y,
    },
  ];

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(160deg, #0f1e33 0%, #1C2E47 50%, #0f1e33 100%)",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Inter, sans-serif",
        flexDirection: "column",
        padding: "60px 80px",
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 14,
          background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
          opacity: logoOpacity,
          boxShadow: "0 0 40px rgba(59,130,246,0.4)",
        }}
      >
        <span style={{ color: "white", fontSize: 28, fontWeight: 700 }}>
          RA
        </span>
      </div>

      {/* Main heading */}
      <h1
        style={{
          color: "white",
          fontSize: 68,
          fontWeight: 800,
          textAlign: "center",
          opacity: headerOpacity,
          transform: `translateY(${headerY}px)`,
          margin: 0,
          lineHeight: 1.1,
          letterSpacing: "-1px",
        }}
      >
        Start Your Free Trial Today
      </h1>

      <p
        style={{
          color: "#94a3b8",
          fontSize: 28,
          textAlign: "center",
          marginTop: 16,
          marginBottom: 56,
          opacity: headerOpacity,
        }}
      >
        Everything you need to win more insurance claims — free to start.
      </p>

      {/* Feature cards */}
      <div
        style={{
          display: "flex",
          gap: 32,
          width: "100%",
          maxWidth: 1400,
          justifyContent: "center",
        }}
      >
        {cards.map((card, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              backgroundColor: "rgba(255,255,255,0.06)",
              border: `2px solid ${i === 0 ? "rgba(212,165,116,0.5)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 20,
              padding: "40px 32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              opacity: card.opacity,
              transform: `translateY(${card.y}px)`,
              boxShadow: i === 0 ? "0 0 30px rgba(212,165,116,0.15)" : "none",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>{card.icon}</div>
            <div
              style={{
                color: i === 0 ? "#D4A574" : "#3b82f6",
                fontSize: 64,
                fontWeight: 800,
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              {card.number}
            </div>
            <div
              style={{
                color: "white",
                fontSize: 24,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: 18,
                lineHeight: 1.4,
              }}
            >
              {card.detail}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        style={{
          marginTop: 56,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: ctaOpacity,
          gap: 16,
        }}
      >
        <div
          style={{
            padding: "20px 64px",
            background: "linear-gradient(90deg, #3b82f6, #06b6d4)",
            borderRadius: 14,
            color: "white",
            fontSize: 30,
            fontWeight: 700,
            boxShadow: "0 8px 30px rgba(59,130,246,0.4)",
            letterSpacing: "0.5px",
          }}
        >
          Get Started Free — restoreassist.app
        </div>
        <p
          style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: 18,
            margin: 0,
          }}
        >
          No credit card · No commitment · Cancel anytime
        </p>
      </div>
    </AbsoluteFill>
  );
};
