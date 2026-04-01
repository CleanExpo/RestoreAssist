/**
 * LandingPageOverview — 90-second landing page video
 *
 * Structure (30fps):
 *  0s–6s    (0–180f)    : Title — Brand hook
 *  6s–18s   (180–540f)  : System Overview — what RA does
 *  18s–29s  (540–870f)  : Dashboard screenshot
 *  29s–41s  (870–1230f) : Key advantages
 *  41s–52s  (1230–1560f): Australian compliance focus
 *  52s–63s  (1560–1890f): Scope items screenshot + what to expect
 *  63s–76s  (1890–2280f): Impact stats
 *  76s–90s  (2280–2700f): Free trial CTA
 */

import React from "react";
import { AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import { TitleSlide } from "../components/TitleSlide";
import { BulletList } from "../components/BulletList";
import { ScreenshotSlide } from "../components/ScreenshotSlide";
import { StatCard } from "../components/StatCard";
import { FreeTrialSlide } from "../components/FreeTrialSlide";

// Helper: check whether an audio asset exists before including it
// In development/CI, audio may not yet be generated — skip gracefully
const tryAudio = (path: string) => {
  try {
    return <Audio src={staticFile(path)} />;
  } catch {
    return null;
  }
};

export const LandingPageOverview: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* ── Scene 1: Brand Hook ──────────────────────────── 0–6s */}
      <Sequence from={0} durationInFrames={180}>
        <TitleSlide
          title="RestoreAssist"
          subtitle="The All-in-One Platform Built for Restoration Professionals"
          showLogo
        />
        {tryAudio("audio/lp-intro.mp3")}
      </Sequence>

      {/* ── Scene 2: System Overview ─────────────────────── 6–18s */}
      <Sequence from={180} durationInFrames={360}>
        <BulletList
          title="One Platform. Everything You Need."
          bullets={[
            "AI-powered scope of works generation with IICRC standards built in",
            "Automated NIR reports — from inspection to insurer-ready PDF",
            "Evidence capture, equipment scheduling & contractor management",
          ]}
        />
        {tryAudio("audio/lp-overview.mp3")}
      </Sequence>

      {/* ── Scene 3: Dashboard Screenshot ────────────────── 18–29s */}
      <Sequence from={540} durationInFrames={330}>
        <ScreenshotSlide
          screenshotPath="screenshots/dashboard-new-inspection.png"
          caption="Your command centre for every active restoration job"
          overlay="Live Dashboard Overview"
        />
        {tryAudio("audio/lp-dashboard.mp3")}
      </Sequence>

      {/* ── Scene 4: Key Advantages ──────────────────────── 29–41s */}
      <Sequence from={870} durationInFrames={360}>
        <BulletList
          title="The Advantages Are Clear"
          bullets={[
            "Save 2+ hours per inspection — AI generates your scope instantly",
            "Never miss a line item — every item is evidence-linked and IICRC-cited",
            "One-click export to Xero, Ascora, ServiceM8, QuickBooks & MYOB",
            "Fully compliant with building codes across all Australian states",
          ]}
        />
        {tryAudio("audio/lp-advantages.mp3")}
      </Sequence>

      {/* ── Scene 5: Australian Compliance ───────────────── 41–52s */}
      <Sequence from={1230} durationInFrames={330}>
        <BulletList
          title="Built for Australian Compliance"
          bullets={[
            "IICRC S500, S520 & S700 standards automatically applied",
            "State-specific regulatory triggers across all 8 Australian states",
            "Court-ready evidence register attached to every inspection",
          ]}
        />
        {tryAudio("audio/lp-compliance.mp3")}
      </Sequence>

      {/* ── Scene 6: Scope Screenshot + What to Expect ───── 52–63s */}
      <Sequence from={1560} durationInFrames={330}>
        <ScreenshotSlide
          screenshotPath="screenshots/scope-items-generated.png"
          caption="Scope items generated with IICRC citations on every line — in seconds"
          overlay="AI Scope Generation"
        />
        {tryAudio("audio/lp-scope.mp3")}
      </Sequence>

      {/* ── Scene 7: Impact Stats ─────────────────────────── 63–76s */}
      <Sequence from={1890} durationInFrames={390}>
        <StatCard
          title="Why Restoration Teams Choose RestoreAssist"
          stats={[
            {
              value: "2",
              unit: "+ hrs",
              label: "Saved per inspection",
              detail: "AI scope generation replaces manual line-item entry",
              accent: "#06b6d4",
            },
            {
              value: "100",
              unit: "%",
              label: "IICRC compliant reports",
              detail: "S500, S520 & S700 citations on every scope item",
              accent: "#D4A574",
            },
            {
              value: "8",
              label: "Australian states covered",
              detail: "State-specific building codes & regulatory triggers built in",
              accent: "#3b82f6",
            },
          ]}
        />
        {tryAudio("audio/lp-stats.mp3")}
      </Sequence>

      {/* ── Scene 8: Free Trial CTA ───────────────────────── 76–90s */}
      <Sequence from={2280} durationInFrames={420}>
        <FreeTrialSlide />
        {tryAudio("audio/lp-cta.mp3")}
      </Sequence>
    </AbsoluteFill>
  );
};
