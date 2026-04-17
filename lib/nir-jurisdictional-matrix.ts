/**
 * NIR Jurisdictional Matrix — Making "National" Real
 *
 * The NIR is called "National" because it handles all Australian jurisdictions.
 * This module replaces the single bullet point "address → state building code"
 * with a full matrix of jurisdiction-specific restoration triggers.
 *
 * Critique addressed: C3 — State building codes treated as one entity
 *
 * Each state entry includes:
 *   - Primary regulatory framework
 *   - Restoration-specific triggers (flood, fire, cyclone, heritage)
 *   - Insurer-specific notes for major local insurers
 *   - NIR engine action for each trigger
 *
 * MAINTENANCE: Review quarterly against NCC amendment releases.
 * Annual review against major insurer protocol updates required.
 */

export interface JurisdictionConfig {
  state: string;
  fullName: string;
  primaryCode: string;
  /** NZ only - NZBC clause references (NZBS E2, E3, F2, NZS 3604) */
  nzBuildingCodeRef?: string;
  regulatoryBody: string;
  triggers: JurisdictionTrigger[];
  insurerNotes: InsurerNote[];
  climaticZone: string;
  nirEngineFlags: string[];
  lastReviewed: string;
  nextReviewDue: string;
}

export interface JurisdictionTrigger {
  triggerType:
    | "flood"
    | "cyclone"
    | "bushfire"
    | "heritage"
    | "asbestos"
    | "hazmat"
    | "structural"
    | "seismic"
    | "volcanic";
  condition: string;
  regulationRef: string;
  requiredAction: string;
  scopeImpact: string;
}

export interface InsurerNote {
  insurer: string;
  protocolNote: string;
  preApprovalThreshold?: string;
}

