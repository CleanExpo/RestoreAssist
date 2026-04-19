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
 *
 * RA-877: Added HVAC (NADCA ACR 2021) and environmental (IICRC S760) categories.
 */
export type ChecklistCategory =
  | "water"
  | "fire"
  | "mould"
  | "storm"
  | "biohazard"
  | "hvac"
  | "environmental";

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
  // ─── RA-877: NADCA ACR 2021 HVAC ─────────────────────────────────────────────
  {
    id: "nadca-hvac-2021",
    name: "HVAC — NADCA ACR 2021 Inspection, Cleaning & Restoration",
    category: "hvac",
    description:
      "HVAC system assessment, cleaning and restoration per NADCA ACR 2021 (Assessment, Cleaning & Restoration of HVAC Systems). Applies to post-fire soot, post-flood microbial ingress, and post-mould remediation cross-contamination.",
    items: [
      {
        itemType: "nadca_pre_inspection",
        description:
          "Pre-cleaning inspection of all accessible HVAC components (supply, return, coil, drain pan, blower)",
        quantity: 1,
        unit: "job",
        justification: "NADCA ACR 2021 §4.2 — Pre-cleaning inspection",
      },
      {
        itemType: "nadca_component_photos",
        description:
          "Photograph each component before, during and after cleaning with timestamped images",
        quantity: 1,
        unit: "job",
        justification: "NADCA ACR 2021 §4.4 — Documentation of condition",
      },
      {
        itemType: "nadca_containment_isolation",
        description:
          "Isolate and negative-pressurise the section under cleaning to prevent particulate migration",
        quantity: 1,
        unit: "job",
        justification: "NADCA ACR 2021 §5.2 — Source removal containment",
      },
      {
        itemType: "nadca_source_removal",
        description:
          "Source removal via mechanical agitation (air whip, brush, compressed air) with HEPA-filtered collection unit",
        quantity: null,
        unit: "sqm",
        justification: "NADCA ACR 2021 §5.3 — Source removal cleaning method",
      },
      {
        itemType: "nadca_coil_cleaning",
        description:
          "Clean evaporator coil, drain pan and condensate line with approved coil cleaner; flush to drain",
        quantity: 1,
        unit: "job",
        justification: "NADCA ACR 2021 §5.5 — Coil and drain pan cleaning",
      },
      {
        itemType: "nadca_antimicrobial_application",
        description:
          "Apply EPA/APVMA-registered antimicrobial only where microbial contamination is documented and label directions permit HVAC use",
        quantity: null,
        unit: "sqm",
        justification: "NADCA ACR 2021 §5.7 — Antimicrobial application",
      },
      {
        itemType: "nadca_restoration_components",
        description:
          "Restore or replace non-cleanable components (porous insulation, damaged flex duct, corroded coil) per §6",
        quantity: null,
        unit: "items",
        justification: "NADCA ACR 2021 §6.2 — Component restoration criteria",
      },
      {
        itemType: "nadca_post_verification",
        description:
          "Post-cleaning NADCA verification — visual inspection and NADCA Vacuum Test (mg/100cm²) on supply/return surfaces",
        quantity: 1,
        unit: "job",
        justification: "NADCA ACR 2021 §4.6 — Post-cleaning verification",
      },
      {
        itemType: "nadca_certificate",
        description:
          "Issue NADCA cleaning certificate with scope, method, verification results and operator ASCS/CVI number",
        quantity: 1,
        unit: "job",
        justification: "NADCA ACR 2021 §4.7 — Project documentation",
      },
    ],
  },
  // ─── RA-877: Safe Work Australia biohazard CoP ───────────────────────────────
  {
    id: "safe-work-biohazard",
    name: "Biohazard — Safe Work Australia Compliance (SWMS, PPE, Waste)",
    category: "biohazard",
    description:
      "Safe Work Australia biological hazards controls applied to any biohazard job. Overlays IICRC S540/S500 Cat 3 with Australian WHS obligations — SWMS, PPE, waste manifest, notifiable incident reporting.",
    items: [
      {
        itemType: "swms_prepared",
        description:
          "Prepare Safe Work Method Statement (SWMS) identifying biological hazards, controls and sign-on of all workers",
        quantity: 1,
        unit: "job",
        justification:
          "Model WHS Regulation 2011 r.299 — High-risk construction work SWMS",
      },
      {
        itemType: "risk_assessment_bio",
        description:
          "Document biological-hazard risk assessment per SWA How to Manage WHS Risks CoP",
        quantity: 1,
        unit: "job",
        justification:
          "Safe Work Australia How to Manage WHS Risks CoP (2018) §2",
      },
      {
        itemType: "ppe_selection_as1715",
        description:
          "Select and fit-test respiratory protection per AS/NZS 1715:2009; document fit-test records",
        quantity: null,
        unit: "workers",
        justification:
          "AS/NZS 1715:2009 §5 — Respirator selection and fit-testing",
      },
      {
        itemType: "ppe_donning_doffing",
        description:
          "Supervised don/doff station with decontamination of re-usable PPE; buddy-checked on every entry",
        quantity: 1,
        unit: "job",
        justification:
          "Safe Work Australia Hazardous Manual Tasks CoP (2018) — Donning/doffing controls",
      },
      {
        itemType: "vaccination_check",
        description:
          "Verify hepatitis B, tetanus and other relevant immunisation status of exposed workers",
        quantity: null,
        unit: "workers",
        justification:
          "Safe Work Australia Blood-borne Viruses Guidance — Immunisation",
      },
      {
        itemType: "waste_manifest",
        description:
          "Manifest clinical/related waste per state EPA regulation; retain signed manifest for minimum 2 years",
        quantity: 1,
        unit: "job",
        justification:
          "NEPM Movement of Controlled Waste 2016 + state EPA clinical-waste policy",
      },
      {
        itemType: "notifiable_incident_check",
        description:
          "Assess whether exposure incident is notifiable to state WHS regulator; notify immediately if so",
        quantity: 1,
        unit: "job",
        justification: "Model WHS Act 2011 §38 — Notifiable incidents",
      },
      {
        itemType: "exposure_register",
        description:
          "Record any worker exposure (needlestick, splash, inhalation) in health-monitoring register",
        quantity: null,
        unit: "events",
        justification:
          "Model WHS Regulation 2011 r.368 — Health monitoring records",
      },
    ],
  },
  // ─── RA-877: IICRC S700 fire & smoke — expanded ──────────────────────────────
  {
    id: "iicrc-s700-fire-smoke-expanded",
    name: "Fire & Smoke — Expanded (Wet/Dry Smoke, Contents, Odour)",
    category: "fire",
    description:
      "Expanded IICRC S700 fire and smoke scope. Differentiates wet vs dry smoke cleaning, adds structured content manipulation, pack-out and multi-stage odour control. Use in preference to 'fire-smoke' on losses > 20 sqm or where contents manipulation is insured.",
    items: [
      {
        itemType: "s700_smoke_type_classification",
        description:
          "Classify smoke residue as wet (low-temp, oil-based) or dry (high-temp, carbon) — cleaning method follows",
        quantity: 1,
        unit: "job",
        justification: "IICRC S700:2015 §6.2 — Smoke residue classification",
      },
      {
        itemType: "s700_pre_cleaning_hepa",
        description:
          "Pre-cleaning HEPA vacuum of all loose particulate before wet/chemical cleaning",
        quantity: null,
        unit: "sqm",
        justification:
          "IICRC S700:2015 §7.1 — Pre-cleaning particulate removal",
      },
      {
        itemType: "s700_dry_smoke_cleaning",
        description:
          "Dry-smoke method: chemical sponge + dry solvent wipe; no aqueous solutions on dry residue",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S700:2015 §7.3.1 — Dry smoke cleaning",
      },
      {
        itemType: "s700_wet_smoke_cleaning",
        description:
          "Wet-smoke method: alkaline degreaser + emulsion cleaning; two-pass rinse to prevent streaking",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S700:2015 §7.3.2 — Wet smoke cleaning",
      },
      {
        itemType: "s700_content_inventory",
        description:
          "Inventory all contents with condition grading (cleanable / restorable / non-salvageable) before manipulation",
        quantity: 1,
        unit: "job",
        justification: "IICRC S700:2015 §5.2 — Content inventory",
      },
      {
        itemType: "s700_content_pack_out",
        description:
          "Pack-out salvageable contents to off-site cleaning facility with chain-of-custody labels",
        quantity: null,
        unit: "items",
        justification: "IICRC S700:2015 §5.3 — Pack-out procedures",
      },
      {
        itemType: "s700_content_cleaning_offsite",
        description:
          "Off-site ultrasonic / esporta / hand cleaning by content type (hard goods, textiles, electronics)",
        quantity: null,
        unit: "items",
        justification: "IICRC S700:2015 §5.4 — Content cleaning methods",
      },
      {
        itemType: "s700_deodorisation_stage1",
        description:
          "Stage 1 odour control — source removal + HEPA air scrubbing during structural cleaning",
        quantity: null,
        unit: "days",
        justification: "IICRC S700:2015 §8.2 — Stage 1 deodorisation",
      },
      {
        itemType: "s700_deodorisation_stage2",
        description:
          "Stage 2 — thermal fog or hydroxyl generator for residual odour penetration (unoccupied)",
        quantity: 1,
        unit: "job",
        justification: "IICRC S700:2015 §8.3 — Stage 2 deodorisation",
      },
      {
        itemType: "s700_sealer_application",
        description:
          "Apply shellac/odour-blocking sealer to porous framing prior to reconstruction",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S700:2015 §8.4 — Sealant application",
      },
      {
        itemType: "s700_content_pack_back",
        description:
          "Pack-back cleaned contents with condition sign-off by homeowner/agent",
        quantity: 1,
        unit: "job",
        justification: "IICRC S700:2015 §5.6 — Pack-back and release",
      },
      {
        itemType: "s700_post_cleaning_inspection",
        description:
          "Post-cleaning inspection with smoke-residue swab verification before reconstruction hand-off",
        quantity: 1,
        unit: "job",
        justification: "IICRC S700:2015 §9 — Post-cleaning verification",
      },
    ],
  },
  // ─── RA-877: IICRC S520 mould — expanded ─────────────────────────────────────
  {
    id: "iicrc-s520-mould-expanded",
    name: "Mould — Expanded IICRC S520 (Condition 1–3, Class 1–4)",
    category: "mould",
    description:
      "Expanded IICRC S520 scope. Differentiates Condition 1/2/3 and mould contamination Class 1 (≤10 sqft) through Class 4 (HVAC). Adds structured containment escalation, clearance testing and post-remediation verification.",
    items: [
      {
        itemType: "s520_condition_assessment",
        description:
          "Classify structure as Condition 1 (normal), 2 (settled spores), or 3 (actual growth)",
        quantity: 1,
        unit: "job",
        justification: "IICRC S520:2015 §3 — Condition classification",
      },
      {
        itemType: "s520_class_determination",
        description:
          "Determine contamination Class 1 (≤10 sqft) / 2 (10–100 sqft) / 3 (>100 sqft) / 4 (HVAC or hidden systemic)",
        quantity: 1,
        unit: "job",
        justification: "IICRC S520:2015 §12.2 — Contamination class",
      },
      {
        itemType: "s520_containment_class1_2",
        description:
          "Class 1–2: limited containment (single-layer poly, mini-containment) with HEPA-filtered exhaust",
        quantity: 1,
        unit: "job",
        justification: "IICRC S520:2015 §12.3.1 — Limited containment",
      },
      {
        itemType: "s520_containment_class3_4",
        description:
          "Class 3–4: full containment (double-layer poly, decontamination chamber, ≥4 ACH negative pressure)",
        quantity: 1,
        unit: "job",
        justification: "IICRC S520:2015 §12.3.2 — Full containment",
      },
      {
        itemType: "s520_source_removal",
        description:
          "Physical removal of mould-impacted porous materials — cut 300 mm past visible contamination line",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S520:2015 §12.4 — Source removal",
      },
      {
        itemType: "s520_hepa_vacuum_pass",
        description:
          "HEPA vacuum all surfaces in containment; two-pass before damp-wipe",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S520:2015 §12.5 — HEPA vacuum cleaning",
      },
      {
        itemType: "s520_damp_wipe",
        description:
          "Damp-wipe all non-porous surfaces with detergent solution; discard wipes into sealed waste bag",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S520:2015 §12.5 — Damp-wipe method",
      },
      {
        itemType: "s520_antimicrobial_conditional",
        description:
          "Antimicrobial application only where condition remains post-cleaning; APVMA-registered product with log",
        quantity: null,
        unit: "sqm",
        justification: "IICRC S520:2015 §12.6 — Antimicrobial use criteria",
      },
      {
        itemType: "s520_post_remediation_verification",
        description:
          "Post-remediation verification (PRV) — visual inspection + moisture + tactile before clearance",
        quantity: 1,
        unit: "job",
        justification: "IICRC S520:2015 §14.1 — Post-remediation verification",
      },
      {
        itemType: "s520_clearance_air_sampling",
        description:
          "Third-party clearance air sampling (indoor vs outdoor spore counts) by independent hygienist",
        quantity: null,
        unit: "samples",
        justification: "IICRC S520:2015 §14.2 — Independent clearance testing",
      },
      {
        itemType: "s520_clearance_report",
        description:
          "Clearance report issued before reconstruction — pass/fail criteria documented",
        quantity: 1,
        unit: "job",
        justification: "IICRC S520:2015 §14.3 — Clearance documentation",
      },
    ],
  },
  // ─── RA-877: IICRC S760 environmental controls ───────────────────────────────
  {
    id: "iicrc-s760-environmental",
    name: "Environmental Controls — IICRC S760 (Air Quality, VOC, Occupant Safety)",
    category: "environmental",
    description:
      "IICRC S760 environmental monitoring and occupant-safety controls. Applies to any occupied-building remediation where air quality, VOC off-gassing, particulates, or temperature/humidity risks occupants or crew.",
    items: [
      {
        itemType: "s760_baseline_air_quality",
        description:
          "Baseline IAQ readings — PM2.5, PM10, CO, CO₂, TVOC, temperature, RH — recorded before work starts",
        quantity: 1,
        unit: "job",
        justification: "IICRC S760:2022 §5.2 — Baseline environmental data",
      },
      {
        itemType: "s760_voc_testing",
        description:
          "TVOC sampling (photoionisation detector or thermal-desorption tube) when solvents/adhesives/sealers used",
        quantity: null,
        unit: "samples",
        justification: "IICRC S760:2022 §6.3 — VOC monitoring",
      },
      {
        itemType: "s760_particulate_monitoring",
        description:
          "Continuous particulate monitoring (laser particle counter) during dust-generating activities",
        quantity: null,
        unit: "days",
        justification: "IICRC S760:2022 §6.2 — Particulate monitoring",
      },
      {
        itemType: "s760_co_co2_monitoring",
        description:
          "CO / CO₂ monitoring in any space using combustion equipment or with occupant density concerns",
        quantity: null,
        unit: "days",
        justification: "IICRC S760:2022 §6.4 — Combustion gas monitoring",
      },
      {
        itemType: "s760_occupant_notification",
        description:
          "Written notification to occupants of scope, duration, chemicals used and re-entry criteria",
        quantity: 1,
        unit: "job",
        justification: "IICRC S760:2022 §7.1 — Occupant communication",
      },
      {
        itemType: "s760_vulnerable_occupant_plan",
        description:
          "Document accommodation plan where vulnerable occupants present (infants, elderly, immunocompromised, asthmatic)",
        quantity: 1,
        unit: "job",
        justification: "IICRC S760:2022 §7.2 — Sensitive occupant protection",
      },
      {
        itemType: "s760_negative_pressure_verification",
        description:
          "Verify negative-pressure differential (≥5 Pa) between containment and occupied zones with manometer log",
        quantity: null,
        unit: "days",
        justification:
          "IICRC S760:2022 §8.2 — Pressure differential verification",
      },
      {
        itemType: "s760_temperature_humidity_log",
        description:
          "Data-logger temperature and RH inside containment and occupied zones for project duration",
        quantity: null,
        unit: "days",
        justification: "IICRC S760:2022 §6.5 — Hygrothermal monitoring",
      },
      {
        itemType: "s760_post_work_clearance",
        description:
          "Post-work IAQ readings matched against baseline; re-occupancy only when within agreed tolerance",
        quantity: 1,
        unit: "job",
        justification: "IICRC S760:2022 §9 — Re-occupancy clearance",
      },
    ],
  },
];
