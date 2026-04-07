// packages/videos/src/compositions/SellV1.tsx
// VIDEO: SELL V1 — Product demo walkthrough, 90s (2700 frames @ 30fps).
// Target audience: Prospects who know RestoreAssist exists and want to see it in action.
// Goal: Show the complete workflow end-to-end, drive to trial signup.
// Style: Dark cinematic (SplitScene pattern), high-polish product demo.
//
// Scene structure (total = 2700f = 90s):
//   S1:  0f–360f   (12s) — Hook: "See it work."
//   S2:  360f–720f (12s) — Dashboard overview
//   S3:  720f–1080f(12s) — New inspection / scope generation
//   S4: 1080f–1440f(12s) — IICRC compliance check
//   S5: 1440f–1800f(12s) — Moisture readings captured
//   S6: 1800f–2160f(12s) — Report generated
//   S7: 2160f–2460f(10s) — Invoice sent
//   S8: 2460f–2700f( 8s) — CTA

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
  LetterboxReveal,
  SplitScene,
} from "../components/cinematic";

// ─── Scene timing ────────────────────────────────────────────────────────────
const S1 = { from: 0, dur: 360 };     // 12s — Hook
const S2 = { from: 360, dur: 360 };   // 12s — Dashboard overview
const S3 = { from: 720, dur: 360 };   // 12s — Scope generation
const S4 = { from: 1080, dur: 360 };  // 12s — Compliance check
const S5 = { from: 1440, dur: 360 };  // 12s — Moisture readings
const S6 = { from: 1800, dur: 360 };  // 12s — Report generated
const S7 = { from: 2160, dur: 300 };  // 10s — Invoice sent
const S8 = { from: 2460, dur: 240 };  //  8s — CTA
const TOTAL = S8.from + S8.dur;       // 2700f = 90s ✓

