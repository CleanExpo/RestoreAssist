/**
 * NIR Standards Mapping — IICRC Clause Reference Layer
 *
 * This module is the foundation of NIR v2.0. Every data field captured
 * in the NIR mobile form maps to a specific IICRC clause or Australian
 * standard. The engine does not merely record measurements — it interprets
 * them against their governing standard and generates a defensible output.
 *
 * Critique addressed: C1 — Standards cited as badge, not embedded in logic
 *
 * Standards covered:
 *   IICRC S500 — Standard for Professional Water Damage Restoration (5th Ed, 2021)
 *   IICRC S520 — Standard for Professional Mould Remediation (4th Ed, 2024)
 *   IICRC S540 — Standard for Trauma and Crime Scene Cleanup (2nd Ed, 2023)
 *   IICRC S700 — Standard for Professional Fire and Smoke Damage Restoration (1st Ed, 2025)
 *   NCC 2022   — National Construction Code (Australia)
 */

// ─── S500 WATER DAMAGE FIELD MAP ──────────────────────────────────────────────

export const S500_FIELD_MAP = {
  /**
   * Moisture content thresholds per material type
   * Source: IICRC S500 §12.3 — Elevated moisture defined as >16% in wood,
   * >0.5% in concrete substrates
   */
  moistureContent: {
    clauseRef: "S500:2021 §12.3",
    thresholds: {
      wood: { normal: 12, elevated: 16, critical: 25 },
      drywall: { normal: 0.5, elevated: 1.0, critical: 2.0 },
      concrete: { normal: 0.5, elevated: 1.0, critical: 2.0 },
      carpet: { normal: 0, elevated: 0.1, critical: 0.5 },
    },
    engineLogic:
      "Flag reading as NORMAL / ELEVATED / CRITICAL against material-specific threshold. CRITICAL triggers mandatory drying protocol citation.",
    adjusterValue:
      "Adjuster sees pass/fail against a published standard clause, not technician judgement.",
  },

  /**
   * Relative humidity — drying target calculation
   * Source: IICRC S500 §12.4 — Drying goal: RH at or below ambient outdoor
   * conditions for the region
   */
  relativeHumidity: {
    clauseRef: "S500:2021 §12.4",
    drinkTarget: "Match or below ambient outdoor RH at time of inspection",
    engineLogic:
      "Compute drying target from recorded outdoor RH. Target is calculated, not estimated.",
    adjusterValue:
      "Drying target is derived from standard — defensible in dispute.",
  },

  /**
   * Water category classification
   * Source: IICRC S500 §10.4.1 (Category of Water — defined in §10 Inspections,
   * Preliminary Determinations, and Pre-Restoration Evaluations)
   * Cat 1: Clean/potable water  Cat 2: Grey water  Cat 3: Black/contaminated water
   */
  waterCategory: {
    clauseRef: "S500:2021 §10.4.1",
    definitions: {
      category1: {
        label: "Clean Water",
        source: "Potable supply, broken pipes, rainwater (initial contact)",
        requiresContainment: false,
      },
      category2: {
        label: "Grey Water",
        source:
          "Washing machine overflow, dishwasher, toilet bowl (urine only)",
        requiresContainment: false,
        requiresSanitisation: true,
      },
      category3: {
        label: "Black Water",
        source:
          "Sewage, flooding from external bodies, toilet bowl (faecal matter)",
        requiresContainment: true,
        requiresPPE: true,
      },
    },
    timeEscalation:
      "Cat 1 degrades to Cat 2 after 48 hrs standing (S500:2021 §10.4.1 note)",
    engineLogic:
      "Map observed water source to category. Cat 3 triggers mandatory containment protocol and PPE requirement in scope items.",
    adjusterValue:
      "Scope of decontamination is standards-justified, not upsold.",
  },

  /**
   * Water class classification (evaporation load)
   * Source: IICRC S500 §10.4.3 (Class of Water Intrusion — defined in §10)
   */
  waterClass: {
    clauseRef: "S500:2021 §10.4.3",
    definitions: {
      class1: {
        label: "Slow Evaporation",
        affectedArea: "<10% of floor space",
        materials: "Part of room, low porosity",
      },
      class2: {
        label: "Fast Evaporation",
        affectedArea: "10–40% of floor space",
        materials: "Carpet and cushion, entire room",
      },
      class3: {
        label: "Fastest Evaporation",
        affectedArea: ">40% of floor space",
        materials: "Walls, ceilings, insulation",
      },
      class4: {
        label: "Specialty Drying",
        affectedArea: "N/A",
        materials: "Concrete, hardwood, plaster, brick",
      },
    },
    engineLogic:
      "Calculate class from affected area %, materials, and moisture readings. Class drives drying equipment selection and quantity.",
    adjusterValue:
      "Equipment specification is derived from class, not arbitrary.",
  },

  /**
   * Structural drying equipment adequacy
   * Source: IICRC S500 §6 — Equipment, Instruments, and Tools (selection and sizing)
   */
  dryingEquipment: {
    clauseRef: "S500:2021 §6",
    engineLogic:
      "Validate equipment selection and quantity against S500 §6 guidance for affected area and class. Flag if proposed equipment is undersized.",
    adjusterValue: "Equipment adequacy is verifiable — audit trail available.",
  },

  /**
   * Photo documentation standard
   * Source: IICRC S500 §9 — Administrative Procedures, Project Documentation,
   * and Risk Management (documentation requirements for insurance claims)
   */
  photoDocumentation: {
    clauseRef: "S500:2021 §9",
    requirements: [
      "Auto-timestamp on every photo",
      "GPS geotag on every photo",
      "Sequential numbering per inspection",
      "Minimum coverage: overview, affected areas, moisture meter placement, equipment placement",
    ],
    engineLogic:
      "Auto-timestamp, geo-stamp, and sequence photos per S500 §9 documentation standard. Flag incomplete coverage.",
    adjusterValue:
      "Photos are court-admissible documentation in the correct format.",
  },
} as const;

