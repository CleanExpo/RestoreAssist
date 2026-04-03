import React from "react";
import { Composition } from "remotion";
import { ProductExplainer } from "./compositions/ProductExplainer";
import { IndustryInsight } from "./compositions/IndustryInsight";
import { LandingPageOverview } from "./compositions/LandingPageOverview";

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
    </>
  );
};
