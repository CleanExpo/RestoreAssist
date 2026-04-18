export interface ChecklistItem {
  itemType: string;
  description: string;
  quantity: number | null;
  unit: string;
  justification: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  category: "water" | "fire" | "mould";
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
    id: "fire-smoke-s700",
    name: "Fire & Smoke — IICRC S700",
    category: "fire",
    description:
      "Fire and smoke damage remediation per IICRC S700:2015. Covers structural cleaning, odour control, contents, and air quality.",
    items: [
      {
        itemType: "hepa_vacuum_surfaces",
        description:
          "HEPA vacuum all smoke-affected surfaces to remove dry soot and particulate",
        quantity: null,
        unit: "m²",
        justification: "IICRC S700:2015 §6.2 — Dry soil removal",
      },
      {
        itemType: "soot_removal",
        description:
          "Soot removal via dry ice blasting (heavy smoke) or chemical sponge wipe (light/medium)",
        quantity: null,
        unit: "m²",
        justification: "IICRC S700:2015 §6.1 — Soot and char residue removal",
      },
      {
        itemType: "smoke_odour_treatment",
        description:
          "Smoke odour treatment — ozone generation or hydroxyl unit (unoccupied structure)",
        quantity: null,
        unit: "m²",
        justification:
          "IICRC S700:2015 §6.3 — Smoke odour elimination. Ozone treatment requires unoccupied premises.",
      },
      {
        itemType: "encapsulation_smoke_surfaces",
        description:
          "Encapsulate smoke-affected surfaces to seal residual soot and odour (medium/heavy smoke)",
        quantity: null,
        unit: "m²",
        justification:
          "IICRC S700:2015 §6.4 — Encapsulation of smoke-affected structural surfaces",
      },
      {
        itemType: "thermal_fogging",
        description:
          "Thermal fogging of structural cavities to neutralise embedded smoke odour (medium/heavy smoke)",
        quantity: null,
        unit: "m²",
        justification:
          "IICRC S700:2015 §7.2 — Thermal fogging for odour neutralisation",
      },
      {
        itemType: "gross_debris_removal",
        description:
          "Remove gross debris and fire-damaged materials prior to cleaning",
        quantity: null,
        unit: "m²",
        justification:
          "IICRC S700:2015 §5.2 — Pre-cleaning gross debris removal",
      },
      {
        itemType: "contents_pack_out",
        description:
          "Itemised contents inventory and pack-out of salvageable items",
        quantity: 1,
        unit: "job",
        justification:
          "IICRC S760:2015 §4.1 — Contents inventory and pack-out protocol",
      },
      {
        itemType: "ozone_chamber_treatment",
        description:
          "Ozone chamber treatment for salvageable contents to eliminate embedded smoke odour",
        quantity: 1,
        unit: "job",
        justification:
          "IICRC S700:2015 §8.1 — Ozone chamber treatment for salvageable contents",
      },
      {
        itemType: "afd_deployment",
        description:
          "Deploy air filtration devices (AFD) during remediation to capture airborne particulate",
        quantity: null,
        unit: "days",
        justification:
          "IICRC S700:2015 §9.1 — Air filtration device deployment during remediation",
      },
      {
        itemType: "clearance_air_quality_test",
        description:
          "Independent clearance air quality test post-remediation (subcontractor pass-through)",
        quantity: 1,
        unit: "test",
        justification:
          "IICRC S700:2015 §10.2 — Post-remediation clearance air quality testing",
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
];
