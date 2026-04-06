// packages/videos/src/components/cinematic/CinematicCTA.tsx
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { LetterboxReveal } from "./LetterboxReveal";

export const CinematicCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // CTA content enters at frame 30 (bars have swept in by then)
  const ctaSpring = spring({
    frame: frame - 30,
    fps,
    config: { damping: 20, stiffness: 80 },
  });
  const ctaY = interpolate(ctaSpring, [0, 1], [30, 0]);
  const ctaOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // URL glow pulse: 60-frame sine cycle
  const glowIntensity = Math.sin(frame * (Math.PI / 30)) * 0.5 + 0.5;

  // Tagline reprise at frame 90
  const taglineOpacity = interpolate(frame, [90, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade to black in last 30 frames
  const fadeToBlack = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      {/* Letterbox bars, logo, flare — no tagline (handled below) */}
      <LetterboxReveal mode="outro" logoSrc="logo.png" />

      {/* CTA content: positioned below the centred logo */}
      <div
        style={{
          position: "absolute",
          top: 640,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          gap: 16,
        }}
      >
        <h1
          style={{
            color: "white",
            fontSize: 72,
            fontWeight: 700,
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
            margin: 0,
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
          }}
        >
          Start Your Free Trial
        </h1>

        <div
          style={{
            color: "#D4A574",
            fontSize: 36,
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            opacity: ctaOpacity,
            textShadow: `0 0 ${20 + glowIntensity * 20}px rgba(212,165,116,${0.4 + glowIntensity * 0.35})`,
          }}
        >
          restoreassist.app
        </div>

        <p
          style={{
            color: "rgba(255,255,255,0.50)",
            fontSize: 22,
            fontFamily: "Inter, sans-serif",
            margin: 0,
            opacity: ctaOpacity,
          }}
        >
          No credit card required · Three full reports free
        </p>

        <p
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: 28,
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
            margin: 0,
            opacity: taglineOpacity,
          }}
        >
          One System. Fewer Gaps. More Confidence.
        </p>
      </div>

      {/* Fade to black */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(0,0,0,${fadeToBlack})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
