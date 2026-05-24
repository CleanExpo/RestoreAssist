"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  MouseEvent,
} from "react";
import FeatureGateModal from "./FeatureGateModal";

type Tier = "STANDARD" | "PREMIUM" | "ENTERPRISE" | null;
type FeatureMap = Record<string, Tier[]>;

const DEFAULT_FEATURE_MAP: FeatureMap = {
  "advanced-damage": ["PREMIUM", "ENTERPRISE"],
  "premium-report": ["PREMIUM", "ENTERPRISE"],
  "iicrc-full-coverage": ["ENTERPRISE"],
};

export default function FeatureGate({
  feature,
  userTier,
  featureMap = DEFAULT_FEATURE_MAP,
  children,
}: {
  feature: string;
  userTier: Tier;
  featureMap?: FeatureMap;
  children: React.ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const allowedTiers = featureMap[feature] ?? [];
  const allowed = userTier !== null && allowedTiers.includes(userTier);

  if (allowed) return <>{children}</>;

  return (
    <>
      {Children.map(children, (child) => {
        if (!isValidElement<{ onClick?: (e: MouseEvent) => void }>(child))
          return child;
        return cloneElement(child, {
          onClick: (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setModalOpen(true);
          },
        });
      })}
      {modalOpen && (
        <FeatureGateModal
          feature={feature}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
