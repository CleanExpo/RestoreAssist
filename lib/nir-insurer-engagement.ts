/**
 * NIR Insurer Engagement Strategy
 *
 * Replaces the assumption that insurers will "demand NIR through
 * market pressure" with a concrete engagement pathway.
 *
 * Critique addressed: C5 — No named insurer engagement or API path
 *
 * The core insight: insurer adoption requires two things happening simultaneously:
 *   1. Pilot data showing faster claims with NIR
 *   2. A production-ready API integration for their claims system
 * Both must be true. Neither alone is sufficient.
 */

export interface InsurerProfile {
  name: string;
  brands: string[];
  estimatedMarketShare: string;
  claimsSystem: string;
  engagementPriority: 1 | 2 | 3;
  entryPoint: string;
  pilotStatus:
    | "TARGET"
    | "APPROACHED"
    | "OBSERVER"
    | "PILOT_ACTIVE"
    | "INTEGRATED";
  apiIntegrationPath: string;
  targetTimeline: string;
  notes: string;
}

export const INSURER_ENGAGEMENT_MAP: InsurerProfile[] = [
  {
    name: "IAG",
    brands: ["NRMA", "CGU", "SGIO", "SGIC", "Swann"],
    estimatedMarketShare: "~33% of Australian general insurance market",
    claimsSystem: "Guidewire ClaimCenter",
    engagementPriority: 1,
    entryPoint:
      "IAG Claims Transformation team via NRMA supplier portal; direct outreach to IAG Innovation Lab",
    pilotStatus: "TARGET",
    apiIntegrationPath:
      "Guidewire ClaimCenter REST API — NIR JSON schema maps to ClaimCenter claim intake fields. Integration guide to be published as open documentation.",
    targetTimeline:
      "Phase 2 pilot observer (Months 6–9); formal integration evaluation Phase 3 (Month 10+)",
    notes:
      'Largest single insurer by claims volume. IAG pilot = strongest market signal. Target IAG Claims Transformation not IT — they own the "faster claims" problem.',
  },
  {
    name: "Suncorp",
    brands: ["AAMI", "GIO", "Bingle", "Vero"],
    estimatedMarketShare: "~16% of Australian general insurance market",
    claimsSystem: "Majesco Claims",
    engagementPriority: 1,
    entryPoint:
      "Suncorp Supplier Assurance Program; AAMI assessor network via state-based claims managers",
    pilotStatus: "TARGET",
    apiIntegrationPath:
      "Majesco Claims API — NIR JSON schema maps to Majesco claim intake. Suncorp has active digital transformation program as of 2024.",
    targetTimeline:
      "Phase 2 pilot observer (Months 6–9); API integration Phase 3–4",
    notes:
      "Strong QLD presence — natural fit for NIR QLD pilot given QLD flood code complexity. Suncorp digital transformation team is active.",
  },
  {
    name: "QBE Australia",
    brands: ["QBE"],
    estimatedMarketShare: "~10% of Australian general insurance market",
    claimsSystem: "Guidewire ClaimCenter",
    engagementPriority: 2,
    entryPoint:
      "QBE Procurement portal; claims assessor network via state-based offices",
    pilotStatus: "TARGET",
    apiIntegrationPath:
      "Same Guidewire ClaimCenter integration as IAG — shared integration reduces development cost.",
    targetTimeline: "Year 2 engagement — after IAG pilot validates the concept",
    notes:
      "Commercial lines focus — strong in strata and commercial restoration. Different buyer than residential-focused IAG/Suncorp.",
  },
  {
    name: "Allianz Australia",
    brands: ["Allianz"],
    estimatedMarketShare: "~9% of Australian general insurance market",
    claimsSystem: "Proprietary + Guidewire transition",
    engagementPriority: 2,
    entryPoint:
      "Allianz Supplier Portal; restoration panel manager via Allianz Procurement",
    pilotStatus: "TARGET",
    apiIntegrationPath:
      "Transitioning to Guidewire — timing-dependent. Target post-transition for cleaner integration.",
    targetTimeline: "Year 2 engagement — watch Guidewire transition timing",
    notes:
      "Allianz VIC had active mould protocol changes after 2022 storm season — potential warm reception to standardised mould reporting.",
  },
];

/**
 * The 5-step insurer adoption pathway
 * This replaces the "network effect" assumption in v1.0
 */
export const INSURER_ADOPTION_PATHWAY = [
  {
    step: 1,
    phase: "Phase 2 Pilot",
    action:
      "Include at least one Priority 1 insurer (IAG or Suncorp) as a non-binding observer",
    deliverable:
      "Insurer technical contact observes adjuster review sessions with NIR vs. non-NIR reports. Timed sessions.",
    successCriteria:
      "Insurer observer provides written summary of observations (positive or constructive)",
  },
  {
    step: 2,
    phase: "Phase 3 Launch",
    action:
      "Distribute formal NIR Insurer Briefing Document to Priority 1 insurers",
    deliverable:
      "Insurer ROI case formatted as claims efficiency analysis — not a vendor pitch. Leads with their per-claim saving hypothesis and pilot data.",
    successCriteria:
      "Meeting secured with IAG or Suncorp claims transformation team",
  },
  {
    step: 3,
    phase: "Phase 3 Launch",
    action:
      "Publish Guidewire ClaimCenter integration guide as open documentation",
    deliverable:
      "Technical integration guide published at docs.restoreassist.com.au/integrations/guidewire",
    successCriteria:
      "Insurer technical team can begin feasibility assessment without RestoreAssist resource",
  },
  {
    step: 4,
    phase: "Phase 4 Growth",
    action: "Submit NIR format proposal to ICA Claims Working Group",
    deliverable:
      "Formal ICA working group submission — NIR as candidate for voluntary Australian industry standard",
    successCriteria:
      "ICA working group acknowledges submission and includes on agenda",
  },
  {
    step: 5,
    phase: "Phase 4 Growth",
    action: "NIBA engagement — National Insurance Brokers Association",
    deliverable: "Broker-facing briefing on how NIR speeds their client claims",
    successCriteria: "NIBA newsletter feature or broker webinar participation",
  },
] as const;

/**
 * Get engagement priority target list
 */
export function getPriorityInsurerTargets(
  priority: 1 | 2 | 3,
): InsurerProfile[] {
  return INSURER_ENGAGEMENT_MAP.filter(
    (i) => i.engagementPriority === priority,
  );
}