export const SellV1: React.FC = () => {
  const frame = useCurrentFrame();

  // BG music: fade in over first 30f, hold, fade out over last 30f
  const bgMusicVolume = interpolate(
    frame,
    [0, 30, TOTAL - 30, TOTAL],
    [0, 0.08, 0.08, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>

      {/* Background music bed */}
      <Audio src={staticFile("audio/bg-music.mp3")} volume={bgMusicVolume} />

      {/* ── Scene 1: Hook — LetterboxReveal (12s) ─────────────────────────── */}
      <Sequence from={S1.from} durationInFrames={S1.dur} name="S1: Hook">
        <LetterboxReveal
          mode="intro"
          logoSrc="logo.png"
          tagline="See it work."
        />
        <Audio src={staticFile("audio/sell-s1.mp3")} volume={1.0} startFrom={15} />
      </Sequence>

      {/* ── Scene 2: Dashboard overview (12s) ─────────────────────────────── */}
      <Sequence from={S2.from} durationInFrames={S2.dur} name="S2: Dashboard">
        <SplitScene
          beforeStat="47"
          beforeStatContext="Active jobs visible at a glance — pipeline, status, and pending invoices"
          painPoints={[
            "Jobs tracked across spreadsheets, email threads, and paper dockets",
            "No single view of what's active, overdue, or waiting on insurer",
            "Pipeline value and cash position are always a guess, never a fact",
          ]}
          screenshotPath="screenshots/real/dashboard.png"
          afterLabel="Dashboard — Command Centre"
          afterCallout="$284k pipeline. One screen."
        />
        <Audio src={staticFile("audio/sell-s2.mp3")} volume={1.0} startFrom={15} />
      </Sequence>

      {/* ── Scene 3: Scope generation (12s) ───────────────────────────────── */}
      <Sequence from={S3.from} durationInFrames={S3.dur} name="S3: Scope">
        <SplitScene
          beforeStat="3h"
          beforeStatContext="Average time to write a scope of works manually per water damage job"
          painPoints={[
            "Scope written line-by-line from memory or handwritten site notes",
            "No IICRC citations included — insurers push back on approval",
            "Quantities estimated by eye, not calculated from actual measurements",
          ]}
          screenshotPath="screenshots/real/scope.png"
          afterLabel="AI Scope Generation"
          afterCallout="Full scope in 30 seconds"
        />
        <Audio src={staticFile("audio/sell-s3.mp3")} volume={1.0} startFrom={15} />
      </Sequence>

      {/* ── Scene 4: IICRC compliance (12s) ───────────────────────────────── */}
      <Sequence from={S4.from} durationInFrames={S4.dur} name="S4: Compliance">
        <SplitScene
          beforeStat="0"
          beforeStatContext="IICRC citations on a typical manually written scope of works"
          painPoints={[
            "Compliance checked manually against printed standards documents",
            "State-specific triggers missed — building code breaches go unnoticed",
            "Disputed claims due to insufficient evidence of standard adherence",
          ]}
          screenshotPath="screenshots/real/compliance.png"
          afterLabel="IICRC Compliance Engine"
          afterCallout="S500:2025 · 8 states · 5 classes"
        />
        <Audio src={staticFile("audio/sell-s4.mp3")} volume={1.0} startFrom={15} />
      </Sequence>

      {/* ── Scene 5: Moisture readings (12s) ──────────────────────────────── */}
      <Sequence from={S5.from} durationInFrames={S5.dur} name="S5: Moisture">
        <SplitScene
          beforeStat="0"
          beforeStatContext="Digital records of moisture readings on most jobs — paper only"
          painPoints={[
            "Readings noted on paper clipboards, re-keyed hours later from memory",
            "No GPS coordinates, instrument serial, or timestamp on manual records",
            "Court-ready documentation assembled after the fact — errors introduced",
          ]}
          screenshotPath="screenshots/real/moisture.png"
          afterLabel="Field Capture"
          afterCallout="GPS · timestamp · instrument serial"
        />
        <Audio src={staticFile("audio/sell-s5.mp3")} volume={1.0} startFrom={15} />
      </Sequence>

      {/* ── Scene 6: Report generated (12s) ───────────────────────────────── */}
      <Sequence from={S6.from} durationInFrames={S6.dur} name="S6: Report">
        <SplitScene
          beforeStat="3"
          beforeStatContext="Separate phones evidence is spread across before assembling one report"
          painPoints={[
            "Evidence assembled from multiple devices hours or days after the site visit",
            "Moisture readings, photos, and scope items compiled manually into Word docs",
            "Insurers request missing data — back and forth delays payment by weeks",
          ]}
          screenshotPath="screenshots/real/report.png"
          afterLabel="Insurer-Ready Report"
          afterCallout="Minutes. Not hours."
        />
        <Audio src={staticFile("audio/sell-s6.mp3")} volume={1.0} startFrom={15} />
      </Sequence>

      {/* ── Scene 7: Invoice sent (10s) ────────────────────────────────────── */}
      <Sequence from={S7.from} durationInFrames={S7.dur} name="S7: Invoice">
        <SplitScene
          beforeStat="3×"
          beforeStatContext="Data re-keyed to produce one invoice from completed scope"
          painPoints={[
            "Scope items manually re-entered into Xero, MYOB, or accounting software",
            "Line items transcribed from report to invoice by hand — errors slip through",
            "Hours lost weekly to data re-entry that should never happen",
          ]}
          screenshotPath="screenshots/real/invoice.png"
          afterLabel="Invoice Out the Door"
          afterCallout="23% faster payment on average"
        />
        <Audio src={staticFile("audio/sell-s7.mp3")} volume={1.0} startFrom={15} />
      </Sequence>

      {/* ── Scene 8: CTA (8s) ─────────────────────────────────────────────── */}
      <Sequence from={S8.from} durationInFrames={S8.dur} name="S8: CTA">
        <CinematicCTA />
        <Audio src={staticFile("audio/sell-s8.mp3")} volume={1.0} startFrom={15} />
      </Sequence>
    </AbsoluteFill>
  );
};