// ─── S520 MOULD REMEDIATION FIELD MAP ─────────────────────────────────────────

export const S520_FIELD_MAP = {
  /**
   * Mould condition classification
   * Source: IICRC S520 §6 — Assessment and classification of mould conditions
   */
  mouldCondition: {
    clauseRef: "IICRC S520 §6",
    definitions: {
      condition1: {
        label: "Normal Fungal Ecology",
        description:
          "No visible mould, air quality normal. No remediation required.",
      },
      condition2: {
        label: "Settled Spores",
        description:
          "Settled spores or hyphal fragments from a condition 3 area. Limited remediation.",
      },
      condition3: {
        label: "Active Mould Growth",
        description: "Active mould growth visible. Full remediation required.",
      },
    },
    engineLogic:
      "Map visual observation to Condition 1/2/3. Condition 3 triggers mandatory full remediation scope and containment.",
    adjusterValue:
      "Remediation scope is standard-justified — not estimator discretion.",
  },

  /**
   * Containment requirements by affected area
   * Source: IICRC S520 §7.3
   */
  containmentRequirements: {
    clauseRef: "IICRC S520 §7.3",
    thresholds: {
      noContainment: { maxArea: 1, label: "<1 m²" },
      limitedContainment: { maxArea: 10, label: "1–10 m²" },
      fullContainment: { maxArea: null, label: ">10 m²" },
    },
    engineLogic:
      "Calculate containment requirement from affected area. Cost is formula-derived, not estimator judgement.",
    adjusterValue: "Containment cost is defensible against the standard.",
  },

  /**
   * Moisture source identification (prerequisite gate)
   * Source: IICRC S520 §8.1 — Source identification required before remediation
   */
  moistureSourceIdentification: {
    clauseRef: "IICRC S520 §8.1",
    gateCondition:
      "MANDATORY — report flagged as INCOMPLETE if moisture source field is empty",
    engineLogic:
      "Block scope approval if moisture source is not identified. Prevents scope approval without root cause.",
    adjusterValue:
      "Reduces repeat claims by ensuring root cause is addressed before remediation scope is approved.",
  },

  /**
   * Air quality testing requirements
   * Source: IICRC S520 §9 — Pre/post clearance testing
   */
  airQualityTesting: {
    clauseRef: "IICRC S520 §9",
    triggers: [
      {
        condition: "Condition 3 classification",
        requirement: "Pre-remediation air sampling mandatory",
      },
      {
        condition: "Affected area >10 m²",
        requirement: "Pre and post clearance air sampling",
      },
      {
        condition: "Occupant health vulnerability noted",
        requirement: "Pre-remediation industrial hygienist assessment",
      },
    ],
    engineLogic:
      "Flag testing requirement based on condition and area. Adjuster knows upfront — no surprise costs.",
    adjusterValue: "Liability risk managed systematically.",
  },
} as const;

// ─── S700 FIRE AND SMOKE FIELD MAP ────────────────────────────────────────────

