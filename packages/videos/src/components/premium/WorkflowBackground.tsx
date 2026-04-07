// packages/videos/src/components/premium/WorkflowBackground.tsx
// Cycles through all 6 RestoreAssist screenshots with slow cross-fades,
// simulating a user navigating through the full workflow at 25% opacity.
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

const SCREENSHOTS = [
  "screenshots/real/dashboard.png",
  "screenshots/real/scope.png",
  "screenshots/real/compliance.png",
  "screenshots/real/report.png",
  "screenshots/real/moisture.png",
  "screenshots/real/invoice.png",
];

// Each screenshot holds for 6s (180f), crossfade over last 1.5s (45f)
const HOLD = 180;
const FADE = 45;
const TOTAL_CYCLE = HOLD * SCREENSHOTS.length;

// Slow Ken Burns per-image: subtle scale drift
const KEN_BURNS_SCALES = [
  { from: 1.06, to: 1.0 },
  { from: 1.0, to: 1.05 },
  { from: 1.05, to: 1.01 },
  { from: 1.0, to: 1.06 },
  { from: 1.06, to: 1.02 },
  { from: 1.02, to: 1.06 },
];

interface WorkflowBackgroundProps {
  opacity?: number;
  startOffset?: number; // frame offset for background sync variation
}

export const WorkflowBackground: React.FC<WorkflowBackgroundProps> = ({
  opacity = 0.25,
  startOffset = 0,
}) => {
  const frame = useCurrentFrame();
  const loopFrame = (frame + startOffset) % TOTAL_CYCLE;
  const currentIdx = Math.floor(loopFrame / HOLD);
  const nextIdx = (currentIdx + 1) % SCREENSHOTS.length;
  const frameInSlot = loopFrame % HOLD;

  const crossfadeOpacity = interpolate(
    frameInSlot,
    [HOLD - FADE, HOLD],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Ken Burns for current image
  const kbCurrent = KEN_BURNS_SCALES[currentIdx % KEN_BURNS_SCALES.length];
  const kbCurrentScale = interpolate(
    frameInSlot,
    [0, HOLD],
    [kbCurrent.from, kbCurrent.to],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Ken Burns for next image
  const kbNext = KEN_BURNS_SCALES[nextIdx % KEN_BURNS_SCALES.length];
  const kbNextScale = interpolate(
    frameInSlot,
    [HOLD - FADE, HOLD],
    [kbNext.from, kbNext.to * 0.98],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Current screenshot */}
      <Img
        src={staticFile(SCREENSHOTS[currentIdx])}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 30%",
          transform: `scale(${kbCurrentScale})`,
          transformOrigin: "center center",
        }}
      />
      {/* Next screenshot crossfading in */}
      <Img
        src={staticFile(SCREENSHOTS[nextIdx])}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 30%",
          transform: `scale(${kbNextScale})`,
          transformOrigin: "center center",
          opacity: crossfadeOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
