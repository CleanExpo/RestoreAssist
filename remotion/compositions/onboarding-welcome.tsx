import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

/**
 * OnboardingWelcome — the brand "welcome" video shown to a NEW client at the top
 * of the setup wizard (/setup). Self-contained: only core Remotion primitives +
 * the RestoreAssist brand palette (navy #1C2E47, warm #8A6B4E, light #D4A574),
 * Inter, and /logo.png — no external composition deps.
 *
 * 1920×1080 @ 30fps, 1080 frames (36s). Render via `npm run render:tutorials`
 * then upload to Cloudinary / public/videos/remotion/onboarding-welcome.mp4
 * (wired in components/setup/video-registry.ts as `remotion-onboarding-welcome`).
 */

const NAVY = '#1C2E47';
const WARM = '#8A6B4E';
const LIGHT = '#D4A574';
const INK = '#0A0A0A';

// Fade a scene in/out across its [start..end] window.
function sceneOpacity(frame: number, start: number, end: number) {
  return interpolate(
    frame,
    [start, start + 25, end - 25, end],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
}

const Step: React.FC<{
  frame: number;
  start: number;
  end: number;
  index: number;
  heading: string;
  detail: string;
}> = ({frame, start, end, index, heading, detail}) => (
  <div style={{position: 'absolute', inset: 0, opacity: sceneOpacity(frame, start, end)}}>
    <AbsoluteFill
      style={{
        backgroundColor: NAVY,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 24,
          backgroundColor: WARM,
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          fontWeight: 800,
          marginBottom: 40,
        }}
      >
        {index}
      </div>
      <h2 style={{fontSize: 56, fontWeight: 800, color: '#ffffff', margin: 0, textAlign: 'center'}}>
        {heading}
      </h2>
      <p style={{fontSize: 26, color: LIGHT, marginTop: 20, textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
        {detail}
      </p>
    </AbsoluteFill>
  </div>
);

export const OnboardingWelcome: React.FC<{title?: string}> = ({
  title = 'Welcome to RestoreAssist',
}) => {
  const frame = useCurrentFrame();

  const introOpacity = sceneOpacity(frame, 0, 175);
  const introScale = interpolate(frame, [0, 25], [0.92, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outroOpacity = sceneOpacity(frame, 870, 1080);

  return (
    <AbsoluteFill style={{fontFamily: 'Inter, sans-serif', backgroundColor: INK}}>
      {/* Intro */}
      <div style={{position: 'absolute', inset: 0, opacity: introOpacity}}>
        <AbsoluteFill
          style={{
            backgroundColor: NAVY,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              backgroundColor: WARM,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 36,
              transform: `scale(${introScale})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" style={{width: 52, height: 'auto', objectFit: 'contain'}} alt="" />
          </div>
          <h1
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#ffffff',
              textAlign: 'center',
              margin: 0,
              lineHeight: 1.1,
              transform: `scale(${introScale})`,
            }}
          >
            {title}
          </h1>
          <p style={{fontSize: 26, color: LIGHT, marginTop: 24, textAlign: 'center', maxWidth: 820}}>
            Three quick steps and you&apos;re ready to run your first job.
          </p>
        </AbsoluteFill>
      </div>

      {/* Steps — mirror the required setup-wizard cards */}
      <Step
        frame={frame}
        start={180}
        end={400}
        index={1}
        heading="Your business details"
        detail="Enter your ABN — we auto-fill your legal name, trading status and state from the ABR."
      />
      <Step
        frame={frame}
        start={410}
        end={630}
        index={2}
        heading="Your brand"
        detail="Add your logo and colours so every report and client portal looks unmistakably yours."
      />
      <Step
        frame={frame}
        start={640}
        end={860}
        index={3}
        heading="Your pricing"
        detail="Confirm your labour rates and administration fee — your quotes and invoices build themselves."
      />

      {/* Outro */}
      <div style={{position: 'absolute', inset: 0, opacity: outroOpacity}}>
        <AbsoluteFill
          style={{
            backgroundColor: NAVY,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <h2 style={{fontSize: 64, fontWeight: 800, color: '#ffffff', margin: 0, textAlign: 'center'}}>
            You&apos;re all set.
          </h2>
          <p style={{fontSize: 28, color: LIGHT, marginTop: 20, textAlign: 'center', maxWidth: 820}}>
            Complete the steps below to activate your workspace.
          </p>
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};