export const JURISDICTIONAL_MATRIX: Record<string, JurisdictionConfig> = {
  QLD: {
    state: "QLD",
    fullName: "Queensland",
    primaryCode:
      "NCC 2022 + Queensland Building Act 1975 + QLD Development Code MP 3.5",
    regulatoryBody: "Queensland Building and Construction Commission (QBCC)",
    climaticZone:
      "Subtropical to tropical. High humidity baseline materially affects drying calculations.",
    triggers: [
      {
        triggerType: "flood",
        condition:
          "Property in QLD flood zone (Brisbane River, SEQ, North QLD catchments)",
        regulationRef:
          "QLD Development Code MP 3.5 — Flood Resilient Residential Construction",
        requiredAction:
          "Flood resilience requirements apply to all replacement materials. Must meet current code, not original specification.",
        scopeImpact:
          "Material substitution required — non-flood-resilient materials cannot be reinstated like-for-like.",
      },
      {
        triggerType: "asbestos",
        condition: "Building constructed pre-1990",
        regulationRef: "Work Health and Safety Regulation 2011 (QLD) §§419–431",
        requiredAction:
          "Asbestos assessment required before any demolition or material removal.",
        scopeImpact:
          "Asbestos management plan may be required. Licensed removalist if friable asbestos found.",
      },
      {
        triggerType: "structural",
        condition: "Subfloor affected — QLD high-set timber construction",
        regulationRef:
          "QBCC Minimum Standards — Subfloor moisture requirements",
        requiredAction:
          "Subfloor moisture assessment required. Ventilation assessment if moisture present >48 hrs.",
        scopeImpact:
          "Subfloor ventilation works may be required as part of scope.",
      },
    ],
    insurerNotes: [
      {
        insurer: "Suncorp / AAMI / GIO",
        protocolNote:
          "QLD flood events: Suncorp has a dedicated QLD storm and flood assessment protocol. Pre-approval required for scope >$15k AUD.",
        preApprovalThreshold: "$15,000 AUD",
      },
      {
        insurer: "RACQ",
        protocolNote:
          "RACQ QLD requires a separate flood vs. storm surge classification. Confirm water source category before submitting.",
      },
    ],
    nirEngineFlags: [
      "QLD_FLOOD_ZONE_CHECK",
      "QLD_PRE1990_ASBESTOS_TRIGGER",
      "QLD_HIGHSET_SUBFLOOR_CHECK",
      "QLD_HUMID_DRYING_ADJUSTMENT",
    ],
    lastReviewed: "2026-03",
    nextReviewDue: "2026-06",
  },

  NSW: {
    state: "NSW",
    fullName: "New South Wales",
    primaryCode:
      "NCC 2022 + NSW Environmental Planning and Assessment Act 1979 + NSW State Environmental Planning Policy",
    regulatoryBody:
      "NSW Fair Trading (residential) / NSW Building Commission (from 2023)",
    climaticZone:
      "Temperate to subtropical. Coastal humidity, inland arid variance.",
    triggers: [
      {
        triggerType: "bushfire",
        condition: "Property in NSW Bushfire Prone Land zone",
        regulationRef: "NSW Planning for Bush Fire Protection 2019",
        requiredAction:
          "Bushfire Attack Level (BAL) assessment required for post-fire restoration. Replacement materials must meet BAL rating.",
        scopeImpact:
          "Cannot reinstate non-BAL-rated materials in BAL zone — scope must specify BAL-compliant replacements.",
      },
      {
        triggerType: "flood",
        condition: "Property in NSW flood planning area",
        regulationRef:
          "NSW Flood-prone Land Policy + Local Environmental Plans",
        requiredAction:
          "Distinguish flood vs. stormwater source. Insurance coverage differs.",
        scopeImpact:
          "Stormwater damage vs. flood damage affects scope approval pathway for IAG NSW.",
      },
      {
        triggerType: "asbestos",
        condition: "Building constructed pre-1987",
        regulationRef: "NSW Work Health and Safety Regulation 2017",
        requiredAction:
          "Asbestos assessment required. Different pre-1987 (not pre-1990) cutoff to QLD.",
        scopeImpact: "Asbestos register required for any commercial property.",
      },
    ],
    insurerNotes: [
      {
        insurer: "IAG / NRMA",
        protocolNote:
          "IAG NSW: specific assessor protocols for stormwater vs. storm surge distinction. Affects claim category and coverage.",
      },
    ],
    nirEngineFlags: [
      "NSW_BUSHFIRE_PRONE_LAND_CHECK",
      "NSW_BAL_RATING_LOOKUP",
      "NSW_FLOOD_PLANNING_AREA_CHECK",
      "NSW_PRE1987_ASBESTOS_TRIGGER",
    ],
    lastReviewed: "2026-03",
    nextReviewDue: "2026-06",
  },

  VIC: {
    state: "VIC",
    fullName: "Victoria",
    primaryCode:
      "NCC 2022 + Victorian Building Act 1993 + Building Regulations 2018",
    regulatoryBody: "Victorian Building Authority (VBA)",
    climaticZone:
      "Temperate. Cool/wet winters, dry summers. Bushfire interface zones in ranges.",
    triggers: [
      {
        triggerType: "bushfire",
        condition:
          "Property in Bushfire Management Overlay (BMO) or Wildfire Management Overlay (WMO)",
        regulationRef:
          "Victorian Building Regulations 2018 — Part 3.7 (Bushfire)",
        requiredAction:
          "BAL rating assessment for post-fire works. Materials must meet BAL rating of original or current code (whichever is higher).",
        scopeImpact:
          "Material specification affected — must confirm BAL rating before pricing materials.",
      },
      {
        triggerType: "structural",
        condition: "Subfloor affected — VIC cool climate + timber construction",
        regulationRef:
          "Victorian Building Authority — Subfloor ventilation standards",
        requiredAction:
          "Extended drying timeline in cool climate. Standard 48–72 hour timeline may need extension.",
        scopeImpact:
          "Drying timeline and equipment duration scope items may be longer than national baseline.",
      },
    ],
    insurerNotes: [
      {
        insurer: "Allianz Australia",
        protocolNote:
          "Allianz VIC has specific mould assessment criteria for properties affected in 2022 storm season. Refer to Allianz VIC claims portal for current protocol.",
      },
    ],
    nirEngineFlags: [
      "VIC_BMO_WMO_CHECK",
      "VIC_BAL_RATING_LOOKUP",
      "VIC_COOL_CLIMATE_DRYING_EXTENSION",
      "VIC_PRE1990_ASBESTOS_TRIGGER",
    ],
    lastReviewed: "2026-03",
    nextReviewDue: "2026-06",
  },

  WA: {
    state: "WA",
    fullName: "Western Australia",
    primaryCode:
      "NCC 2022 + WA Building Act 2011 + WA Building Regulations 2012",
    regulatoryBody: "Western Australian Building Commission (WABC)",
    climaticZone:
      "Diverse: arid inland, Mediterranean southwest, tropical north. Cyclone zones C/D in Pilbara/Kimberley.",
    triggers: [
      {
        triggerType: "cyclone",
        condition:
          "Property in WA Wind Region C or D (Pilbara, Kimberley, Gascoyne)",
        regulationRef:
          "AS/NZS 1170.2 Wind Actions — Region C and D requirements",
        requiredAction:
          "Post-cyclone structural restoration must meet W50/W55 wind region requirements, not original build specification if original predates current code.",
        scopeImpact:
          "Structural elements (roof, walls, windows) require cyclone-rated replacements in Region C/D.",
      },
      {
        triggerType: "structural",
        condition:
          "Arid climate (inland WA) — moisture readings require different baseline",
        regulationRef: "IICRC S500 §12.4 — ambient-adjusted drying targets",
        requiredAction:
          "Adjust drying targets for very low ambient humidity (inland WA). Standard RH targets may be unachievable — document site conditions.",
        scopeImpact:
          "Drying target documentation must reflect local ambient conditions, not national defaults.",
      },
    ],
    insurerNotes: [
      {
        insurer: "RAC WA",
        protocolNote:
          "RAC WA requires specific northern WA cyclone damage assessment protocol. Structural engineering report may be required for Cat 3+ cyclone events.",
      },
    ],
    nirEngineFlags: [
      "WA_CYCLONE_ZONE_CHECK",
      "WA_WIND_REGION_CD_TRIGGER",
      "WA_ARID_DRYING_ADJUSTMENT",
      "WA_PRE1990_ASBESTOS_TRIGGER",
    ],
    lastReviewed: "2026-03",
    nextReviewDue: "2026-06",
  },

  SA: {
    state: "SA",
    fullName: "South Australia",
    primaryCode:
      "NCC 2022 + SA Development Act 1993 + Development Regulations 2008",
    regulatoryBody: "South Australian Building Commission (SABC)",
    climaticZone: "Mediterranean to arid. Hot dry summers, mild winters.",
    triggers: [
      {
        triggerType: "heritage",
        condition:
          "Property on South Australian Heritage Register or in Heritage Area",
        regulationRef: "Heritage Places Act 1993 (SA)",
        requiredAction:
          "Heritage Council SA approval required before demolition of any fabric. Materials must match heritage specification.",
        scopeImpact:
          "Standard replacement materials not permitted — heritage-matched materials required. May require Heritage SA consultation.",
      },
    ],
    insurerNotes: [
      {
        insurer: "CGU / IAG SA",
        protocolNote:
          "CGU SA requires heritage building flag on submission. Scope approval may be delayed pending Heritage SA response.",
      },
    ],
    nirEngineFlags: [
      "SA_HERITAGE_REGISTER_CHECK",
      "SA_PRE1990_ASBESTOS_TRIGGER",
    ],
    lastReviewed: "2026-03",
    nextReviewDue: "2026-06",
  },

  TAS: {
    state: "TAS",
    fullName: "Tasmania",
    primaryCode: "NCC 2022 + Tasmanian Building Act 2016",
    regulatoryBody: "Tasmanian Building Services Authority (TBSA)",
    climaticZone:
      "Cool temperate. High timber construction prevalence. Extended drying timelines required.",
    triggers: [
      {
        triggerType: "structural",
        condition: "Timber construction in cool/wet climate",
        regulationRef: "IICRC S500 §12.4 + TBSA moisture requirements",
        requiredAction:
          "Extended drying timeline required for timber structures. Standard 48–72 hrs insufficient in Tasmanian climate.",
        scopeImpact:
          "Drying equipment duration items in scope must reflect Tasmanian climate adjustment.",
      },
    ],
    insurerNotes: [
      {
        insurer: "AAMI Tasmania",
        protocolNote:
          "Standard national AAMI protocols apply. No state-specific deviation noted as at March 2026.",
      },
    ],
    nirEngineFlags: [
      "TAS_COOL_CLIMATE_DRYING_EXTENSION",
      "TAS_TIMBER_MOISTURE_ADJUSTMENT",
    ],
    lastReviewed: "2026-03",
    nextReviewDue: "2026-06",
  },

  NT: {
    state: "NT",
    fullName: "Northern Territory",
    primaryCode: "NCC 2022 + NT Building Act + Cyclone Wind Region D",
    regulatoryBody: "NT Building Control",
    climaticZone:
      "Tropical. High humidity baseline year-round. Cyclone season Oct–Apr. Wind Region C/D throughout.",
    triggers: [
      {
        triggerType: "cyclone",
        condition: "All NT properties in cyclone wind regions",
        regulationRef:
          "AS/NZS 1170.2 Wind Actions — NT Wind Region C/D throughout territory",
        requiredAction:
          "All structural restoration in NT must meet cyclone-rated specifications.",
        scopeImpact:
          "No standard non-cyclone-rated material can be used for structural restoration anywhere in NT.",
      },
      {
        triggerType: "structural",
        condition:
          "Tropical climate — humidity baseline fundamentally changes drying calculations",
        regulationRef: "IICRC S500 §12.4 — ambient-adjusted drying targets",
        requiredAction:
          'NT ambient RH is 70–90% in wet season. Drying target of "match ambient" means different thresholds than southern states.',
        scopeImpact:
          "Document ambient conditions. Drying target may require dehumidification to achieve even if ambient is very high.",
      },
    ],
    insurerNotes: [
      {
        insurer: "NT-specific insurers",
        protocolNote:
          "NT-specific insurers require 24-hour re-inspection cycle for Category 3 water events. Factor into scheduling scope.",
      },
    ],
    nirEngineFlags: [
      "NT_CYCLONE_WIND_REGION_CD_ALL",
      "NT_TROPICAL_DRYING_ADJUSTMENT",
      "NT_24HR_REINSPECTION_CYCLE",
    ],
    lastReviewed: "2026-03",
    nextReviewDue: "2026-06",
  },

  ACT: {
    state: "ACT",
    fullName: "Australian Capital Territory",
    primaryCode:
      "NCC 2022 + ACT Building Act 2004 + ACT Planning and Development Act 2007",
    regulatoryBody: "ACT Planning and Land Authority",
    climaticZone:
      "Temperate. Cool winters, warm summers. Bushfire interface zones in rural-urban fringe.",
    triggers: [
      {
        triggerType: "bushfire",
        condition:
          "Property in ACT bushfire-prone areas (Tuggeranong, Weston Creek, Molonglo Valley fringe)",
        regulationRef: "ACT Planning — Bushfire management requirements",
        requiredAction:
          "BAL assessment for post-fire restoration. Materials must meet BAL rating.",
        scopeImpact: "BAL-rated materials required in designated zones.",
      },
    ],
    insurerNotes: [
      {
        insurer: "Standard national insurers",
        protocolNote:
          "Standard national insurer protocols apply for ACT. No known ACT-specific deviations as at March 2026.",
      },
    ],
    nirEngineFlags: [
      "ACT_BUSHFIRE_PRONE_AREA_CHECK",
      "ACT_BAL_LOOKUP",
      "ACT_PRE1990_ASBESTOS_TRIGGER",
    ],
    lastReviewed: "2026-03",
    nextReviewDue: "2026-06",
  },
};
// ─────────────────────────────────────────────────────────────────────────────
// NEW ZEALAND JURISDICTIONAL MATRIX
//
// All 16 NZ regions share these national regulatory foundations:
//   - NZBC E2 (External Moisture) - external water ingress scope
//   - NZBC E3 (Internal Moisture) - drying and condensation scope
//   - NZBC F2 (Hazardous Building Materials) - ACM/asbestos (pre-2000 buildings)
//   - NZS 3604:2011 - Timber-framed buildings (dominant residential standard)
//   - WorkSafe NZ - single national safety regulator (HSWA 2015)
//
// Region-specific triggers layer on top of those national defaults.
// NZ insurer notes use IAG NZ (State/AMI), Vero NZ, Tower, and EQC.
//
// MAINTENANCE: Review annually against MBIE building code amendments and
// WorkSafe NZ guidance updates.
// ─────────────────────────────────────────────────────────────────────────────

