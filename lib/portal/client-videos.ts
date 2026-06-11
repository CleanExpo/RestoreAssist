/**
 * Client-portal explainer videos ("what to expect").
 *
 * Plain-language Disaster-Recovery / RestoreAssist videos shown to the client on
 * their portal so they understand the restoration process. Config-driven — add
 * or reorder entries here; the portal renders whatever is in this list. URLs are
 * the real hosted RestoreAssist videos (scripts/cloudinary-urls.json).
 */

export interface ClientVideo {
  id: string;
  title: string;
  description: string;
  url: string;
}

const CLOUD = "https://res.cloudinary.com/dmaulkthb/video/upload";

export const CLIENT_PORTAL_VIDEOS: ClientVideo[] = [
  {
    id: "water-damage-categories",
    title: "Water damage categories explained",
    description:
      "What Category 1, 2 and 3 water mean for your property and your health.",
    url: `${CLOUD}/v1780543355/restoreassist/videos/remotion/training-water-damage-cat.mp4`,
  },
  {
    id: "drying-standard",
    title: "How drying works",
    description:
      "Why drying takes time, the equipment we use, and how we confirm your property is dry (AS/IICRC S500).",
    url: `${CLOUD}/v1780543354/restoreassist/videos/remotion/training-s500-standard.mp4`,
  },
  {
    id: "moisture-mapping",
    title: "Mapping the moisture",
    description:
      "How your assessor measures and tracks moisture across the affected areas.",
    url: `${CLOUD}/v1780543325/restoreassist/videos/remotion/moisture-mapping.mp4`,
  },
  {
    id: "mould-remediation",
    title: "If mould is found",
    description:
      "What happens when mould is present and how it's safely removed.",
    url: `${CLOUD}/v1780543352/restoreassist/videos/remotion/training-mould-remediation.mp4`,
  },
  {
    id: "fire-smoke",
    title: "Fire & smoke damage",
    description: "The restoration process for fire- and smoke-affected homes.",
    url: `${CLOUD}/v1780543351/restoreassist/videos/remotion/training-fire-smoke.mp4`,
  },
  {
    id: "evidence-chain",
    title: "How your claim is documented",
    description:
      "The evidence record we build to support your insurance claim.",
    url: `${CLOUD}/v1780543301/restoreassist/videos/remotion/evidence-chain.mp4`,
  },
];
