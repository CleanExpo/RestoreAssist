// packages/videos/src/compositions/CinematicLandingV2.tsx
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  CinematicCTA,
  FullBleedScene,
  KineticTextScene,
  LetterboxReveal,
  StatCounterScene,
} from "../components/cinematic";

// Gracefully skip audio when files are not yet generated
const tryAudio = (path: string, volume = 1) => {
  try {
    return <Audio src={staticFile(path)} volume={volume} />;
  } catch {
    return null;
  }
};

export const CinematicLandingV2: React.FC = () => {
  const frame = useCurrentFrame();

  // Background music: fade in over 30f, fade out over last 30f of 2730
  const bgMusicVolume = interpolate(
    frame,
    [0, 30, 2700, 2730],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      {/* Google Fonts: Inter */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Background music bed — mixed at -18dB (volume 0.12) */}
      {tryAudio("audio/bg-music.mp3", bgMusicVolume)}

      {/* Scene 1: Letterbox Brand Reveal — 0–10s (0–300f) */}
      <Sequence from={0} durationInFrames={300}>
        <LetterboxReveal
          mode="intro"
          logoSrc="logo.png"
          tagline="One System. Fewer Gaps. More Confidence."
        />
        {tryAudio("audio/lp-intro.mp3")}
      </Sequence>

      {/* Scene 2: System Overview — 10–22s (300–660f) */}
      <Sequence from={300} durationInFrames={360}>
        <KineticTextScene
          label="What RestoreAssist Does"
          bullets={[
            {
              text: "One system for inspection reports, scope of works, and cost estimates",
              accentWords: ["one system"],
            },
            {
              text: "IICRC standards built in — evidence attached to every line item",
              accentWords: ["IICRC standards"],
            },
            {
              text: "Export directly to Xero, Ascora, ServiceM8, QuickBooks, and MYOB",
              accentWords: ["Export"],
            },
          ]}
        />
        {tryAudio("audio/lp-overview.mp3")}
      </Sequence>

      {/* Scene 3: Dashboard Full-Bleed — 22–33s (660–990f) */}
      <Sequence from={660} durationInFrames={330}>
        <FullBleedScene
          screenshotPath="screenshots/mock/dashboard-mock.png"
          primaryStatement="Your Command Centre"
          supportingLine="Every active job — at a glance"
        />
        {tryAudio("audio/lp-dashboard.mp3")}
      </Sequence>

      {/* Scene 4: Key Advantages — 33–45s (990–1350f) */}
      <Sequence from={990} durationInFrames={360}>
        <KineticTextScene
          label="The Advantages"
          backgroundVariant="navy"
          bullets={[
            {
              text: "Save over 2 hours per inspection — AI generates your scope instantly",
              accentWords: ["2 hours"],
            },
            {
              text: "Never miss a scope item — every item is evidence-linked and IICRC-cited",
              accentWords: ["Never miss"],
            },
            {
              text: "Fully compliant with building codes across all 8 Australian states",
              accentWords: ["all 8 Australian states"],
            },
          ]}
        />
        {tryAudio("audio/lp-advantages.mp3")}
      </Sequence>

      {/* Scene 5: Australian Compliance — 45–57s (1350–1710f) — extended 30f for audio fit */}
      <Sequence from={1350} durationInFrames={360}>
        <FullBleedScene
          screenshotPath="screenshots/mock/compliance-mock.png"
          primaryStatement="Built for Australian Law"
          supportingLine="IICRC S500, S520 & S700 — state-specific triggers — court-ready evidence"
        />
        {tryAudio("audio/lp-compliance.mp3")}
      </Sequence>

      {/* Scene 6: AI Scope Generation — 57–68s (1710–2040f) */}
      <Sequence from={1710} durationInFrames={330}>
        <FullBleedScene
          screenshotPath="screenshots/mock/scope-mock.png"
          primaryStatement="Scope in 30 Seconds"
          supportingLine="What used to take two hours — now done before you leave the site"
        />
        {tryAudio("audio/lp-scope.mp3")}
      </Sequence>

      {/* Scene 7: Impact Stats — 68–81s (2040–2430f) */}
      <Sequence from={2040} durationInFrames={390}>
        <StatCounterScene
          heading="Why Restoration Teams Choose RestoreAssist"
          stats={[
            {
              targetValue: 2,
              unit: "+ hrs",
              label: "Saved per inspection",
              detail: "AI scope generation replaces manual line-item entry",
              accent: "#06b6d4",
            },
            {
              targetValue: 100,
              unit: "%",
              label: "IICRC compliant reports",
              detail: "S500, S520 & S700 citations on every scope item",
              accent: "#D4A574",
            },
            {
              targetValue: 8,
              label: "Australian states covered",
              detail:
                "State-specific building codes & regulatory triggers built in",
              accent: "#3b82f6",
            },
          ]}
        />
        {tryAudio("audio/lp-stats.mp3")}
      </Sequence>

      {/* Scene 8: Cinematic CTA Outro — 81–91s (2430–2730f) */}
      <Sequence from={2430} durationInFrames={300}>
        <CinematicCTA />
        {tryAudio("audio/lp-cta.mp3")}
      </Sequence>
    </AbsoluteFill>
  );
};
