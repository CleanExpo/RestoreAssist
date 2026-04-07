// packages/videos/src/compositions/AttractV1.tsx
// VIDEO 1: ATTRACT — 60s homepage hero / paid ad video.
// Premium SaaS aesthetic. Dark base, 45% workflow BG, floating card + text.
// Audience: Cold traffic — restoration company owners discovering RestoreAssist.
// Goal: Free trial signup. Punchy. Fast cuts. Every job. One platform.
// Audio: single continuous ElevenLabs VO (attract-full.mp3) — one voice, one performance.
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

// ─── Scene timing (total = 2310f = 77s @ 30fps) ──────────────────────────────
// Scaled to match slowed VO (75.7s audio + 1.3s buffer).
// Visual cuts are independent of audio — narration flows continuously.
const S1 = { from: 0, dur: 310 }; // 10.3s — Hook
const S2 = { from: 310, dur: 345 }; // 11.5s — Problem
const S3 = { from: 655, dur: 500 }; // 16.7s — AI Scope
const S4 = { from: 1155, dur: 450 }; // 15.0s — Compliance
const S5 = { from: 1605, dur: 345 }; // 11.5s — Evidence
const S6 = { from: 1950, dur: 360 }; // 12.0s — CTA
const TOTAL = S6.from + S6.dur; // 2310f = 77s ✓

// bgOffset per scene so each scene's background shows different workflow steps
const BG_OFFSETS = [0, 180, 360, 540, 720, 900];

export const AttractV1: React.FC = () => {
  const frame = useCurrentFrame();

  // Background music — barely audible ambient bed
  const bgMusicVolume = interpolate(
    frame,
    [0, 30, TOTAL - 30, TOTAL],
    [0, 0.07, 0.07, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Single VO track — one continuous performance across all scenes
  // Audio is ~57s; last 10s of CTA plays with music only (URL on screen)
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
      <Audio src={staticFile("audio/attract-full.mp3")} volume={voVolume} />

      {/* ── Scene 1: Hook ────────────────────────────────────────────────── */}
      <Sequence from={S1.from} durationInFrames={S1.dur} name="S1: Hook">
        <PremiumScene
          screenshotPath="screenshots/real/dashboard.png"
          label="RestoreAssist"
          headline={"Every job.\nDocumented.\nPaid."}
          body="The platform Australian restoration professionals use to run their entire business — from first inspection to final invoice."
          bgOffset={BG_OFFSETS[0]}
        />
      </Sequence>

      {/* ── Scene 2: The Problem ─────────────────────────────────────────── */}
      <Sequence from={S2.from} durationInFrames={S2.dur} name="S2: Problem">
        <PremiumScene
          screenshotPath="screenshots/real/moisture.png"
          label="The Problem"
          headline={"Three hours of\npaperwork.\nPer job."}
          body="Manual scopes. Disputed claims. Moisture readings on paper, typed up later. Data split across phones, emails, and spreadsheets. Your team deserves better."
          bgOffset={BG_OFFSETS[1]}
        />
      </Sequence>

      {/* ── Scene 3: AI Scope Generation ─────────────────────────────────── */}
      <Sequence from={S3.from} durationInFrames={S3.dur} name="S3: AI Scope">
        <PremiumScene
          screenshotPath="screenshots/real/scope.png"
          label="AI Scope Generation"
          headline={"30 seconds.\nIICRC-cited.\nInsurer-ready."}
          body="AI generates your complete scope of works from inspection data. Every line item calculated. S500, S520, and S700 cited on every scope item. No manual entry. No disputes."
          bgOffset={BG_OFFSETS[2]}
        />
      </Sequence>

      {/* ── Scene 4: Compliance ──────────────────────────────────────────── */}
      <Sequence from={S4.from} durationInFrames={S4.dur} name="S4: Compliance">
        <PremiumScene
          screenshotPath="screenshots/real/compliance.png"
          label="Built-In Compliance"
          headline={"Zero disputed\nclaims from\nmissing citations."}
          body="State-specific compliance triggers fire automatically. All eight Australian states covered. Insurers approve faster when every standard is cited on every scope."
          bgOffset={BG_OFFSETS[3]}
        />
      </Sequence>

      {/* ── Scene 5: Evidence ────────────────────────────────────────────── */}
      <Sequence from={S5.from} durationInFrames={S5.dur} name="S5: Evidence">
        <PremiumScene
          screenshotPath="screenshots/real/report.png"
          label="Court-Ready Evidence"
          headline={"Captured on site.\nNot assembled\nfrom memory."}
          body="Timestamped photos, moisture readings, and classifications recorded during inspection — not pieced together afterward. Documentation that insurers accept without dispute."
          bgOffset={BG_OFFSETS[4]}
        />
      </Sequence>

      {/* ── Scene 6: CTA ─────────────────────────────────────────────────── */}
      <Sequence from={S6.from} durationInFrames={S6.dur} name="S6: CTA">
        <PremiumScene
          screenshotPath="screenshots/real/dashboard.png"
          label="Start Free Today"
          headline={"Three reports.\nFree. No\ncredit card."}
          body="Join restoration professionals across Australia already saving hours every week."
          bgOffset={BG_OFFSETS[5]}
          variant="center"
          ctaUrl="restoreassist.app"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