const NZ_PRIMARY_CODE =
  "New Zealand Building Code (NZBC) + Health and Safety at Work Act 2015";

const NZ_BUILDING_CODE_REF =
  "NZBC E2 (External Moisture) + NZBC E3 (Internal Moisture) + NZBC F2 (Hazardous Building Materials) + NZS 3604:2011 (Timber-framed buildings)";

const NZ_REGULATORY_BODY = "WorkSafe New Zealand (national regulator)";

const NZ_ASBESTOS_TRIGGER: JurisdictionTrigger = {
  triggerType: "asbestos",
  condition: "Building constructed pre-2000 (NZ phase-out later than AU)",
  regulationRef:
    "NZBC F2 (Hazardous Building Materials) + WorkSafe NZ Asbestos Regulations 2016",
  requiredAction:
    "Asbestos assessment required before any demolition or material removal. Licensed removalist required for friable ACM.",
  scopeImpact:
    "Pre-2000 NZ buildings have higher ACM probability than AU equivalent. Asbestos management plan required before scope is finalised.",
};

const NZ_TIMBER_FRAMING_TRIGGER: JurisdictionTrigger = {
  triggerType: "structural",
  condition:
    "Timber-framed construction affected by water (dominant NZ residential type)",
  regulationRef: "NZS 3604:2011 - Timber-framed buildings",
  requiredAction:
    "Moisture content readings required in all affected framing members. Drying validation against NZS 3604 moisture limits required before reinstatement.",
  scopeImpact:
    "Scope must include timber moisture validation. Replacement framing must meet NZS 3604 specifications.",
};