export const S700_FIELD_MAP = {
  /**
   * Smoke residue classification
   * Source: IICRC S700 §6
   */
  smokeResidueType: {
    clauseRef: "IICRC S700 §6",
    types: {
      wetSmoke: {
        label: "Wet Smoke",
        materials: "Rubber, plastics, slow smoulder",
        cleaning: "Degreaser required, high odour",
      },
      drySmoke: {
        label: "Dry Smoke",
        materials: "Paper, wood, fast burn",
        cleaning: "Dry cleaning method first",
      },
      proteinResidue: {
        label: "Protein Residue",
        materials: "Kitchen fires, food",
        cleaning: "Enzymatic cleaner required",
      },
      fuelOilSoot: {
        label: "Fuel Oil Soot",
        materials: "Furnace puff-back",
        cleaning: "Dry cleaning sponges, degreaser",
      },
    },
    engineLogic:
      "Map observed residue to type. Type drives cleaning method selection in scope items.",
    adjusterValue: "Cleaning specification is standard-matched, not arbitrary.",
  },

  /**
   * Structural stability assessment (gate condition)
   * Source: IICRC S700 §8
   */
  structuralStability: {
    clauseRef: "IICRC S700 §8",
    gateCondition:
      "Structural stability must be assessed before restoration work proceeds",
    engineLogic:
      "Require structural stability field completion before scope generation. Flag if stability is uncertain.",
    adjusterValue: "Safety and liability risk managed before scope commitment.",
  },

  /**
   * Safety assessment and site entry conditions (gate condition)
   * Source: IICRC S700 §4 — Safety and health requirements
   *
   * Must be completed before technician enters the structure.
   * Utility disconnection and PPE level are non-negotiable gates.
   */
  safetyAssessment: {
    clauseRef: "IICRC S700 §4",
    gateCondition:
      "Safety assessment must be completed before site entry and restoration work",
    utilityRequirements: {
      electrical: "Disconnect or isolate before wet cleaning commences",
      gas: "Verify shutoff — gas leaks may persist post-fire",
      water: "Verify main shut off where structural damage may affect plumbing",
    },
    ppeRequirements: {
      level1: {
        trigger: "Dry smoke residue only, no structural damage",
        ppe: "Gloves, P2 respirator, eye protection",
      },
      level2: {
        trigger: "Wet/protein smoke, limited structural damage",
        ppe: "Full Tyvek suit, P3 respirator, gloves, eye protection",
      },
      level3: {
        trigger:
          "Fuel oil soot, significant structural damage, or asbestos suspect",
        ppe: "Full encapsulating suit, supplied air, asbestos-rated respirator",
      },
    },
    engineLogic:
      "Map residue type and structural condition to PPE level. Block scope generation if safety field is empty.",
    adjusterValue:
      "Site entry risk is documented and classified — reduces insurer liability.",
  },

  /**
   * Odour severity classification
   * Source: IICRC S700 §9 — Deodorisation
   *
   * Odour severity drives the deodorisation method selected.
   * Must be recorded before scope is finalised.
   */
  odourSeverity: {
    clauseRef: "IICRC S700 §9",
    scale: {
      none: { score: 0, label: "No detectable odour", treatment: "none" },
      mild: {
        score: 1,
        label: "Faint odour, detectable on entry",
        treatment: "ventilation + surface cleaning",
      },
      moderate: {
        score: 2,
        label: "Persistent odour in all rooms",
        treatment: "hydroxyl or ozone treatment required",
      },
      severe: {
        score: 3,
        label: "Overwhelming odour, HVAC permeated",
        treatment: "thermal fogging + duct cleaning + encapsulant",
      },
    },
    engineLogic:
      "Map recorded odour score to treatment method. Severity 3 triggers mandatory HVAC inspection line item.",
    adjusterValue:
      "Deodorisation scope is severity-matched, not added as a default line item.",
  },

  /**
   * Deodorisation method selection
   * Source: IICRC S700 §9 — Deodorisation methods and procedures
   */
  deodorisationMethod: {
    clauseRef: "IICRC S700 §9",
    methods: {
      ventilation: {
        label: "Ventilation and Source Removal",
        indication: "Mild odour; residue removal complete",
        ozoneCompatible: false,
        notes:
          "First step for all odour severities — must be completed before chemical deodorisation.",
      },
      hydroxylGeneration: {
        label: "Hydroxyl Generation",
        indication: "Moderate odour; occupied or occupied-adjacent structures",
        ozoneCompatible: false,
        notes:
          "Safe for occupied structures. Slower than ozone — allow 3–5 days continuous treatment.",
      },
      thermalFogging: {
        label: "Thermal Fogging",
        indication: "Severe odour; penetrant residues in porous materials",
        ozoneCompatible: true,
        notes:
          "Requires evacuation. Fog penetrates same pathways as original smoke. Best paired with encapsulant.",
      },
      ozoneTreatment: {
        label: "Ozone Treatment",
        indication: "Severe to extreme odour; unoccupied structures only",
        ozoneCompatible: false,
        notes:
          "UNOCCUPIED ONLY — ozone is hazardous to occupants and pets. 24hr clearance required post-treatment.",
      },
      encapsulation: {
        label: "Encapsulant Sealant",
        indication:
          "Residual odour after cleaning; porous structural materials",
        ozoneCompatible: true,
        notes:
          "Applied after cleaning — seals residual smoke compounds in substrate. Not a substitute for cleaning.",
      },
    },
    engineLogic:
      "Recommend method based on odourSeverity score and occupancy status. Flag ozone selection if occupied.",
    adjusterValue:
      "Deodorisation method is linked to odour classification — defensible line item.",
  },

  /**
   * Content pack-out and inventory assessment
   * Source: IICRC S700 §7 — Affected items and content management
   */
  contentPackOut: {
    clauseRef: "IICRC S700 §7",
    decisionMatrix: {
      cleanOnSite: {
        condition: "Minor smoke exposure, non-porous items, low value",
        action: "Clean in place — document per item",
      },
      packOut: {
        condition:
          "High-value items, porous materials needing offsite treatment, space constraints",
        action: "Inventory, tag, and pack for offsite restoration",
      },
      totalLoss: {
        condition:
          "Structural damage to item, residue absorption beyond practical cleaning, health hazard",
        action:
          "Document condition with photos, obtain insurer approval before disposal",
      },
    },
    engineLogic:
      "Prompt technician with decision matrix for each content category. Generate pack-out inventory with item-level photos.",
    adjusterValue:
      "Content decisions are documented with rationale — reduces disputes on salvageability.",
  },

  /**
   * Photo documentation standard
   * Source: IICRC S700 §11 — Documentation requirements
   */
  photoDocumentation: {
    clauseRef: "IICRC S700 §11",
    requirements: [
      "Pre-restoration overview: all affected rooms, structural damage, smoke patterns",
      "Residue type close-up: wet/dry/protein/fuel oil sample areas with scale reference",
      "Content inventory: every item assessed for pack-out/total loss with condition photo",
      "Post-cleaning verification: same angles as pre-restoration for before/after comparison",
      "Deodorisation equipment placement: document method and equipment used",
    ],
    engineLogic:
      "Auto-timestamp, geo-stamp, and sequence photos per S700 §11. Pre/post pairs required — flag if post-cleaning photos are missing.",
    adjusterValue:
      "Before/after photo pairs are the primary adjuster dispute-resolution tool.",
  },
} as const;

