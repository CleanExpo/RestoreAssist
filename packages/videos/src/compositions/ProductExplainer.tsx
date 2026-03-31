import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { TitleSlide } from "../components/TitleSlide";
import { ScreenshotSlide } from "../components/ScreenshotSlide";
import { BulletList } from "../components/BulletList";
import { CTASlide } from "../components/CTASlide";

export const ProductExplainer: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Intro - Logo + Slogan (0-5s = 0-150 frames) */}
      <Sequence from={0} durationInFrames={150}>
        <TitleSlide
          title="How RestoreAssist Generates a Scope of Works"
          subtitle="One System. Fewer Gaps. More Confidence."
        />
      </Sequence>

      {/* Screenshot 1 - Dashboard / New Inspection (5-20s = 150-600 frames) */}
      <Sequence from={150} durationInFrames={450}>
        <ScreenshotSlide
          screenshotPath="screenshots/dashboard-new-inspection.png"
          caption="Start by entering the property details and claim information"
          overlay="Step 1: Create Inspection"
        />
      </Sequence>

      {/* Bullet 1 - AI Scope Generation (20-30s = 600-900 frames) */}
      <Sequence from={600} durationInFrames={300}>
        <BulletList
          title="AI-Powered Scope Generation"
          bullets={[
            "Inspection data automatically analysed by AI",
            "Scope items generated with quantities and specifications",
            "Equipment requirements calculated based on affected area",
          ]}
        />
      </Sequence>

      {/* Bullet 2 - IICRC Standards (30-40s = 900-1200 frames) */}
      <Sequence from={900} durationInFrames={300}>
        <BulletList
          title="IICRC S500 Standards Automatically Applied"
          bullets={[
            "Water damage categories and classes correctly classified",
            "Standard-specific citations on every scope item",
            "Compliant with Australian building codes and regulations",
          ]}
        />
      </Sequence>

      {/* Bullet 3 - Export / Integrations (40-50s = 1200-1500 frames) */}
      <Sequence from={1200} durationInFrames={300}>
        <BulletList
          title="One-Click Export to Your Systems"
          bullets={[
            "Send scopes directly to Xero, Ascora, or ServiceM8",
            "Generate professional PDF reports for insurers",
            "Sync costs and line items to your accounting platform",
          ]}
        />
      </Sequence>

      {/* CTA Outro (50-60s = 1500-1800 frames) */}
      <Sequence from={1500} durationInFrames={300}>
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
