// packages/videos/src/components/cinematic/FullBleedScene.tsx
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

export interface FullBleedSceneProps {
  screenshotPath: string;
  primaryStatement: string;
  supportingLine: string;
  accentBarWidth?: number;
}

const LOGO_SIZE = 48;
const LOGO_MARGIN = 40;

export const FullBleedScene: React.FC<FullBleedSceneProps> = ({
  screenshotPath,
  primaryStatement,
  supportingLine,
  accentBarWidth = 480,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const kenBurnsScale = interpolate(frame, [0, durationInFrames], [1.04, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const sceneEnterOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Primary statement: enter from y:80 starting frame 15
  const primarySpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 20, stiffness: 80 },
  });
  const primaryY = interpolate(primarySpring, [0, 1], [80, 0]);
  const primaryOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accent bar draws left-to-right after primary settles
  const accentScale = interpolate(frame, [45, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Supporting line fades in at frame 45
  const supportOpacity = interpolate(frame, [45, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Exit overlay darkens in last 15 frames
  const exitDark = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [0, 0.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Logo bug
  const logoBugOpacity = interpolate(frame, [10, 25], [0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* Full-bleed screenshot */}
      <Img
        src={staticFile(screenshotPath)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${kenBurnsScale})`,
          transformOrigin: "center center",
        }}
      />

      {/* Cinematic dark overlay */}
      <AbsoluteFill
        style={{ backgroundColor: `rgba(5,5,5,${0.72 + exitDark})` }}
      />

      {/* Primary statement + accent bar + supporting line */}
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: "34%",
        }}
      >
        <h1
          style={{
            color: "white",
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1.1,
            margin: 0,
            fontFamily: "Inter, sans-serif",
            opacity: primaryOpacity,
            transform: `translateY(${primaryY}px)`,
          }}
        >
          {primaryStatement}
        </h1>

        {/* Accent bar */}
        <div
          style={{
            marginTop: 24,
            height: 4,
            width: accentBarWidth,
            backgroundColor: "#D4A574",
            transformOrigin: "left center",
            transform: `scaleX(${accentScale})`,
          }}
        />

        {/* Supporting line */}
        <p
          style={{
            color: "#D4A574",
            fontSize: 32,
            fontWeight: 500,
            marginTop: 20,
            fontFamily: "Inter, sans-serif",
            opacity: supportOpacity,
          }}
        >
          {supportingLine}
        </p>
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

      {/* Scene enter fade from black */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(0,0,0,${1 - sceneEnterOpacity})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