// ─── S540 TRAUMA / BIOHAZARD FIELD MAP ────────────────────────────────────────
//
// Source: IICRC S540:2023 — Standard for Trauma and Crime Scene Cleanup
// Citations follow CLAUDE.md rule #14 (edition + section, no abbreviation).
// Coverage: §6 scoping · §7 worker protection · §8 cleaning · §9 verification ·
// §10 documentation / regulated-waste chain-of-custody.

export const S540_FIELD_MAP = {
  /**
   * Incident-type classification — drives jurisdictional reporting and PPE tier.
   * Source: IICRC S540:2023 §6 — Project scoping and pre-job assessment.
   */
  incidentType: {
    clauseRef: "IICRC S540:2023 §6.2",
    definitions: {
      crimeScene: {
        label: "Crime Scene",
        notes:
          "Police clearance required before entry. Chain of custody is evidence-grade.",
      },
      unattendedDeath: {
        label: "Unattended Death / Decomposition",
        notes:
          "Decomposition fluids classed as OPIM. Coronial release required.",
      },
      suicide: {
        label: "Suicide",
        notes:
          "Family-sensitivity protocol; coronial release required before remediation.",
      },
      animalRemoval: {
        label: "Animal Remains / Infestation",
        notes:
          "Carcass + faecal load; zoonotic disease risk drives PPE tier upward.",
      },
      hoarding: {
        label: "Hoarding / Gross Filth",
        notes:
          "Volumetric assessment for regulated-waste streams; structural integrity risk.",
      },
    },
    engineLogic:
      "Map operator observation to incident type. Type drives jurisdictional notification matrix and PPE tier selection.",
    adjusterValue:
      "Scope is incident-classified — adjuster sees defensible reason for trauma-tier pricing.",
  },

  /**
   * Regulated-waste classification — categorises what leaves site under
   * Australian state biohazard-waste regulations.
   * Source: IICRC S540:2023 §6.4 — Waste stream classification.
   */
  regulatedWasteClass: {
    clauseRef: "IICRC S540:2023 §6.4",
    classes: {
      generalWaste: {
        label: "General Waste",
        description: "Non-contaminated packaging, cleaning materials.",
      },
      clinicalWaste: {
        label: "Clinical / Biohazard Waste",
        description:
          "Anything saturated with blood or OPIM (Other Potentially Infectious Material). Yellow-bag stream.",
      },
      anatomicalWaste: {
        label: "Anatomical Waste",
        description:
          "Recognisable body tissue or organs. Separate stream; coronial release required.",
      },
      sharps: {
        label: "Sharps",
        description: "Needles, glass, blades — rigid sharps container only.",
      },
    },
    engineLogic:
      "Operator categorises each waste stream at point of capture. Volume per class drives transport + disposal line items.",
    adjusterValue:
      "Disposal cost is regulated-stream-derived, not estimator judgement — defensible against state EPA requirements.",
  },

  /**
   * Jurisdictional notification requirements — what must be filed and to whom.
   * Source: IICRC S540:2023 §6.6 — Regulatory and jurisdictional compliance.
   */
  jurisdictionalNotifications: {
    clauseRef: "IICRC S540:2023 §6.6",
    gateCondition:
      "MANDATORY — block scope submission until coronial / police release is recorded for applicable incident types.",
    notifications: [
      "Police release (crime scene)",
      "Coronial release (unattended death, suicide)",
      "State EPA notification (regulated waste transport)",
      "WHS notifiable incident (worker exposure event)",
    ],
    engineLogic:
      "Cross-reference incidentType against the AU jurisdictional matrix (lib/nir-jurisdictional-matrix.ts). Surface required filings as evidence-gate items.",
    adjusterValue:
      "Compliance posture is auditable — reduces re-work risk if an authority queries the file.",
  },

  /**
   * PPE level (A/B/C/D) selection per pathogen exposure risk.
   * Source: IICRC S540:2023 §7.2 — Worker protection and PPE selection.
   *
   * The A/B/C/D framework is shared with NIOSH / OSHA HAZWOPER and is the
   * Australian de-facto standard for trauma response. Level scales DOWN as
   * exposure risk drops; Level A is fully encapsulated / supplied-air.
   */
  ppeLevel: {
    clauseRef: "IICRC S540:2023 §7.2",
    levels: {
      levelA: {
        label: "Level A — Fully Encapsulated, Supplied Air",
        trigger:
          "Confirmed or suspected airborne pathogen, unknown bioburden, confined-space entry",
        elements: [
          "Fully encapsulating chemical-resistant suit",
          "Self-contained breathing apparatus (SCBA) or supplied-air respirator",
          "Inner + outer chemical-resistant gloves",
          "Chemical-resistant boots",
        ],
      },
      levelB: {
        label: "Level B — Supplied Air, Non-Encapsulated",
        trigger:
          "Known liquid splash hazard, low airborne risk; most trauma jobs default here",
        elements: [
          "Hooded chemical-resistant suit",
          "Supplied-air respirator or full-face PAPR with P3 cartridges",
          "Inner + outer gloves; chemical-resistant boots",
        ],
      },
      levelC: {
        label: "Level C — Air-Purifying Respirator",
        trigger:
          "Contaminants identified, atmospheric exposure measured and within APR rating",
        elements: [
          "Full-face air-purifying respirator (APR) with HEPA + organic cartridges",
          "Hooded chemical-resistant coverall",
          "Inner + outer gloves",
        ],
      },
      levelD: {
        label: "Level D — Standard Work Uniform",
        trigger:
          "No respiratory or splash hazard. Decontamination tasks AFTER bulk material is removed.",
        elements: [
          "Coveralls, safety boots, eye protection",
          "Gloves appropriate to chemicals in use",
        ],
      },
    },
    engineLogic:
      "Map incidentType + bioburden assessment to PPE level. Block scope generation if PPE level is below the per-incident floor (e.g. anatomical waste cannot be handled at Level D).",
    adjusterValue:
      "PPE specification is risk-tier matched — defensible against WHS regulator if a worker exposure event occurs.",
  },

  /**
   * Respiratory-protection class — recorded per the AS/NZS 1716 + S540 mapping.
   * Source: IICRC S540:2023 §7.3 — Respiratory protection.
   */
  respiratoryProtectionClass: {
    clauseRef: "IICRC S540:2023 §7.3",
    classes: {
      p2: {
        label: "P2 Half-Face APR",
        rating: "Particulate filter, low bioaerosol load only",
        notFor: "Not for trauma response — insufficient for OPIM aerosolisation",
      },
      p3FullFace: {
        label: "P3 Full-Face APR",
        rating: "99.95% particulate efficiency, eye + airway protection",
        suitableFor: "Most Level B/C trauma work post-bulk-removal",
      },
      paprP3: {
        label: "PAPR with P3 + Organic Cartridges",
        rating: "Powered, assigned protection factor 1000",
        suitableFor:
          "Decomposition odour, hoarding, chemical degreaser exposure during cleaning",
      },
      sar: {
        label: "Supplied-Air Respirator (SAR) / SCBA",
        rating: "Highest assigned protection factor; mandatory for Level A",
        suitableFor: "Confined space, unknown atmospheric hazard, Level A entry",
      },
    },
    engineLogic:
      "Respirator class is auto-selected from PPE level + incident type. P2 is BLOCKED for any trauma response per S540:2023 §7.3.",
    adjusterValue:
      "Respiratory protection is auditable against AS/NZS 1716 — supports WHS due diligence.",
  },

  /**
   * Worker decontamination protocol — the staged exit from a contaminated zone.
   * Source: IICRC S540:2023 §7.5 — Worker decontamination.
   */
  decontaminationProtocol: {
    clauseRef: "IICRC S540:2023 §7.5",
    stages: [
      "Tool & equipment gross-decon at the hot/warm boundary",
      "Outer-PPE removal at the warm/cold boundary into clinical-waste bag",
      "Inner-PPE removal in cold zone; hand hygiene before doffing respirator",
      "Skin decontamination: hand wash + face wash before leaving the site",
      "Final shower-out required for Level A/B and for known bloodborne-pathogen exposure",
    ],
    engineLogic:
      "Render decontamination checklist on-site exit. Block sign-off if any stage is unchecked.",
    adjusterValue:
      "Worker-decon trail is documented — reduces post-job cross-contamination claims.",
  },

  /**
   * Surface category — porous vs non-porous drives cleanable vs remove-and-replace.
   * Source: IICRC S540:2023 §8.2 — Surface assessment.
   */
  surfaceCategory: {
    clauseRef: "IICRC S540:2023 §8.2",
    categories: {
      nonPorous: {
        label: "Non-Porous",
        examples: "Sealed tile, stainless steel, glass, sealed timber",
        treatment:
          "Mechanical removal + EPA-registered disinfectant + verification swab",
      },
      semiPorous: {
        label: "Semi-Porous",
        examples: "Unsealed timber, vinyl, painted plasterboard",
        treatment:
          "Mechanical removal + enzymatic + disinfectant; encapsulation only if removal not practical",
      },
      porous: {
        label: "Porous",
        examples: "Carpet, underlay, raw plasterboard, insulation, fabric",
        treatment:
          "Remove and dispose — cannot be remediated to verifiable clearance",
      },
    },
    engineLogic:
      "Operator tags each affected surface. Porous surfaces auto-generate a removal line item; remediation alone is BLOCKED for porous.",
    adjusterValue:
      "Remove-vs-clean decisions are surface-classified, not estimator discretion — defensible against scope-padding accusations.",
  },

  /**
   * Cleaning + disinfection sequence — the order of operations on a contaminated surface.
   * Source: IICRC S540:2023 §8.4 — Cleaning, decontamination and disinfection.
   */
  cleaningSequence: {
    clauseRef: "IICRC S540:2023 §8.4",
    steps: [
      "Gross-soil removal (mechanical / wet-vac with HEPA exhaust)",
      "Enzymatic / detergent cleaning to lift residual protein",
      "Rinse to remove cleaning agent (else interferes with disinfectant)",
      "Apply EPA-registered hospital-grade disinfectant rated against bloodborne pathogens (HIV / HBV / HCV)",
      "Observe required dwell time per product label (typically 5–10 min)",
      "Final wipe + verification swab",
    ],
    engineLogic:
      "Render sequence as ordered task list. Disinfectant dwell time is enforced — clearance is BLOCKED until dwell-time stamp is captured.",
    adjusterValue:
      "Procedure is verifiable; insurer can audit each step against the product TGA/EPA label.",
  },

  /**
   * Regulated medical waste — disposal chain-of-custody.
   * Source: IICRC S540:2023 §8.6 cross-ref §10 — Waste handling and documentation.
   *
   * Chain-of-custody is the strongest defensible artefact in a trauma file. Each
   * bag is tagged, weighed, signed by the licensed transporter, and reconciled
   * against the destination facility's incinerator/treatment receipt.
   */
  regulatedWasteDisposalChain: {
    clauseRef: "IICRC S540:2023 §10.2",
    requirements: [
      "Each waste container uniquely identified (job# + sequence)",
      "Container weight or volume recorded at point of seal",
      "Hand-off signed by site operator AND licensed transporter",
      "Transport manifest filed with state EPA-approved disposal facility",
      "Final destruction receipt (incinerator/autoclave) attached to job file",
      "Chain held with documents for retention period set by state (≥ 7 years)",
    ],
    engineLogic:
      "Generate chain-of-custody record per waste container. BLOCK job closure until all containers have a destruction receipt attached.",
    adjusterValue:
      "Chain-of-custody is the strongest defensible artefact — survives EPA audit and supports any subsequent legal proceeding.",
  },

  /**
   * Post-remediation verification — clearance test before re-occupation.
   * Source: IICRC S540:2023 §9.2 — Verification of decontamination.
   */
  postRemediationVerification: {
    clauseRef: "IICRC S540:2023 §9.2",
    methods: {
      visualInspection: {
        label: "Post-Remediation Visual Inspection",
        notes:
          "Independent visual inspection at brightness ≥ 500 lux; first gate before any further testing.",
      },
      atpBioluminescence: {
        label: "ATP Bioluminescence Swab",
        notes:
          "Rapid (60 s) RLU read against pre-set action threshold; documents organic residue post-clean.",
      },
      proteinResidueSwab: {
        label: "Protein Residue Swab",
        notes:
          "Colourimetric protein detection — secondary verification for surfaces that failed ATP.",
      },
      microbialCultureSwab: {
        label: "Microbial Culture Swab",
        notes:
          "Lab-grown culture; 48–72 hr turnaround. Reserved for high-stakes jobs (occupants immunocompromised, litigation pending).",
      },
    },
    engineLogic:
      "Verification method selected per occupancy risk profile. Failed verification re-opens the §8.4 cleaning sequence on the affected surface.",
    adjusterValue:
      "Clearance is independent + documented — re-occupation decision is defensible against subsequent illness claims.",
  },

  /**
   * Photo + documentation requirements — the on-file evidence trail.
   * Source: IICRC S540:2023 §10.4 — Project documentation.
   */
  photoDocumentation: {
    clauseRef: "IICRC S540:2023 §10.4",
    requirements: [
      "Pre-remediation: overview of each affected zone with scale reference and timestamp",
      "Bulk material removal: photo per regulated-waste container with tag number visible",
      "Surface-by-surface cleaning evidence: before, mid-clean, post-clean for each tagged area",
      "Decontamination station photos: warm/cold zone boundaries and worker doffing area",
      "Verification swab placement photos with sample-ID label visible",
      "Final post-remediation: same angles as pre-remediation for direct comparison",
    ],
    engineLogic:
      "Auto-timestamp, GPS-stamp, and SHA-256 hash every photo per S540:2023 §10.4 + CLAUDE.md progress-framework rule #21 (chain-of-custody manifest).",
    adjusterValue:
      "Photo set is forensic-grade and timestamp-locked — admissible in any subsequent dispute or coronial inquiry.",
  },
} as const;

