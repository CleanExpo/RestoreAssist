import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { TitleSlide } from "../components/TitleSlide";
import { BulletList } from "../components/BulletList";
import { CTASlide } from "../components/CTASlide";

export const IndustryInsight: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Intro (0-5s = 0-150 frames) */}
      <Sequence from={0} durationInFrames={150}>
        <TitleSlide
          title="The Most Common Mistake Restorers Make on Insurance Claims"
          subtitle="Missing vital data while inspecting"
        />
      </Sequence>

      {/* Segment 1: Pre-site planning (5-30s = 150-900 frames) */}
      <Sequence from={150} durationInFrames={300}>
        <TitleSlide
          title="The inspection starts when you first get the claim"
          showLogo={false}
        />
      </Sequence>

      <Sequence from={450} durationInFrames={450}>
        <BulletList
          title="Before You Leave the Office"
          bullets={[
            "Where am I going? What's the traffic? What services are nearby if I need assistance or emergency help?",
            "What equipment will I need? Do I need specialised PPE, chemicals? Are the correct trained technicians going to site?",
            "Is the property secure and safe to enter? No falling trees, damaged main support structures?",
          ]}
          framesPerBullet={90}
        />
      </Sequence>

      {/* Segment 2: On site (30-40s = 900-1200 frames) */}
      <Sequence from={900} durationInFrames={300}>
        <TitleSlide
          title="Where Does the Inspection Start on Site?"
          subtitle="As soon as you gain entry to the property"
          showLogo={false}
        />
      </Sequence>

      {/* Segment 3: What are you looking for? (40-80s = 1200-2400 frames) */}
      <Sequence from={1200} durationInFrames={600}>
        <BulletList
          title="What Are You Looking For?"
          bullets={[
            "Let the client talk. Don't interrupt or input your previous experience. You're there to listen, not make judgement.",
            "Video and photographic evidence. Vital for future conflicts and verification.",
            "Note taking \u2014 each area requires detailed scoping for pre-inspection, during inspection, and post-inspection.",
          ]}
          framesPerBullet={120}
        />
      </Sequence>

      <Sequence from={1800} durationInFrames={600}>
        <BulletList
          title="What Are You Looking For?"
          bullets={[
            "Verification of the incident \u2014 not to dispel the client's events, but to ensure best practices and industry standards.",
            "Past what the eyes can see \u2014 look up, look behind, look around, and look under. Our role is to mitigate and reduce further damage.",
          ]}
          framesPerBullet={180}
        />
      </Sequence>

      {/* Segment 4: Who are we there for? (80-120s = 2400-3600 frames) */}
      <Sequence from={2400} durationInFrames={300}>
        <TitleSlide
          title="Who Are We There For?"
          subtitle="This is the biggest question"
          showLogo={false}
        />
      </Sequence>

      <Sequence from={2700} durationInFrames={600}>
        <BulletList
          title="We Are There for the Property"
          bullets={[
            "Whether that's the property owner, the tenant, the landlord \u2014 whoever. Our role is to bring the indoor environment back to pre-loss condition or better.",
            "In guidance with Australian/New Zealand Indoor Health Best Practices.",
            "ABCB Indoor Air Quality Verification Methods (NCC 2022) and Safe Work Australia Exposure Standards for Airborne Contaminants.",
          ]}
          framesPerBullet={120}
        />
      </Sequence>

      {/* Segment 5: How RestoreAssist helps (120-140s = 3600-4200 frames) */}
      <Sequence from={3300} durationInFrames={600}>
        <BulletList
          title="How RestoreAssist Helps"
          bullets={[
            "Guided inspection workflows ensure nothing is missed",
            "Pre-site checklists with equipment and PPE requirements",
            "Evidence capture with timestamped photo and video logging",
            "Automatic IICRC standards compliance on every scope item",
          ]}
          framesPerBullet={90}
        />
      </Sequence>

      {/* CTA Outro (140-150s = 4200-4500 frames) */}
      <Sequence from={3900} durationInFrames={600}>
        <CTASlide
          slogan="One System. Fewer Gaps. More Confidence."
          primaryLabel="Book a Demo"
          primaryUrl="restoreassist.com.au/contact"
          secondaryLabel="See How It Works"
          secondaryUrl="restoreassist.com.au/how-it-works"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
