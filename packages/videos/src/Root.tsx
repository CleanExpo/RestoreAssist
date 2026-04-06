// packages/videos/src/Root.tsx
import React from "react";
import { Composition } from "remotion";
import { ProductExplainer } from "./compositions/ProductExplainer";
import { IndustryInsight } from "./compositions/IndustryInsight";
import { LandingPageOverview } from "./compositions/LandingPageOverview";
import { CinematicLandingV2 } from "./compositions/CinematicLandingV2";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ProductExplainer"
        component={ProductExplainer}
        durationInFrames={1800}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="IndustryInsight"
        component={IndustryInsight}
        durationInFrames={4500}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="LandingPageOverview"
        component={LandingPageOverview}
        durationInFrames={2700}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CinematicLandingV2"
        component={CinematicLandingV2}
        durationInFrames={4410}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: "RestoreAssist — One System. Fewer Gaps. More Confidence.",
          description:
            "AI-powered damage assessment for Australian restoration professionals.",
          version: "2.0",
        }}
      />
    </>
  );
};