// ─── STANDARDS VERSION TRACKING ───────────────────────────────────────────────

/**
 * IICRC standards version registry — the single source of truth for which
 * edition/year of each standard RestoreAssist cites.
 *
 * Values verified 2026-06-30 against the owner's LICENSED source documents
 * (IICRC standards library), not web research:
 *   - S500: ANSI/IICRC S500-2021, 5th ed. (overview: "5th Edition ... released
 *     May 2021"). The product's prior "S500:2025" citations were fabricated — standards-cite-ignore
 *     there is no 2025 S500.
 *   - S520: ANSI/IICRC S520-2024, 4th ed. (foreword: "This 4th Edition of the
 *     ANSI/IICRC S520 Standard").
 *   - S700: ANSI/IICRC S700-2025, 1st ed. (header: "ANSI/IICRC S700-2025 ...
 *     First Edition"). S700:2025 is CORRECT — the first edition is 2025; there
 *     is no 2021 or 2015 S700.
 *   - S540: ANSI/IICRC S540-2023, 2nd ed.
 *   - S100: ANSI/IICRC S100-2021, 7th ed.
 *
 * Every citation string in the product should derive from this registry (see
 * standardCite / standardDesignation). scripts/check-standards-citations.ts
 * guards against literals drifting out of sync.
 */
