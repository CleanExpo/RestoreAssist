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
  KineticTextScene,
  LetterboxReveal,
  SplitScene,
  StatCounterScene,
} from "../components/cinematic";

const tryAudio = (path: string, volume = 1) => {
  return <Audio src={staticFile(path)} volume={volume} />;
};

export const CinematicLandingV2: React.FC = () => {
  const frame = useCurrentFrame();

  // Background music: fade in over 30f, fade out over last 30f of 4410
  const bgMusicVolume = interpolate(
    frame,
    [0, 30, 4380, 4410],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      {/* Google Fonts: Inter (all weights) */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>

      {/* Background music bed */}
      {tryAudio("audio/bg-music.mp3", bgMusicVolume)}

      {/* Scene 1: Letterbox Brand Reveal — 0f, 390f (13s) */}
      <Sequence from={0} durationInFrames={390}>
        <LetterboxReveal
          mode="intro"
          logoSrc="logo.png"
          tagline="Built for Australian Restoration Professionals"
        />
        {tryAudio("audio/lp-intro.mp3")}
      </Sequence>

      {/* Scene 2: The Industry Problem — 390f, 420f (14s) */}
      <Sequence from={390} durationInFrames={420}>
        <KineticTextScene
          label="The Industry Problem"
          bullets={[
            {
              text: "Restoration teams across Australia spend more time on paperwork than restoration",
              accentWords: ["more time on paperwork"],
            },
            {
              text: "Insurance claims get disputed because scopes lack IICRC citations and evidence",
              accentWords: ["disputed"],
            },
            {
              text: "Critical data lives across spreadsheets, phones, and email threads — never in one place",
              accentWords: ["never in one place"],
            },
          ]}
          backgroundVariant="dark"
          backgroundSrc="screenshots/real/dashboard.png"
        />
        {tryAudio("audio/lp-problem.mp3")}
      </Sequence>

      {/* Scene 3: Dashboard — 810f, 450f (15s) */}
      <Sequence from={810} durationInFrames={450}>
        <SplitScene
          beforeStat="6"
          beforeStatContext="Separate tools to manage one job"
          painPoints={[
            "Jobs tracked across spreadsheets, email threads, and paper dockets",
            "No single view of what's active, overdue, or waiting on insurer",
            "Updates manually communicated — nothing is automatic",
          ]}
          screenshotPath="screenshots/real/dashboard.png"
          afterLabel="Dashboard — Command Centre"
          afterCallout="Every job. One screen."
        />
        {tryAudio("audio/lp-dashboard.mp3")}
      </Sequence>

      {/* Scene 4: AI Scope Generation — 1260f, 480f (16s) */}
      <Sequence from={1260} durationInFrames={480}>
        <SplitScene
          beforeStat="2h 47m"
          beforeStatContext="Average scope writing time per water damage job"
          painPoints={[
            "Scope written line-by-line from memory or handwritten notes",
            "No IICRC citations included — insurers push back on approval",
            "Quantities estimated by eye, not calculated from measurements",
          ]}
          screenshotPath="screenshots/real/scope.png"
          afterLabel="AI Scope Generation"
          afterCallout="Full scope in 30 seconds"
        />
        {tryAudio("audio/lp-scope.mp3")}
      </Sequence>

      {/* Scene 5: IICRC Compliance — 1740f, 450f (15s) */}
      <Sequence from={1740} durationInFrames={450}>
        <SplitScene
          beforeStat="0"
          beforeStatContext="IICRC citations on a typical scope of works"
          painPoints={[
            "Compliance checked manually against printed standards documents",
            "State-specific triggers missed — building code breaches go unnoticed",
            "Disputed claims due to insufficient evidence of standard adherence",
          ]}
          screenshotPath="screenshots/real/compliance.png"
          afterLabel="IICRC Compliance Engine"
          afterCallout="S500 · S520 · S700 cited"
        />
        {tryAudio("audio/lp-compliance.mp3")}
      </Sequence>

      {/* Scene 6: Inspection Report — 2190f, 450f (15s) */}
      <Sequence from={2190} durationInFrames={450}>
        <SplitScene
          beforeStat="3"
          beforeStatContext="Different phones photos are spread across"
          painPoints={[
            "Evidence captured across multiple devices with no central record",
            "Moisture readings noted on paper, typed up later — errors introduced",
            "Court-ready documentation assembled after the fact, not captured on site",
          ]}
          screenshotPath="screenshots/real/report.png"
          afterLabel="Inspection Report"
          afterCallout="Court-ready evidence, captured on site"
        />
        {tryAudio("audio/lp-report.mp3")}
      </Sequence>

      {/* Scene 7: Moisture Mapping — 2640f, 450f (15s) */}
      <Sequence from={2640} durationInFrames={450}>
        <SplitScene
          beforeStat="0"
          beforeStatContext="Digital records of drying progress on most jobs"
          painPoints={[
            "Floor plans sketched by hand on paper or in basic drawing apps",
            "Moisture readings mapped manually — no visual overlay",
            "Drying progress tracked in separate spreadsheets, not linked to the plan",
          ]}
          screenshotPath="screenshots/real/moisture.png"
          afterLabel="Moisture Mapping"
          afterCallout="Readings plotted. Progress tracked."
        />
        {tryAudio("audio/lp-moisture.mp3")}
      </Sequence>

      {/* Scene 8: Invoice & Export — 3090f, 390f (13s) */}
      <Sequence from={3090} durationInFrames={390}>
        <SplitScene
          beforeStat="3×"
          beforeStatContext="Data re-keyed to create one invoice"
          painPoints={[
            "Scope items manually re-entered into accounting software",
            "Line items transcribed from report to Xero or MYOB by hand",
            "Hours lost weekly to data re-entry that should never happen",
          ]}
          screenshotPath="screenshots/real/invoice.png"
          afterLabel="Invoice & Export"
          afterCallout="One click to Xero, Ascora, MYOB"
        />
        {tryAudio("audio/lp-invoice.mp3")}
      </Sequence>

      {/* Scene 9: Impact Stats — 3480f, 510f (17s) */}
      <Sequence from={3480} durationInFrames={510}>
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

      {/* Scene 10: Cinematic CTA — 3990f, 420f (14s) */}
      <Sequence from={3990} durationInFrames={420}>
        <CinematicCTA />
        {tryAudio("audio/lp-cta.mp3")}
      </Sequence>
    </AbsoluteFill>
  );
};
