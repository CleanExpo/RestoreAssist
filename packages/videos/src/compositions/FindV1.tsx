// packages/videos/src/compositions/FindV1.tsx
// VIDEO: FIND — 60s top-of-funnel awareness video. YouTube / LinkedIn cold traffic.
// Target audience: Restoration company owners who don't know RestoreAssist exists.
// Goal: Grab attention, state the problem, tease the solution, drive to restoreassist.app.
// Audio: single continuous ElevenLabs VO (find-full.mp3) — one voice, one performance.
import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { PremiumScene } from "../components/premium";

// ─── Scene timing (total = 1800f = 60s @ 30fps) ──────────────────────────────
// Matched to ~58s VO at 90% speed + 2s buffer.
// Visual cuts are independent of audio — narration flows continuously.
const S1 = { from: 0, dur: 210 }; //  7.0s — Hook
const S2 = { from: 210, dur: 270 }; //  9.0s — Problem
const S3 = { from: 480, dur: 300 }; // 10.0s — Solution intro
const S4 = { from: 780, dur: 300 }; // 10.0s — AI speed
const S5 = { from: 1080, dur: 300 }; // 10.0s — Proof
const S6 = { from: 1380, dur: 420 }; // 14.0s — CTA
const TOTAL = S6.from + S6.dur; // 1800f = 60s ✓

// bgOffset per scene so each scene's background shows different workflow steps
const BG_OFFSETS = [0, 120, 240, 360, 480, 600];

export const FindV1: React.FC = () => {
  const frame = useCurrentFrame();

  // Background music — barely audible ambient bed
  const bgMusicVolume = interpolate(
    frame,
    [0, 30, TOTAL - 30, TOTAL],
    [0, 0.07, 0.07, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Single VO track — one continuous performance across all scenes
  const voVolume = interpolate(
    frame,
    [0, 15, TOTAL - 30, TOTAL],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      {/* Google Fonts: Inter — matches RestoreAssist brand */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Background music bed */}
      <Audio src={staticFile("audio/bg-music.mp3")} volume={bgMusicVolume} />

      {/* Single continuous voiceover — one performance, no restarts between scenes */}
      <Audio src={staticFile("audio/find-full.mp3")} volume={voVolume} />

      {/* ── Scene 1: Hook ────────────────────────────────────────────────── */}
      <Sequence from={S1.from} durationInFrames={S1.dur} name="S1: Hook">
        <PremiumScene
          screenshotPath="screenshots/real/dashboard.png"
          label="Water Damage Admin"
          headline={"Water damage.\n3 hours of\npaperwork. Per job."}
          body="Every restoration job buried in manual scopes, paper moisture readings, and spreadsheets your team types up from memory."
          bgOffset={BG_OFFSETS[0]}
        />
      </Sequence>

      {/* ── Scene 2: The Problem ─────────────────────────────────────────── */}
      <Sequence from={S2.from} durationInFrames={S2.dur} name="S2: Problem">
        <PremiumScene
          screenshotPath="screenshots/real/scope.png"
          label="The Problem"
          headline={"Manual scopes.\nDisputed claims.\nLost receipts."}
          body="Insurers reject under-documented claims. Your team wastes hours on paperwork that should take minutes. There is a better way."
          bgOffset={BG_OFFSETS[1]}
        />
      </Sequence>

      {/* ── Scene 3: Solution Intro ──────────────────────────────────────── */}
      <Sequence
        from={S3.from}
        durationInFrames={S3.dur}
        name="S3: Solution Intro"
      >
        <PremiumScene
          screenshotPath="screenshots/real/compliance.png"
          label="RestoreAssist"
          headline={"One platform.\nEverything\nconnected."}
          body="Inspection to invoice — captured on site, reported instantly, compliant every time. No manual entry. No data gaps."
          bgOffset={BG_OFFSETS[2]}
        />
      </Sequence>

      {/* ── Scene 4: AI Speed ────────────────────────────────────────────── */}
      <Sequence from={S4.from} durationInFrames={S4.dur} name="S4: AI Speed">
        <PremiumScene
          screenshotPath="screenshots/real/scope.png"
          label="AI-Powered Scope"
          headline={"30-second\nIICRC scope.\nAI-generated."}
          body="Enter your inspection readings. AI generates your complete scope of works with every standard cited. S500:2025 on every line item."
          bgOffset={BG_OFFSETS[3]}
        />
      </Sequence>

      {/* ── Scene 5: Proof ───────────────────────────────────────────────── */}
      <Sequence from={S5.from} durationInFrames={S5.dur} name="S5: Proof">
        <PremiumScene
          screenshotPath="screenshots/real/report.png"
          label="Australian Compliance"
          headline={"S500:2025\ncompliant.\n8 states."}
          body="State-specific compliance triggers built in. Insurers approve faster when every standard is cited on every scope."
          bgOffset={BG_OFFSETS[4]}
        />
      </Sequence>

      {/* ── Scene 6: CTA ─────────────────────────────────────────────────── */}
      <Sequence from={S6.from} durationInFrames={S6.dur} name="S6: CTA">
        <PremiumScene
          screenshotPath="screenshots/real/invoice.png"
          label="Start Free"
          headline={"Three complete\njobs. Free.\nNo card required."}
          body="Join restoration professionals across Australia."
          bgOffset={BG_OFFSETS[5]}
          variant="center"
          ctaUrl="restoreassist.app"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