export const STANDARDS_VERSIONS = {
  S500: { edition: "5th", year: 2021, designation: "ANSI/IICRC S500-2021", nextRevisionExpected: 2026 },
  S520: { edition: "4th", year: 2024, designation: "ANSI/IICRC S520-2024", nextRevisionExpected: 2029 },
  S540: { edition: "2nd", year: 2023, designation: "ANSI/IICRC S540-2023", nextRevisionExpected: 2028 },
  S700: { edition: "1st", year: 2025, designation: "ANSI/IICRC S700-2025", nextRevisionExpected: 2030 },
  S100: { edition: "7th", year: 2021, designation: "ANSI/IICRC S100-2021", nextRevisionExpected: 2026 },
  NCC: { edition: "2022", year: 2022, designation: "NCC 2022", nextRevisionExpected: 2025 },
} as const;

export type StandardKey = keyof typeof STANDARDS_VERSIONS;

/**
 * Canonical in-product short citation, e.g. `standardCite("S500")` → "S500:2021",
 * `standardCite("S500", "10.5")` → "S500:2021 §10.5". Use this instead of hard-coding
 * `S###:YYYY` literals so the year always tracks the registry.
 */
export function standardCite(std: StandardKey, section?: string): string {
  const base = `${std}:${STANDARDS_VERSIONS[std].year}`;
  return section ? `${base} §${section.replace(/^§\s*/, "")}` : base;
}

