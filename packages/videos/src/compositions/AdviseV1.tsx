// packages/videos/src/compositions/AdviseV1.tsx
// VIDEO: ADVISE — 120s IICRC S500:2025 compliance explainer.
// Target audience: Existing RestoreAssist users and prospects wanting to understand compliance.
// Goal: Educate on IICRC S500:2025, explain why it matters for claims, show RestoreAssist enforces it automatically.
// Style: Dark cinematic — KineticTextScene for education, FullBleedScene for class overview, StatCounterScene for results, CinematicCTA to close.
// Audio: bg-music.mp3 (ambient) + per-scene VO segments advise-s1.mp3 through advise-s7.mp3.
import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  CinematicCTA,
  FullBleedScene,
  KineticTextScene,
  StatCounterScene,
} from "../components/cinematic";

// ─── Scene timing (total = 3600f = 120s @ 30fps) ─────────────────────────────
const S1 = { from: 0, dur: 480 }; // 16s — Hook: What is IICRC S500:2025?
const S2 = { from: 480, dur: 540 }; // 18s — Why claims get disputed
const S3 = { from: 1020, dur: 600 }; // 20s — The 5 water damage classes
const S4 = { from: 1620, dur: 600 }; // 20s — What compliant documentation looks like
const S5 = { from: 2220, dur: 600 }; // 20s — How RestoreAssist enforces S500:2025
const S6 = { from: 2820, dur: 480 }; // 16s — Stats: Time savings + approval rates
const S7 = { from: 3300, dur: 300 }; // 10s — CTA
const TOTAL = S7.from + S7.dur; // 3600f = 120s ✓

