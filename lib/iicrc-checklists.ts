export interface ChecklistItem {
  itemType: string;
  description: string;
  quantity: number | null;
  unit: string;
  justification: string;
}

/**
 * RA-867: Expanded category taxonomy to match scope-dispatcher coverage.
 * - water, fire, mould — IICRC S500/S700/S520
 * - storm — ANZRP storm-damage best practice (water ingress, wind, debris)
 * - biohazard — IICRC S540 (trauma scene), CDC/OHS blood-borne pathogens
 */
export type ChecklistCategory =
  | "water"
  | "fire"
  | "mould"
  | "storm"
  | "biohazard";

export interface ChecklistTemplate {
  id: string;
  name: string;
  category: ChecklistCategory;
  damageClass?: string;
  description: string;
  items: ChecklistItem[];
}

export const IICRC_CHECKLISTS: ChecklistTemplate[] = [
  {
    id: "water-cat1-class1",
    name: "Water Cat 1, Class 1 — Clean Water, Limited",
    category: "water",
    damageClass: "1",
    description:
      "Category 1 clean water loss with limited affected area. Minimal absorbent materials wet.",
    items: [
      {
        itemType: "extract_standing_water",
        description: "Extract standing water with portable extractor",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §7.1 — Water extraction",
      },
      {
        itemType: "deploy_air_movers",
        description: "Deploy air movers for evaporative drying",
        quantity: null,
        unit: "units",
        justification: "IICRC S500:2025 §8.3 — Evaporative drying",
      },
      {
        itemType: "monitor_moisture",
        description: "Daily moisture monitoring — record all readings",
        quantity: 1,
        unit: "day",
        justification: "IICRC S500:2025 §11.4 — Drying verification",
      },
      {
        itemType: "document_affected_areas",
        description: "Photograph and document all affected areas",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §4.2 — Documentation",
      },
      {
        itemType: "psychrometric_readings",
        description: "Record psychrometric data (temp/RH/GPP)",
        quantity: 1,
        unit: "day",
        justification: "IICRC S500:2025 §6.3 — Psychrometric monitoring",
      },
    ],
  },
  {
    id: "water-cat2-class2",
    name: "Water Cat 2, Class 2 — Grey Water, Structural",
    category: "water",
    damageClass: "2",
    description:
      "Category 2 grey water loss with significant structural wetting. Significant moisture absorbed into walls and floors.",
    items: [
      {
        itemType: "extract_standing_water",
        description: "Extract standing water with portable extractor",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §7.1 — Water extraction",
      },
      {
        itemType: "deploy_air_movers",
        description: "Deploy air movers for evaporative drying",
        quantity: null,
        unit: "units",
        justification: "IICRC S500:2025 §8.3 — Evaporative drying",
      },
      {
        itemType: "monitor_moisture",
        description: "Daily moisture monitoring — record all readings",
        quantity: 1,
        unit: "day",
        justification: "IICRC S500:2025 §11.4 — Drying verification",
      },
      {
        itemType: "document_affected_areas",
        description: "Photograph and document all affected areas",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §4.2 — Documentation",
      },
      {
        itemType: "psychrometric_readings",
        description: "Record psychrometric data (temp/RH/GPP)",
        quantity: 1,
        unit: "day",
        justification: "IICRC S500:2025 §6.3 — Psychrometric monitoring",
      },
      {
        itemType: "antimicrobial_treatment",
        description:
          "Apply EPA-registered antimicrobial agent to affected surfaces",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §9.1 — Contaminated water remediation",
      },
      {
        itemType: "remove_wet_materials",
        description: "Remove non-salvageable porous materials (carpet, pad)",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S500:2025 §9.2 — Material removal Category 2",
      },
      {
        itemType: "ppe_technician",
        description:
          "Document technician PPE usage (gloves, N95, eye protection)",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §5.1 — Health and safety",
      },
    ],
  },
  {
    id: "water-cat3-class3",
    name: "Water Cat 3, Class 3 — Black Water",
    category: "water",
    damageClass: "3",
    description:
      "Category 3 grossly contaminated water. Requires containment and full remediation protocol.",
    items: [
      {
        itemType: "extract_standing_water",
        description: "Extract standing water with portable extractor",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §7.1 — Water extraction",
      },
      {
        itemType: "deploy_air_movers",
        description: "Deploy air movers for evaporative drying",
        quantity: null,
        unit: "units",
        justification: "IICRC S500:2025 §8.3 — Evaporative drying",
      },
      {
        itemType: "monitor_moisture",
        description: "Daily moisture monitoring — record all readings",
        quantity: 1,
        unit: "day",
        justification: "IICRC S500:2025 §11.4 — Drying verification",
      },
      {
        itemType: "document_affected_areas",
        description: "Photograph and document all affected areas",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §4.2 — Documentation",
      },
      {
        itemType: "psychrometric_readings",
        description: "Record psychrometric data (temp/RH/GPP)",
        quantity: 1,
        unit: "day",
        justification: "IICRC S500:2025 §6.3 — Psychrometric monitoring",
      },
      {
        itemType: "antimicrobial_treatment",
        description:
          "Apply EPA-registered antimicrobial agent to affected surfaces",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §9.1 — Contaminated water remediation",
      },
      {
        itemType: "remove_wet_materials",
        description: "Remove non-salvageable porous materials (carpet, pad)",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S500:2025 §9.2 — Material removal Category 2",
      },
      {
        itemType: "ppe_technician",
        description:
          "Document technician PPE usage (gloves, N95, eye protection)",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §5.1 — Health and safety",
      },
      {
        itemType: "containment_setup",
        description:
          "Establish containment barriers to prevent cross-contamination",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §9.3 — Category 3 containment",
      },
      {
        itemType: "air_scrubber",
        description: "Deploy HEPA air scrubber during remediation",
        quantity: null,
        unit: "units",
        justification: "IICRC S500:2025 §9.3 — Air filtration Category 3",
      },
      {
        itemType: "clearance_testing",
        description: "Obtain post-remediation clearance verification",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §12.1 — Clearance testing",
      },
    ],
  },
  {
    id: "fire-smoke",
    name: "Fire & Smoke",
    category: "fire",
    description:
      "Fire and smoke damage remediation per IICRC S700. Includes structural cleaning and odour control.",
    items: [
      {
        itemType: "assess_char_damage",
        description: "Assess and document structural char damage",
        quantity: 1,
        unit: "job",
        justification: "IICRC S700:2015 §6 — Fire damage assessment",
      },
      {
        itemType: "dry_ice_blast",
        description: "Dry ice blast or HEPA vacuum char residue from structure",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S700:2015 §7.2 — Char cleaning",
      },
      {
        itemType: "ozone_treatment",
        description: "Ozone treatment for smoke odour elimination (unoccupied)",
        quantity: 1,
        unit: "job",
        justification: "IICRC S700:2015 §8 — Odour control",
      },
      {
        itemType: "content_pack_out",
        description: "Pack out and inventory all salvageable contents",
        quantity: 1,
        unit: "job",
        justification: "IICRC S700:2015 §5 — Content management",
      },
      {
        itemType: "soda_blast",
        description:
          "Soda blast or chemical sponge wipe all smoke-affected surfaces",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S700:2015 §7.3 — Surface cleaning",
      },
    ],
  },
  {
    id: "mould-remediation",
    name: "Mould Remediation — IICRC S520",
    category: "mould",
    description:
      "Mould remediation protocol per IICRC S520. Containment, cleaning, and post-remediation testing required.",
    items: [
      {
        itemType: "containment_poly",
        description: "Establish 6-mil poly containment with negative pressure",
        quantity: 1,
        unit: "job",
        justification: "IICRC S520:2015 §6.3 — Mould containment",
      },
      {
        itemType: "hepa_vacuum",
        description: "HEPA vacuum all mould-affected surfaces",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S520:2015 §7.1 — Surface cleaning",
      },
      {
        itemType: "remove_porous_materials",
        description:
          "Remove mould-impacted porous materials (drywall, insulation)",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S520:2015 §7.2 — Material removal",
      },
      {
        itemType: "apply_antimicrobial",
        description: "Apply EPA-registered antimicrobial/fungicide",
        quantity: 1,
        unit: "job",
        justification: "IICRC S520:2015 §7.3 — Biocide application",
      },
      {
        itemType: "clearance_air_test",
        description: "Obtain post-remediation air quality clearance test",
        quantity: 1,
        unit: "job",
        justification: "IICRC S520:2015 §8 — Post-remediation testing",
      },
    ],
  },
  // ─── RA-867: Storm templates ────────────────────────────────────────────────
  {
    id: "storm-wind-damage",
    name: "Storm — Wind Damage & Debris",
    category: "storm",
    description:
      "High-wind event with structural damage, compromised envelope, debris ingress. Priority is make-safe + weatherproofing before restoration.",
    items: [
      {
        itemType: "site_make_safe",
        description:
          "Make-safe: tarp exposed roofs, board-up broken openings, isolate downed services",
        quantity: 1,
        unit: "job",
        justification:
          "AS/NZS 4849.1:2003 §5 — Site make-safe precedes restoration",
      },
      {
        itemType: "debris_clearance",
        description: "Remove storm debris from interior and roof cavity",
        quantity: null,
        unit: "sqm",
        justification: "Safe Work Australia — Manual handling controls",
      },
      {
        itemType: "moisture_reading_baseline",
        description:
          "Baseline moisture readings of structural elements after weatherproofing",
        quantity: 1,
        unit: "day",
        justification: "IICRC S500:2025 §6.3 — Psychrometric monitoring",
      },
      {
        itemType: "document_insurer_scope",
        description:
          "Photograph + annotate all wind/debris damage for insurer claim",
        quantity: 1,
        unit: "job",
        justification: "ICA General Insurance Code of Practice — evidence",
      },
      {
        itemType: "structural_assessment",
        description:
          "Engage structural engineer for compromised framing or roof members",
        quantity: null,
        unit: "job",
        justification:
          "NCC BCA Volume Two §3.1 — Structural adequacy after damage",
      },
    ],
  },
  {
    id: "storm-water-ingress",
    name: "Storm — Water Ingress",
    category: "storm",
    description:
      "Storm-driven water ingress through compromised envelope (roof, windows, eaves). Treated as Category 2 water loss by default — contamination possible from roofing insulation / gutter debris.",
    items: [
      {
        itemType: "extract_standing_water",
        description: "Extract ingress water with portable extractor",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §7.1 — Water extraction",
      },
      {
        itemType: "category_determination",
        description:
          "Classify water category — default to Category 2 unless contamination ruled out",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §10.5.4 — Storm water classification",
      },
      {
        itemType: "deploy_air_movers",
        description: "Deploy air movers + dehumidifiers for structural drying",
        quantity: null,
        unit: "units",
        justification: "IICRC S500:2025 §8.3 — Evaporative drying",
      },
      {
        itemType: "inspect_ceiling_cavity",
        description:
          "Inspect ceiling cavity + insulation for hidden saturation",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §5.2.4 — Hidden moisture",
      },
      {
        itemType: "antimicrobial_treatment",
        description:
          "Apply antimicrobial to surfaces in contact with ingress water",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S500:2025 §12.2 — Antimicrobial application",
      },
    ],
  },
  // ─── RA-867: Biohazard templates ────────────────────────────────────────────
  {
    id: "biohazard-sewage",
    name: "Biohazard — Sewage / Category 3 Water",
    category: "biohazard",
    description:
      "Sewage backup or grossly contaminated water (IICRC Cat 3). Requires PPE, containment, sanitisation, and removal of porous materials. Separate from standard water loss due to pathogen exposure.",
    items: [
      {
        itemType: "ppe_deploy",
        description:
          "Deploy full Level C PPE — suits, respirators, gloves, boots",
        quantity: null,
        unit: "sets",
        justification:
          "Safe Work Australia — Blood-borne pathogens + IICRC S500 Cat 3",
      },
      {
        itemType: "containment_erect",
        description:
          "Erect containment with 200-micron sheeting + negative-air ventilation",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §10.6 — Category 3 containment",
      },
      {
        itemType: "extract_contaminated_water",
        description:
          "Extract contaminated water using dedicated Cat-3-only equipment",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §7.1 — Cat 3 extraction",
      },
      {
        itemType: "remove_porous_materials",
        description:
          "Remove and dispose of porous materials — carpet, underlay, drywall to 300mm above affected line",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S500:2025 §10.6.3 — Porous removal",
      },
      {
        itemType: "sanitise_structure",
        description:
          "Apply hospital-grade disinfectant to all non-porous surfaces contacted by contamination",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S500:2025 §12.4 — Cat 3 sanitisation",
      },
      {
        itemType: "clearance_testing",
        description:
          "Post-remediation swab + ATP testing before releasing to occupant",
        quantity: 1,
        unit: "job",
        justification: "IICRC S500:2025 §13 — Post-Cat-3 verification",
      },
    ],
  },
  {
    id: "biohazard-trauma",
    name: "Biohazard — Trauma Scene",
    category: "biohazard",
    description:
      "Unattended death, blood, or bodily fluid incident. IICRC S540 trauma-scene scope. Requires trained operators, approved chemical agents, and chain-of-custody disposal.",
    items: [
      {
        itemType: "operator_certification_check",
        description:
          "Verify all operators hold current IICRC S540 or equivalent trauma-scene training",
        quantity: 1,
        unit: "job",
        justification: "IICRC S540:2017 §4 — Operator qualification",
      },
      {
        itemType: "ppe_deploy",
        description:
          "Deploy Level C PPE including face-shield, double-glove, bootcovers",
        quantity: null,
        unit: "sets",
        justification: "CDC BBP Standard 29 CFR 1910.1030",
      },
      {
        itemType: "site_cordon",
        description:
          "Cordon affected area — restrict access to trained operators only",
        quantity: 1,
        unit: "job",
        justification: "IICRC S540:2017 §6.2 — Site control",
      },
      {
        itemType: "remove_affected_materials",
        description:
          "Remove all porous materials with visible contamination + 150mm margin",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S540:2017 §7.3 — Material removal",
      },
      {
        itemType: "chemical_decontamination",
        description:
          "Apply EPA-registered trauma-scene disinfectant with 10-minute dwell time",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S540:2017 §7.5 — Chemical decon",
      },
      {
        itemType: "regulated_waste_disposal",
        description:
          "Dispose of biohazard waste via licensed medical-waste contractor — retain manifest",
        quantity: 1,
        unit: "job",
        justification: "NSW EPA Clinical Waste Policy / equivalent state reg",
      },
      {
        itemType: "odour_remediation",
        description: "Deploy ozone or hydroxyl treatment for residual odours",
        quantity: null,
        unit: "days",
        justification: "IICRC S540:2017 §8 — Odour control",
      },
    ],
  },
];