/** Formal designation for report/legal text, e.g. "ANSI/IICRC S500-2021". */
export function standardDesignation(std: StandardKey): string {
  return STANDARDS_VERSIONS[std].designation;
}

/**
 * Get the full citation string for a standards reference
 * Used in PDF report generation to cite the governing clause
 */
export function getStandardsCitation(fieldKey: string): string {
  const allFields = {
    ...S500_FIELD_MAP,
    ...S520_FIELD_MAP,
    ...S540_FIELD_MAP,
    ...S700_FIELD_MAP,
  };
  const field = (allFields as Record<string, { clauseRef: string }>)[fieldKey];
  if (!field) return "Standards reference not found";
  return field.clauseRef;
}

// ─── CLAIM-TYPE PICKER + FIELD-MAP ROUTING ────────────────────────────────────
//
// Punch-list (PR #1029) VERIFIED P1 #7: a tradie selects the governing IICRC
// standard at inspection start so the correct evidence-capture surface renders
// downstream. The 4 options correspond to the 4 IICRC field maps in this file.

/** Subset of Prisma ClaimType for the 4 IICRC-governed claim types. */
export type IicrcClaimType = "WATER" | "MOULD" | "BIOHAZARD" | "FIRE";

export interface ClaimTypePickerOption {
  value: IicrcClaimType;
  label: string;
  description: string;
}