export const AdviseV1: React.FC = () => {
  const frame = useCurrentFrame();

  // Background music — ambient bed, barely audible
  const bgMusicVolume = interpolate(
    frame,
    [0, 30, TOTAL - 30, TOTAL],
    [0, 0.06, 0.06, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill>
      {/* Google Fonts: Inter — matches RestoreAssist brand */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Background music bed */}
      <Audio src={staticFile("audio/bg-music.mp3")} volume={bgMusicVolume} />

      {/* ── Scene 1: Hook — What is IICRC S500:2025? ──────────────────────── */}
      <Sequence from={S1.from} durationInFrames={S1.dur} name="S1: Hook">
        {/* Per-scene VO — offset 15 frames to let scene fade in first */}
        <Audio
          src={staticFile("audio/advise-s1.mp3")}
          startFrom={0}
          volume={1.0}
          delay={15}
        />
        <KineticTextScene
          label="IICRC S500:2025"
          bullets={[
            {
              text: "The IICRC S500 is the global standard for water damage restoration",
            },
            {
              text: "The 2025 edition introduces stricter documentation requirements",
            },
            {
              text: "Non-compliant documentation is the #1 reason insurance claims are disputed",
            },
            {
              text: "Compliance protects your business, your clients, and your invoices",
            },
          ]}
          backgroundVariant="dark"
        />
      </Sequence>

      {/* ── Scene 2: Why claims get disputed ──────────────────────────────── */}
      <Sequence from={S2.from} durationInFrames={S2.dur} name="S2: Disputes">
        <Audio
          src={staticFile("audio/advise-s2.mp3")}
          startFrom={0}
          volume={1.0}
          delay={15}
        />
        <KineticTextScene
          label="Why Claims Are Disputed"
          bullets={[
            {
              text: "Moisture readings not linked to instrument serial numbers",
              accentWords: ["serial numbers"],
            },
            {
              text: "Water classification not documented at time of inspection",
              accentWords: ["at time of inspection"],
            },
            {
              text: "Scope of works missing IICRC section citations",
              accentWords: ["IICRC section citations"],
            },
            {
              text: "Progress photos without timestamps or GPS coordinates",
              accentWords: ["timestamps", "GPS coordinates"],
            },
          ]}
          backgroundVariant="navy"
        />
      </Sequence>

      {/* ── Scene 3: The 5 Water Damage Classes ───────────────────────────── */}
      <Sequence
        from={S3.from}
        durationInFrames={S3.dur}
        name="S3: Water Classes"
      >
        <Audio
          src={staticFile("audio/advise-s3.mp3")}
          startFrom={0}
          volume={1.0}
          delay={15}
        />
        <FullBleedScene
          screenshotPath="screenshots/real/moisture.png"
          primaryStatement="Five water damage classes. One standard."
          supportingLine="Class 1–4: Slow evaporation → Fast → Fastest → Specialty drying. Each class determines your drying plan, equipment selection, and S500:2025 documentation requirements."
          accentBarWidth={520}
        />
      </Sequence>

      {/* ── Scene 4: What compliant documentation requires ────────────────── */}
      <Sequence
        from={S4.from}
        durationInFrames={S4.dur}
        name="S4: Documentation"
      >
        <Audio
          src={staticFile("audio/advise-s4.mp3")}
          startFrom={0}
          volume={1.0}
          delay={15}
        />
        <KineticTextScene
          label="Compliant Documentation"
          bullets={[
            {
              text: "Water source classification (Category 1, 2, or 3) at point of loss",
            },
            {
              text: "Moisture readings with instrument serial, calibration date, and location",
              accentWords: ["instrument serial", "calibration date"],
            },
            {
              text: "Scope items citing specific IICRC S500:2025 section numbers",
              accentWords: ["IICRC S500:2025 section numbers"],
            },
            {
              text: "Progress readings at every drying check — not just start and end",
            },
            {
              text: "Final clearance readings confirming restoration to pre-loss condition",
            },
          ]}
          backgroundVariant="dark"
        />
      </Sequence>

      {/* ── Scene 5: How RestoreAssist enforces S500:2025 ─────────────────── */}
      <Sequence
        from={S5.from}
        durationInFrames={S5.dur}
        name="S5: RestoreAssist"
      >
        <Audio
          src={staticFile("audio/advise-s5.mp3")}
          startFrom={0}
          volume={1.0}
          delay={15}
        />
        <KineticTextScene
          label="Automatic Compliance"
          bullets={[
            {
              text: "Every scope item generated with the correct S500:2025 section citation",
              accentWords: ["S500:2025 section citation"],
            },
            {
              text: "Water class and category captured at inspection — locked to the job",
            },
            {
              text: "Moisture readings require instrument type and serial number",
              accentWords: ["instrument type", "serial number"],
            },
            {
              text: "State-specific triggers for QLD, NSW, VIC, WA, SA, TAS, ACT, NT",
            },
            {
              text: "Report exported as a structured PDF — insurer-ready, dispute-proof",
              accentWords: ["insurer-ready", "dispute-proof"],
            },
          ]}
          backgroundVariant="navy"
          backgroundSrc="screenshots/real/scope.png"
        />
      </Sequence>

      {/* ── Scene 6: Stats ────────────────────────────────────────────────── */}
      <Sequence from={S6.from} durationInFrames={S6.dur} name="S6: Stats">
        <Audio
          src={staticFile("audio/advise-s6.mp3")}
          startFrom={0}
          volume={1.0}
          delay={15}
        />
        <StatCounterScene
          heading="The numbers speak clearly."
          stats={[
            {
              targetValue: 3,
              unit: "hrs",
              label: "Saved per job",
              detail:
                "Average hours saved on documentation per job when RestoreAssist generates scopes, readings, and reports automatically.",
              accent: "#D4A574",
            },
            {
              targetValue: 23,
              unit: "%",
              label: "Faster claim approval",
              detail:
                "Improvement in insurer approval rate when every scope item carries the correct IICRC S500:2025 standard citation.",
              accent: "#8A6B4E",
            },
            {
              targetValue: 100,
              unit: "%",
              label: "IICRC citations",
              detail:
                "Percentage of scope items exported with the correct S500:2025 section reference — every report, every time.",
              accent: "#D4A574",
            },
          ]}
        />
      </Sequence>

      {/* ── Scene 7: CTA ──────────────────────────────────────────────────── */}
      <Sequence from={S7.from} durationInFrames={S7.dur} name="S7: CTA">
        <Audio
          src={staticFile("audio/advise-s7.mp3")}
          startFrom={0}
          volume={1.0}
          delay={15}
        />
        <CinematicCTA />
      </Sequence>
    </AbsoluteFill>
  );
};
