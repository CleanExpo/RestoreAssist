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

export interface LetterboxRevealProps {
  mode: "intro" | "outro";
  logoSrc: string;
  tagline?: string;
}

const BAR_HEIGHT = 135;

export const LetterboxReveal: React.FC<LetterboxRevealProps> = ({
  mode,
  logoSrc,
  tagline = "",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bars sweep in from edges over ~20 frames
  const sweepIn = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 120 },
  });

  // Intro mode: bars reverse out at frame 210
  const sweepOut =
    mode === "intro"
      ? spring({
          frame: frame - 210,
          fps,
          config: { damping: 22, stiffness: 120 },
        })
      : 0;

  const topBarY =
    interpolate(sweepIn, [0, 1], [-BAR_HEIGHT, 0]) +
    interpolate(sweepOut, [0, 1], [0, -BAR_HEIGHT]);

  const bottomBarY =
    interpolate(sweepIn, [0, 1], [BAR_HEIGHT, 0]) +
    interpolate(sweepOut, [0, 1], [0, BAR_HEIGHT]);

  // Logo appearance
  const logoOpacity = spring({ frame, fps, config: { damping: 20 } });

  // Intro: logo transitions to bottom-right bug at frame 210
  const logoBugify =
    mode === "intro"
      ? spring({
          frame: frame - 210,
          fps,
          config: { damping: 20, stiffness: 80 },
        })
      : 0;

  const logoSize = interpolate(logoBugify, [0, 1], [160, 48]);
  const logoLeft = interpolate(
    logoBugify,
    [0, 1],
    [(1920 - 160) / 2, 1920 - 40 - 48],
  );
  const logoTop = interpolate(
    logoBugify,
    [0, 1],
    [(1080 - 160) / 2, 1080 - 40 - 48],
  );
  // logoOpacity is fully saturated (~1.0) by frame 210, so using it as the
  // from-value in the bugify interpolation is stable at current timing.
  const saturatedLogoOpacity = Math.min(logoOpacity, 1);
  const logoFinalOpacity = interpolate(
    logoBugify,
    [0, 1],
    [saturatedLogoOpacity, 0.45],
  );

  // Tagline fades out before bars sweep back (intro only)
  const taglineFade =
    mode === "intro"
      ? interpolate(frame, [195, 210], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const words = tagline.split(" ").filter(Boolean);

  return (
    <AbsoluteFill style={{ backgroundColor: "#050505" }}>
      {/* Radial flare behind logo */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(212,165,116,0.35) 0%, transparent 60%)",
          opacity: logoOpacity,
        }}
      />

      {/* Logo */}
      <Img
        src={staticFile(logoSrc)}
        style={{
          position: "absolute",
          left: logoLeft,
          top: logoTop,
          width: logoSize,
          height: logoSize,
          objectFit: "contain",
          opacity: logoFinalOpacity,
        }}
      />

      {/* Tagline: word by word */}
      {mode === "intro" && words.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "62%",
            left: 0,
            right: 0,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            justifyContent: "center",
            padding: "0 120px",
            opacity: taglineFade,
          }}
        >
          {words.map((word, i) => {
            const wordOpacity = interpolate(
              frame,
              [i * 12, i * 12 + 10],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            return (
              <span
                key={i}
                style={{
                  color: "white",
                  fontSize: 36,
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  opacity: wordOpacity,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      )}

      {/* Letterbox bars */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: BAR_HEIGHT,
          backgroundColor: "#000",
          transform: `translateY(${topBarY}px)`,
          zIndex: 10,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: BAR_HEIGHT,
          backgroundColor: "#000",
          transform: `translateY(${bottomBarY}px)`,
          zIndex: 10,
        }}
      />
    </AbsoluteFill>
  );
};