/**
 * The 4-option picker rendered on inspection-start. Labels cite edition+year
 * per CLAUDE.md rule #14.
 */
export const CLAIM_TYPE_PICKER_OPTIONS: readonly ClaimTypePickerOption[] = [
  {
    value: "WATER",
    label: "Water Damage (IICRC S500:2021)",
    description:
      "Burst pipe, flood, roof leak. Category 1/2/3 + Class 1–4 classification, moisture monitoring, drying scope.",
  },
  {
    value: "MOULD",
    label: "Mould Remediation (IICRC S520:2024)",
    description:
      "Visible mould, post-water contamination. Condition 1/2/3 classification, containment, source identification.",
  },
  {
    value: "BIOHAZARD",
    label: "Trauma / Biohazard (IICRC S540:2023)",
    description:
      "Crime scene, unattended death, hoarding. Regulated-waste chain-of-custody, PPE level A/B/C/D, verification swabs.",
  },
  {
    value: "FIRE",
    label: "Fire & Smoke (IICRC S700:2025)",
    description:
      "Structure fire, smoke residue, odour. Wet/dry/protein/fuel residue typing, deodorisation, content pack-out.",
  },
] as const;

/**
 * Returns the field map that governs evidence capture for the selected claim
 * type. The caller renders the form sections keyed by this map. Returns null
 * for any non-IICRC claim type (CARPET, HVAC, etc.) — those use their own
 * downstream assessment surfaces.
 */
export function getFieldMapForClaimType(
  claimType: IicrcClaimType,
):
  | typeof S500_FIELD_MAP
  | typeof S520_FIELD_MAP
  | typeof S540_FIELD_MAP
  | typeof S700_FIELD_MAP
  | null {
  switch (claimType) {
    case "WATER":
      return S500_FIELD_MAP;
    case "MOULD":
      return S520_FIELD_MAP;
    case "BIOHAZARD":
      return S540_FIELD_MAP;
    case "FIRE":
      return S700_FIELD_MAP;
    default:
      return null;
  }
}
