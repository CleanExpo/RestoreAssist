import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  spring,
  useVideoConfig,
  Img,
  staticFile,
} from "remotion";

interface ScreenshotSlideProps {
  screenshotPath: string;
  caption: string;
  overlay?: string;
}

export const ScreenshotSlide: React.FC<ScreenshotSlideProps> = ({
  screenshotPath,
  caption,
  overlay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({ frame, fps, config: { damping: 20 } });
  const scale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 60 },
    from: 1.05,
    to: 1,
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
      <div
        style={{
          width: "85%",
          maxWidth: 1600,
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
            border: "2px solid rgba(138, 107, 78, 0.3)",
          }}
        >
          <Img src={staticFile(screenshotPath)} style={{ width: "100%" }} />
        </div>
        {overlay && (
          <div
            style={{
              position: "absolute",
              bottom: 60,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "rgba(28, 46, 71, 0.9)",
              padding: "16px 40px",
              borderRadius: 12,
              border: "1px solid rgba(212, 165, 116, 0.4)",
            }}
          >
            <p
              style={{
                color: "#D4A574",
                fontSize: 24,
                fontWeight: 600,
                margin: 0,
              }}
            >
              {overlay}
            </p>
          </div>
        )}
      </div>
      <p
        style={{
          color: "rgba(255,255,255,0.7)",
          fontSize: 22,
          marginTop: 32,
          opacity,
        }}
      >
        {caption}
      </p>
    </AbsoluteFill>
  );
};