export const NZ_JURISDICTIONAL_MATRIX: Record<string, JurisdictionConfig> = {
  "NZ-AUK": {
    state: "NZ-AUK",
    fullName: "Auckland",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Warm humid temperate. High annual rainfall (1,200mm+). Periodic flooding from Waitemataa, Manukau, and Whau catchments.",
    triggers: [
      {
        triggerType: "flood",
        condition:
          "Property in Auckland flood-prone zone (Waitemataa, Manukau, Whau catchments)",
        regulationRef:
          "Auckland Unitary Plan - Flood Sensitive Area overlay + NZBC E1 (Surface Water)",
        requiredAction:
          "Confirm flood source category (overland flow vs river flood vs coastal inundation). Auckland Council flood viewer required pre-scope.",
        scopeImpact:
          "Flood-resilient replacement materials required in flood-sensitive overlays. Council may require consent for reinstatement works.",
      },
      {
        triggerType: "heritage",
        condition:
          "Property in Auckland heritage area (Notable Heritage Place or Scheduled Heritage Item)",
        regulationRef:
          "Auckland Unitary Plan - Historic Heritage overlay (Schedule 14)",
        requiredAction:
          "Heritage approval required before demolition of fabric. Materials must match heritage specification. Auckland Council heritage team may require independent assessment.",
        scopeImpact:
          "Standard replacement materials not permitted in heritage-scheduled properties. Scope approval timeline extended.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "IAG NZ Auckland: pre-approval required for scope exceeding NZD $15,000. Flood events require flood source classification before lodgement.",
        preApprovalThreshold: "NZD $15,000",
      },
      {
        insurer: "Vero NZ",
        protocolNote:
          "Vero NZ requires weather-tightness pre-assessment on properties built 1992-2004 (leaky building era). Flag on initial report if construction date falls in this range.",
      },
    ],
    nirEngineFlags: [
      "NZ_AUK_FLOOD_ZONE_CHECK",
      "NZ_AUK_HERITAGE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_LEAKY_HOME_ERA_CHECK_1992_2004",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-WKO": {
    state: "NZ-WKO",
    fullName: "Waikato",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Warm temperate. Waikato River basin flood risk. Central Plateau southern boundary includes volcanic influence (Ruapehu/Tongariro).",
    triggers: [
      {
        triggerType: "flood",
        condition:
          "Property in Waikato River floodplain or low-lying catchment area",
        regulationRef:
          "Waikato Regional Council - Waikato Regional Policy Statement (flood management provisions)",
        requiredAction:
          "Waikato River flood plain check required. Regional Council inundation mapping to be referenced before scope.",
        scopeImpact:
          "Flood-resilient materials required in designated floodplain areas. Scope must confirm water source category.",
      },
      {
        triggerType: "volcanic",
        condition:
          "Property in southern Waikato affected by volcanic ash (Ruapehu/Tongariro volcanic hazard zone)",
        regulationRef:
          "GNS Science Volcanic Hazard Assessment - Waikato southern boundary/Central Plateau",
        requiredAction:
          "Ash contamination assessment required. HVAC systems require decontamination protocol. Structural loading from ash accumulation to be assessed.",
        scopeImpact:
          "Ash removal and decontamination scope items required. HVAC scope extended for filter replacement and duct cleaning.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "Standard IAG NZ national protocol applies. Volcanic ash events require GNS hazard classification reference in report.",
      },
    ],
    nirEngineFlags: [
      "NZ_WKO_FLOOD_ZONE_CHECK",
      "NZ_WKO_VOLCANIC_ASH_TRIGGER",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-CAN": {
    state: "NZ-CAN",
    fullName: "Canterbury",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Temperate continental. Canterbury Plains. High seismic risk - Christchurch fault system. Post-2011 earthquake rebuild context.",
    triggers: [
      {
        triggerType: "seismic",
        condition:
          "Property in Canterbury seismic hazard zone (NZS 1170.5 Zone Factor 0.3 - Christchurch/surrounding fault system)",
        regulationRef:
          "NZS 1170.5:2004 (Structural Design Actions - Earthquake) + Canterbury Earthquake Recovery Act 2011 (historic context)",
        requiredAction:
          "Structural engineering assessment required for any water damage affecting structural elements. Post-earthquake foundation damage must be ruled out before water restoration scope is finalised.",
        scopeImpact:
          "Cannot scope structural reinstatement without earthquake damage clearance from licensed engineer. EQC (Toka Tu Ake) history check required for properties damaged in 2010-2011 sequence.",
      },
      {
        triggerType: "flood",
        condition:
          "Property in Canterbury flood-prone area (Waimakariri, Selwyn, Rakaia River plains)",
        regulationRef:
          "Environment Canterbury (ECan) - Canterbury Regional Policy Statement flood provisions",
        requiredAction:
          "ECan flood hazard mapping required. Post-earthquake altered drainage patterns increase flood risk in some Christchurch suburbs.",
        scopeImpact:
          "Post-earthquake land status (TC1/TC2/TC3) may affect reinstatement scope and insurer obligations.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "Toka Tu Ake EQC",
        protocolNote:
          "All Canterbury properties with pre-existing EQC claims must have EQC history confirmed before submitting water damage scope. Overlap with unresolved earthquake damage affects coverage determination.",
      },
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "IAG NZ Canterbury: seismic co-damage assessment protocol applies. Pre-approval required for any structural scope item.",
      },
    ],
    nirEngineFlags: [
      "NZ_CAN_SEISMIC_ZONE_HIGH",
      "NZ_CAN_EQC_HISTORY_CHECK",
      "NZ_CAN_TC_LAND_STATUS_CHECK",
      "NZ_CAN_FLOOD_ZONE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-OTA": {
    state: "NZ-OTA",
    fullName: "Otago",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Temperate to subalpine. Central Otago is semi-arid; coastal Dunedin is cool and wet. Extended drying timelines in cool/damp conditions.",
    triggers: [
      {
        triggerType: "structural",
        condition:
          "Cool, damp coastal climate (Dunedin/Clutha coastal areas) - extended drying required",
        regulationRef:
          "IICRC S500:2021 §12.4 - ambient-adjusted drying targets + NZBC E3 (Internal Moisture)",
        requiredAction:
          "Drying timeline must be extended beyond national baseline for Dunedin/coastal Otago conditions. Document ambient temperature and RH at each inspection.",
        scopeImpact:
          "Equipment hire duration items must reflect Otago coastal climate. Standard 48-72 hour timelines insufficient in winter months.",
      },
      {
        triggerType: "structural",
        condition:
          "Semi-arid Central Otago interior - low ambient humidity requires drying target adjustment",
        regulationRef:
          "IICRC S500:2021 §12.4 - ambient-adjusted drying targets",
        requiredAction:
          "Drying targets must reflect very low ambient RH in Central Otago. Document site conditions.",
        scopeImpact:
          "Drying documentation must reflect local ambient, not national defaults. Arid interior differs significantly from coastal Dunedin.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "Tower NZ",
        protocolNote:
          "Tower NZ Otago: standard national protocol applies. No known Otago-specific deviation as at April 2026.",
      },
    ],
    nirEngineFlags: [
      "NZ_OTA_COOL_CLIMATE_DRYING_EXTENSION",
      "NZ_OTA_ARID_INTERIOR_ADJUSTMENT",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-TKI": {
    state: "NZ-TKI",
    fullName: "Taranaki",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Warm temperate, high rainfall. Mt Taranaki (2,518m) is an active stratovolcano - dormant but with documented hazard assessments.",
    triggers: [
      {
        triggerType: "volcanic",
        condition:
          "Property within Mt Taranaki volcanic hazard zone (GNS Science hazard mapping - lahar, ash fall, ballistic zones)",
        regulationRef:
          "GNS Science Volcanic Hazard Assessment - Mt Taranaki + Taranaki Regional Council Civil Defence Volcanic Hazard Plan",
        requiredAction:
          "Volcanic hazard zone designation must be confirmed before scope. Lahar inundation paths and ashfall zones require separate assessment. Post-eruption restoration scope must include decontamination protocol.",
        scopeImpact:
          "Ash and lahar contamination scope items required. Structural assessment for ash loading required on roofs. HVAC decontamination mandatory.",
      },
      {
        triggerType: "flood",
        condition:
          "High annual rainfall - local stream flooding in New Plymouth and surrounds",
        regulationRef:
          "Taranaki Regional Council - Regional Policy Statement (flood management)",
        requiredAction:
          "Confirm flood source category. High base rainfall means pre-existing moisture levels are elevated - adjust drying baseline accordingly.",
        scopeImpact:
          "Elevated ambient moisture in Taranaki may extend drying timelines. Document site ambient at commencement.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "IAG NZ Taranaki: volcanic hazard events trigger specialist assessment protocol. Do not submit restoration scope for volcanic-source events without GNS hazard classification.",
      },
    ],
    nirEngineFlags: [
      "NZ_TKI_VOLCANIC_HAZARD_ZONE_CHECK",
      "NZ_TKI_LAHAR_PATH_CHECK",
      "NZ_TKI_HIGH_RAINFALL_AMBIENT_ADJUSTMENT",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-STL": {
    state: "NZ-STL",
    fullName: "Southland",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Cool temperate to subalpine. NZ's coldest region. High precipitation, extended winter drying timelines. Fiordland receives extreme rainfall.",
    triggers: [
      {
        triggerType: "structural",
        condition:
          "Cold, wet climate - extended drying timelines mandatory across all Southland property types",
        regulationRef:
          "IICRC S500:2021 §12.4 + NZBC E3 (Internal Moisture) - ambient-adjusted drying targets",
        requiredAction:
          "Drying timelines must be extended for Southland conditions. Minimum 20% additional equipment duration over national baseline in winter months. Ambient temperature and RH documented at every inspection.",
        scopeImpact:
          "Equipment duration scope items materially longer than national average. Scope must justify drying duration with documented readings.",
      },
      {
        triggerType: "flood",
        condition:
          "Fiordland and Southland coastal flooding from Waiau, Oreti, and Mataura River systems",
        regulationRef:
          "Environment Southland - Regional Policy Statement (flood hazard provisions)",
        requiredAction:
          "Environment Southland flood hazard mapping required pre-scope. Extreme rainfall events in Fiordland can affect downstream Southland Plains rapidly.",
        scopeImpact:
          "Flood source classification required. Rapid inundation events may result in Category 3 water classification.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "Vero NZ",
        protocolNote:
          "Vero NZ Southland: extended drying timelines are expected and pre-approved for winter events. Include ambient data readings in all progress reports.",
      },
    ],
    nirEngineFlags: [
      "NZ_STL_EXTREME_COLD_DRYING_EXTENSION",
      "NZ_STL_FLOOD_ZONE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-MWT": {
    state: "NZ-MWT",
    fullName: "Manawatu-Whanganui",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Temperate. Manawatu River flood plain (Palmerston North/Feilding). Southern boundary includes Tongariro/Ruapehu volcanic influence.",
    triggers: [
      {
        triggerType: "flood",
        condition:
          "Property in Manawatu River floodplain (Palmerston North, Feilding, Foxton Beach)",
        regulationRef:
          "Horizons Regional Council - One Plan (Regional Policy Statement, flood hazard provisions)",
        requiredAction:
          "Horizons Regional Council flood hazard mapping required. Manawatu River has significant flood history - confirm stopbank proximity and overland flow paths.",
        scopeImpact:
          "Flood-resilient materials required in floodplain areas. Category of water (river flood vs stormwater) to be confirmed before scope approval.",
      },
      {
        triggerType: "volcanic",
        condition:
          "Southern Manawatu-Whanganui boundary properties affected by Ruapehu/Tongariro volcanic hazard",
        regulationRef:
          "GNS Science Volcanic Hazard Assessment - Ruapehu and Tongariro volcanic systems",
        requiredAction:
          "Volcanic hazard zone check for southern region properties. Lahar paths from Ruapehu affect Whanganui River tributaries. Ashfall decontamination protocol required for eruption events.",
        scopeImpact:
          "Ash and lahar contamination adds scope items. Structural loading from ash on roofs must be assessed.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "IAG NZ Manawatu: Manawatu River flood events require flood source classification. Pre-approval threshold NZD $15,000 applies.",
        preApprovalThreshold: "NZD $15,000",
      },
    ],
    nirEngineFlags: [
      "NZ_MWT_FLOOD_ZONE_CHECK",
      "NZ_MWT_VOLCANIC_HAZARD_TRIGGER",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-NSN": {
    state: "NZ-NSN",
    fullName: "Nelson",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Sunny temperate. Top of South Island. Moderate seismic zone. Tasman Sea exposure means periodic wind-driven rain events.",
    triggers: [
      {
        triggerType: "seismic",
        condition:
          "Property in Nelson moderate seismic zone (NZS 1170.5 Zone Factor ~0.22 - Waimea Fault and regional fault system)",
        regulationRef:
          "NZS 1170.5:2004 (Structural Design Actions - Earthquake)",
        requiredAction:
          "For water damage affecting structural elements, confirm no seismic co-damage. Licensed engineer assessment recommended for any cracking observed.",
        scopeImpact:
          "Structural restoration scope must include seismic co-damage clearance where cracks or movement are observed.",
      },
      {
        triggerType: "flood",
        condition:
          "Coastal and river flood risk - Nelson Haven, Maitai River, Waimea Inlet",
        regulationRef:
          "Nelson City Council / Tasman District Council - Regional Policy Statement flood provisions",
        requiredAction:
          "Council flood mapping required for properties near Maitai River or Nelson Haven. Wind-driven rain from Tasman Sea can cause sudden flash events.",
        scopeImpact:
          "Confirm water source category. Flash flooding events may result in Category 2 or 3 classification.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "Tower NZ",
        protocolNote:
          "Tower NZ Nelson: standard national protocol. Flag seismic co-damage potential on structural scope items.",
      },
    ],
    nirEngineFlags: [
      "NZ_NSN_SEISMIC_ZONE_MODERATE",
      "NZ_NSN_FLOOD_ZONE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-TAS": {
    state: "NZ-TAS",
    fullName: "Tasman",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Temperate. Abel Tasman coastal exposure. Moderate seismic zone. High annual sunshine - lower ambient moisture than West Coast neighbour.",
    triggers: [
      {
        triggerType: "seismic",
        condition:
          "Property in Tasman moderate seismic zone (NZS 1170.5 Zone Factor ~0.22 - regional fault system)",
        regulationRef:
          "NZS 1170.5:2004 (Structural Design Actions - Earthquake)",
        requiredAction:
          "Seismic co-damage check required for structural water damage scope. Licensed engineer assessment where cracking or movement observed.",
        scopeImpact:
          "Structural scope requires seismic clearance documentation.",
      },
      {
        triggerType: "flood",
        condition:
          "Coastal storm surge and river flooding (Motueka River, Waimea River, Takaka River valleys)",
        regulationRef:
          "Tasman District Council - District Plan flood provisions",
        requiredAction:
          "Tasman District Council flood hazard maps required pre-scope. Coastal properties at risk of storm surge during high-wind events.",
        scopeImpact:
          "Category of water and flood source to be documented. Salt contamination from coastal inundation extends scope.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "Vero NZ",
        protocolNote:
          "Vero NZ Tasman: coastal storm events - confirm whether salt contamination is present. Salt contamination scope items require specialist protocol.",
      },
    ],
    nirEngineFlags: [
      "NZ_TAS_SEISMIC_ZONE_MODERATE",
      "NZ_TAS_COASTAL_SALT_CONTAMINATION_CHECK",
      "NZ_TAS_FLOOD_ZONE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-MBH": {
    state: "NZ-MBH",
    fullName: "Marlborough",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Temperate, dry sunny. Wairau Plain. High seismic zone - Marlborough Fault System (Hope, Wairau, Awatere faults). NZ's most seismically complex region.",
    triggers: [
      {
        triggerType: "seismic",
        condition:
          "Property in Marlborough seismic zone (NZS 1170.5 Zone Factor 0.4 - Marlborough Fault System, one of NZ's highest seismic hazard zones)",
        regulationRef:
          "NZS 1170.5:2004 (Structural Design Actions - Earthquake) - Marlborough Fault System (Hope, Wairau, Awatere faults)",
        requiredAction:
          "Structural engineering assessment mandatory for any water damage involving structural elements. Seismic co-damage must be explicitly ruled out. Licensed engineer sign-off required before structural scope is finalised.",
        scopeImpact:
          "Structural scope items cannot be finalised without engineer seismic clearance. Scope may be materially altered if earthquake damage is confirmed.",
      },
      {
        triggerType: "flood",
        condition:
          "Wairau Plain flooding (Wairau River, Taylor River - Blenheim urban catchment)",
        regulationRef: "Marlborough District Council - flood hazard provisions",
        requiredAction:
          "MDC flood mapping required. Wairau River has significant flood history - confirm levee and stopbank status for affected properties.",
        scopeImpact:
          "Flood-resilient materials required in floodplain areas. Category of water must be confirmed.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "Toka Tu Ake EQC",
        protocolNote:
          "Marlborough properties - EQC history check mandatory for any structural scope. High frequency of historic EQC claims from Marlborough earthquake sequences (2016 Kaikoura, ongoing aftershock sequence).",
      },
    ],
    nirEngineFlags: [
      "NZ_MBH_SEISMIC_ZONE_HIGH",
      "NZ_MBH_EQC_HISTORY_CHECK",
      "NZ_MBH_FAULT_PROXIMITY_CHECK",
      "NZ_MBH_FLOOD_ZONE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-WTC": {
    state: "NZ-WTC",
    fullName: "West Coast",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Extreme rainfall - up to 8,000mm/year in parts. NZ's highest rainfall region. Persistent high humidity baseline. Extended drying timelines across all property types.",
    triggers: [
      {
        triggerType: "flood",
        condition:
          "Extreme rainfall - virtually all West Coast properties at elevated flood risk year-round",
        regulationRef:
          "West Coast Regional Council - Regional Policy Statement (flood and coastal hazard provisions)",
        requiredAction:
          "Flood risk is the default condition on the West Coast. All restoration scopes must include elevated ambient moisture documentation. Water source category (overland flow, river flood, groundwater) to be confirmed.",
        scopeImpact:
          "Standard drying baselines cannot be applied. Extreme ambient moisture extends all drying timelines materially. Equipment hire duration must be justified with logged readings.",
      },
      {
        triggerType: "structural",
        condition:
          "Persistent extreme humidity - elevated baseline moisture in all structural elements",
        regulationRef:
          "IICRC S500:2021 §12.4 + NZBC E3 (Internal Moisture) - ambient-adjusted drying targets",
        requiredAction:
          "Drying targets must reference local ambient, not national defaults. Persistent 85-95% RH ambient is normal on the West Coast - document site conditions at every inspection. Dehumidification scope items mandatory.",
        scopeImpact:
          "All West Coast scopes require extended equipment duration. Mould assessment mandatory on any water event >24 hours duration.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "IAG NZ West Coast: extended drying timelines pre-approved for all events. Mould scope items expected - include IICRC S520 reference for any mould remediation component.",
      },
      {
        insurer: "Vero NZ",
        protocolNote:
          "Vero NZ West Coast: ambient moisture documentation is mandatory on every progress report. Scope rejection risk if ambient data absent.",
      },
    ],
    nirEngineFlags: [
      "NZ_WTC_EXTREME_RAINFALL_AMBIENT_ADJUSTMENT",
      "NZ_WTC_MANDATORY_MOULD_ASSESSMENT",
      "NZ_WTC_EXTENDED_DRYING_ALL_EVENTS",
      "NZ_WTC_FLOOD_ZONE_UNIVERSAL",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-NTL": {
    state: "NZ-NTL",
    fullName: "Northland",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Subtropical. NZ's northernmost region. High humidity baseline. Ex-tropical cyclone risk. High annual rainfall.",
    triggers: [
      {
        triggerType: "cyclone",
        condition:
          "Ex-tropical cyclone track affecting Northland (documented - Cyclone Gabrielle 2023 impacted northern regions)",
        regulationRef:
          "MetService NZ severe weather advisories + NZS 3604:2011 (wind zone requirements for Northland)",
        requiredAction:
          "Post-cyclone structural assessment required. Wind uplift damage to roofs and cladding to be assessed by licensed building practitioner. Water intrusion from wind-driven rain classified separately from flood source.",
        scopeImpact:
          "Wind-driven rain intrusion scope differs from flood scope. Cladding and roof scope items require separate engineer sign-off if wind uplift suspected.",
      },
      {
        triggerType: "flood",
        condition:
          "High annual rainfall and river flooding - Northern Wairoa, Kaipara, Bay of Islands catchments",
        regulationRef:
          "Northland Regional Council - Regional Policy Statement (flood hazard provisions)",
        requiredAction:
          "NRC flood hazard mapping required. Sub-tropical rainfall intensity means rapid inundation - confirm water category promptly.",
        scopeImpact:
          "Rapid water category confirmation critical. Category 3 classification risk elevated in sub-tropical events.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "IAG NZ Northland: cyclone and ex-tropical cyclone events require MetService event classification in report. Pre-approval required for scope >NZD $15,000.",
        preApprovalThreshold: "NZD $15,000",
      },
    ],
    nirEngineFlags: [
      "NZ_NTL_CYCLONE_TRACK_CHECK",
      "NZ_NTL_HIGH_HUMIDITY_AMBIENT_ADJUSTMENT",
      "NZ_NTL_FLOOD_ZONE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-GIS": {
    state: "NZ-GIS",
    fullName: "Gisborne",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Warm temperate. East Coast exposure. Cyclone Gabrielle (2023) caused severe damage. High rainfall, erosion-prone hill country.",
    triggers: [
      {
        triggerType: "cyclone",
        condition:
          "Ex-tropical cyclone impact - Cyclone Gabrielle (February 2023) caused major damage across Gisborne region",
        regulationRef:
          "MetService NZ severe weather advisories + NZS 3604:2011 (wind zone) + Building Act 2004 (unsafe building declarations)",
        requiredAction:
          "Post-Gabrielle rebuild context: confirm whether property has outstanding cyclone damage assessment or Council unsafe building notice. Do not commence water restoration without structural clearance if Gabrielle damage is suspected.",
        scopeImpact:
          "Gabrielle damage may co-exist with ongoing water damage. Scope must identify and separate cyclone-origin damage from new water event. Insurance stream separation required.",
      },
      {
        triggerType: "flood",
        condition:
          "Gisborne floodplain and hill country erosion flood risk - Waipaoa River catchment",
        regulationRef:
          "Gisborne District Council - District Plan flood and erosion provisions",
        requiredAction:
          "GDC flood and erosion hazard mapping required. Waipaoa River catchment has significant flood and debris flow history.",
        scopeImpact:
          "Confirm water and debris source category. Sediment contamination from hill country floods extends decontamination scope.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "Toka Tu Ake EQC",
        protocolNote:
          "Gisborne - Cyclone Gabrielle claims: confirm EQC/insurer stream assignment before lodging any new water damage claim. Overlap with unresolved Gabrielle claims requires insurer coordination.",
      },
    ],
    nirEngineFlags: [
      "NZ_GIS_CYCLONE_GABRIELLE_DAMAGE_CHECK",
      "NZ_GIS_FLOOD_EROSION_ZONE_CHECK",
      "NZ_GIS_SEDIMENT_CONTAMINATION_TRIGGER",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-HKB": {
    state: "NZ-HKB",
    fullName: "Hawke's Bay",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Warm dry temperate. East Coast. Cyclone Gabrielle (2023) caused catastrophic flooding in Esk Valley and Heretaunga Plains.",
    triggers: [
      {
        triggerType: "cyclone",
        condition:
          "Ex-tropical cyclone impact - Cyclone Gabrielle (February 2023) caused catastrophic damage in Hawke's Bay (Esk Valley, Heretaunga Plains)",
        regulationRef:
          "MetService NZ severe weather advisories + Building Act 2004 (unsafe building declarations) + NZS 3604:2011",
        requiredAction:
          "Post-Gabrielle context: all Hawke's Bay properties in affected zones must have outstanding Gabrielle damage status confirmed. Properties with unsafe building notices cannot have restoration scope commenced without Council clearance.",
        scopeImpact:
          "Insurance stream separation (Gabrielle vs new event) mandatory. Pre-existing Gabrielle damage affects scope boundaries and insurer responsibility.",
      },
      {
        triggerType: "flood",
        condition:
          "Heretaunga Plains flood risk - Ngaruroro, Tutaekuri, and Rakiriri rivers; post-Gabrielle altered flood plain",
        regulationRef:
          "Hawke's Bay Regional Council - Regional Policy Statement (flood hazard) + post-Gabrielle revised flood hazard mapping (2023-2024 updates)",
        requiredAction:
          "Use post-Gabrielle revised HBRC flood hazard mapping (published 2023-2024). Pre-Gabrielle mapping is no longer accurate for Esk Valley and parts of Heretaunga Plains.",
        scopeImpact:
          "Flood resilience requirements in revised flood hazard areas. Materials must meet updated code requirements, not pre-Gabrielle specification.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "Toka Tu Ake EQC",
        protocolNote:
          "Hawke's Bay - Cyclone Gabrielle claims: coordinate with insurer before lodging new water damage claims in Gabrielle-affected zones. EQC Gabrielle claims must be resolved or separated before new event claims proceed.",
      },
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "IAG NZ Hawke's Bay: Gabrielle co-damage protocol remains active (as at April 2026). All structural scope items in Gabrielle zones require pre-approval.",
      },
    ],
    nirEngineFlags: [
      "NZ_HKB_CYCLONE_GABRIELLE_DAMAGE_CHECK",
      "NZ_HKB_POST_GABRIELLE_FLOOD_MAPPING",
      "NZ_HKB_FLOOD_ZONE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-BOP": {
    state: "NZ-BOP",
    fullName: "Bay of Plenty",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Warm subtropical. High rainfall. Tauranga coastal flooding. Active volcanic zone - Rotorua geothermal, Whakaari/White Island offshore volcano.",
    triggers: [
      {
        triggerType: "volcanic",
        condition:
          "Property in Bay of Plenty volcanic hazard zone (Whakaari/White Island active, Okataina volcanic centre, Tarawera fault zone)",
        regulationRef:
          "GNS Science Volcanic Hazard Assessment - Okataina Volcanic Centre + Bay of Plenty Regional Council volcanic hazard planning",
        requiredAction:
          "Volcanic ashfall decontamination protocol required for eruption events. Rotorua geothermal area: check for hydrogen sulfide (H2S) and geothermal chemical contamination before personnel enter. PPE requirements elevated.",
        scopeImpact:
          "Volcanic ash scope items required. Geothermal chemical contamination in Rotorua properties adds hazmat scope. HVAC decontamination mandatory.",
      },
      {
        triggerType: "flood",
        condition:
          "Tauranga and Eastern Bay of Plenty flooding - Wairoa River, Rangitaiki River, Kaituna River catchments",
        regulationRef:
          "Bay of Plenty Regional Council - Regional Policy Statement (flood hazard provisions)",
        requiredAction:
          "BOPRC flood hazard mapping required. Tauranga coastal areas also subject to storm surge risk. Confirm water source category.",
        scopeImpact:
          "Coastal storm surge vs river flood distinction affects coverage pathway. Document water source at initial assessment.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "IAG NZ Bay of Plenty: volcanic events require GNS hazard classification. Rotorua geothermal properties - confirm H2S levels are safe before assessment. Pre-approval required for scope >NZD $15,000.",
        preApprovalThreshold: "NZD $15,000",
      },
    ],
    nirEngineFlags: [
      "NZ_BOP_VOLCANIC_HAZARD_ZONE_CHECK",
      "NZ_BOP_GEOTHERMAL_CONTAMINATION_CHECK",
      "NZ_BOP_FLOOD_ZONE_CHECK",
      "NZ_BOP_COASTAL_STORM_SURGE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },

  "NZ-WGN": {
    state: "NZ-WGN",
    fullName: "Wellington",
    primaryCode: NZ_PRIMARY_CODE,
    nzBuildingCodeRef: NZ_BUILDING_CODE_REF,
    regulatoryBody: NZ_REGULATORY_BODY,
    climaticZone:
      "Windy temperate. Cook Strait exposure. High seismic risk - Wellington Fault runs through urban area. Significant heritage CBD.",
    triggers: [
      {
        triggerType: "seismic",
        condition:
          "Property in Wellington seismic zone (NZS 1170.5 Zone Factor 0.4 - Wellington Fault, one of NZ's highest urban seismic hazard zones)",
        regulationRef:
          "NZS 1170.5:2004 (Structural Design Actions - Earthquake) - Wellington Fault (runs through Wellington urban area)",
        requiredAction:
          "Structural engineering assessment mandatory for any water damage affecting structural elements. Wellington Fault proximity adds risk of unreported seismic damage co-existing with water damage event. Licensed engineer sign-off required before finalising structural scope.",
        scopeImpact:
          "Structural scope cannot be finalised without seismic co-damage clearance. Wellington Fault proximity check required for all structural scope items.",
      },
      {
        triggerType: "heritage",
        condition:
          "Property in Wellington heritage area (Heritage New Zealand Schedule - Wellington CBD and heritage precincts)",
        regulationRef:
          "Heritage New Zealand Pouhere Taonga Act 2014 + Wellington City Council District Plan (heritage provisions)",
        requiredAction:
          "Heritage NZ approval required before demolition of any fabric on listed buildings. Materials must match heritage specification. Wellington City Council heritage officer may require consultation.",
        scopeImpact:
          "Standard replacement materials not permitted in Heritage NZ listed properties. Scope approval timeline extended. Heritage-matched materials required.",
      },
      {
        triggerType: "flood",
        condition:
          "Wellington urban flooding - Hutt River (Upper Hutt/Lower Hutt), coastal storm surge from Cook Strait",
        regulationRef:
          "Greater Wellington Regional Council - Regional Policy Statement (flood hazard) + Wellington City Council coastal hazard provisions",
        requiredAction:
          "GWRC flood mapping required. Cook Strait storm events can cause coastal inundation in Lyall Bay, Island Bay, Miramar. Confirm water source category.",
        scopeImpact:
          "Coastal salt contamination from Cook Strait storm surge adds scope items. Separate from Hutt River flood events.",
      },
      NZ_ASBESTOS_TRIGGER,
      NZ_TIMBER_FRAMING_TRIGGER,
    ],
    insurerNotes: [
      {
        insurer: "Toka Tu Ake EQC",
        protocolNote:
          "Wellington - EQC seismic history check mandatory for all structural scope items. Wellington has high frequency of historic EQC claims. Pre-existing EQC claims must be resolved or separated before water damage scope is finalised.",
      },
      {
        insurer: "IAG NZ (State / AMI)",
        protocolNote:
          "IAG NZ Wellington: seismic co-damage assessment protocol active. Heritage property flag mandatory for listed buildings. Pre-approval required for structural scope items.",
      },
    ],
    nirEngineFlags: [
      "NZ_WGN_SEISMIC_ZONE_HIGH",
      "NZ_WGN_WELLINGTON_FAULT_PROXIMITY_CHECK",
      "NZ_WGN_EQC_HISTORY_CHECK",
      "NZ_WGN_HERITAGE_CHECK",
      "NZ_WGN_COASTAL_SALT_CONTAMINATION_CHECK",
      "NZ_WGN_FLOOD_ZONE_CHECK",
      "NZ_PRE2000_ASBESTOS_TRIGGER",
      "NZ_TIMBER_MOISTURE_VALIDATION",
    ],
    lastReviewed: "2026-04",
    nextReviewDue: "2026-10",
  },
};

/**
 * Combined matrix: AU states + NZ regions
 * AU keyed by state code (e.g. "QLD"), NZ keyed by ISO 3166-2 regional code (e.g. "NZ-WGN")
 */
export const ALL_JURISDICTIONS: Record<string, JurisdictionConfig> = {
  ...JURISDICTIONAL_MATRIX,
  ...NZ_JURISDICTIONAL_MATRIX,
};

/**
 * Get jurisdiction config for a given AU state code (backward-compatible)
 */
export function getJurisdictionConfig(
  stateCode: string,
): JurisdictionConfig | undefined {
  return JURISDICTIONAL_MATRIX[stateCode.toUpperCase()];
}

/**
 * Get jurisdiction config for any supported jurisdiction (AU or NZ).
 * AU: pass state code ("QLD", "NSW", etc.)
 * NZ: pass NZ regional code ("NZ-WGN", "NZ-AUK", etc.)
 */
export function getAllJurisdictionConfig(
  jurisdictionCode: string,
): JurisdictionConfig | undefined {
  return ALL_JURISDICTIONS[jurisdictionCode.toUpperCase()];
}

/**
 * Get all active triggers for a property inspection.
 * Accepts both AU state codes and NZ region codes.
 */
export function getActiveTriggers(
  stateCode: string,
  inspectionContext: {
    isFloodZone?: boolean;
    isBushfireProne?: boolean;
    isCycloneZone?: boolean;
    isHeritageListed?: boolean;
    buildingYearBuilt?: number;
    isSeismicZone?: boolean;
    isVolcanicZone?: boolean;
  },
): JurisdictionTrigger[] {
  const config = getAllJurisdictionConfig(stateCode);
  if (!config) return [];

  return config.triggers.filter((trigger) => {
    switch (trigger.triggerType) {
      case "flood":
        return inspectionContext.isFloodZone;
      case "bushfire":
        return inspectionContext.isBushfireProne;
      case "cyclone":
        return inspectionContext.isCycloneZone;
      case "heritage":
        return inspectionContext.isHeritageListed;
      case "asbestos":
        return inspectionContext.buildingYearBuilt
          ? inspectionContext.buildingYearBuilt < 1990
          : false;
      case "seismic":
        return inspectionContext.isSeismicZone;
      case "volcanic":
        return inspectionContext.isVolcanicZone;
      default:
        return true; // structural and hazmat always apply
    }
  });
}

/**
 * List all supported NZ region codes
 */
export function getNZRegionCodes(): string[] {
  return Object.keys(NZ_JURISDICTIONAL_MATRIX);
}

/**
 * List all supported AU state codes
 */
export function getAUStateCodes(): string[] {
  return Object.keys(JURISDICTIONAL_MATRIX);
}
