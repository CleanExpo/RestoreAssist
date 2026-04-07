/**
 * NIR Field Reality Specification
 *
 * Defines the non-negotiable technical and UX requirements for the NIR
 * mobile application based on actual field conditions in Australian
 * restoration work.
 *
 * Critique addressed: C4 — Field conditions not addressed in app design
 *
 * The central insight: the NIR mobile app must work in:
 *   - Basements and crawl spaces (no connectivity)
 *   - Flood-damaged properties (disrupted telco)
 *   - Confined spaces (one-handed, PPE gloves)
 *   - Bright sunlight on roofs
 *   - Emergency conditions (partial data is better than no data)
 */

// ─── OFFLINE-FIRST REQUIREMENTS ───────────────────────────────────────────────

export const OFFLINE_REQUIREMENTS = {
  /**
   * The app MUST function in full offline mode.
   * Connectivity is not guaranteed in any field condition.
   */
  fullOfflineCapability: {
    required: true,
    scope:
      "All form fields, photo capture, and measurement recording must function without internet",
    syncBehaviour:
      "Auto-sync on connectivity restore. No manual sync required from technician.",
    conflictResolution:
      "Last-write-wins for non-conflicting fields. Manual merge prompt for conflicting fields on same claim.",
    localStorageTarget:
      "500 inspection records with full photo sets without performance degradation",
  },

  syncStatusIndicator: {
    required: true,
    states: ["SYNCED", "PENDING_SYNC", "SYNC_CONFLICT", "OFFLINE"],
    placement: "Always visible — persistent status bar element",
    rationale:
      "Technicians must know which data is confirmed server-side before leaving a site.",
  },
} as const;

// ─── BLUETOOTH EQUIPMENT INTEGRATION ──────────────────────────────────────────

export const BLUETOOTH_EQUIPMENT = {
  /**
   * Priority 1 — Required for Phase 2 pilot
   * Manual re-entry of meter readings is a fraud and error risk.
   */
  p1_required: [
    {
      category: "Pin moisture meter",
      targetBrands: ["Tramex MEP", "Delmhorst BD-2100"],
      dataPoints: ["moisture_content_percent", "material_type"],
      integrationMethod: "Bluetooth LE pairing",
      phase: "Phase 2 pilot",
    },
    {
      category: "Non-invasive moisture meter",
      targetBrands: ["Tramex CMEXv5", "GE Protimeter Surveymaster"],
      dataPoints: ["moisture_content_percent", "mapped_readings"],
      integrationMethod: "Bluetooth LE pairing",
      phase: "Phase 2 pilot",
    },
    {
      category: "Thermo-hygrometer",
      targetBrands: ["Testo 605-H1", "Vaisala HM70"],
      dataPoints: [
        "relative_humidity_percent",
        "temperature_celsius",
        "dew_point_celsius",
      ],
      integrationMethod: "Bluetooth LE pairing",
      phase: "Phase 2 pilot",
    },
  ],

  /**
   * Priority 2 — Phase 3 target
   */
  p2_phase3: [
    {
      category: "Thermal imaging camera",
      targetBrands: ["FLIR E5-XT", "Seek Thermal CompactPRO"],
      dataPoints: ["thermal_image", "hot_cold_zone_markers"],
      integrationMethod: "WiFi Direct or USB-C",
      phase: "Phase 3",
    },
    {
      category: "Air quality monitor",
      targetBrands: ["TSI Q-Trak 7575", "Aeroqual Series 200"],
      dataPoints: ["co2_ppm", "voc_ppm", "particulate_matter_pm25"],
      integrationMethod: "Bluetooth LE pairing",
      note: "Required for mould remediation sites where air quality testing is triggered",
      phase: "Phase 3",
    },
  ],
} as const;

// ─── PHYSICAL UX REQUIREMENTS ─────────────────────────────────────────────────

export const PHYSICAL_UX_REQUIREMENTS = {
  /**
   * Glove compatibility
   * Nitrile and latex PPE gloves must not prevent form completion.
   */
  gloveCompatible: {
    required: true,
    minimumTapTargetSize: "10mm × 10mm",
    prohibitedGestures: [
      "swipe-to-confirm",
      "pinch-zoom for primary navigation",
    ],
    rationale:
      "Category 3 water damage and mould sites require PPE including gloves.",
  },

  /**
   * Bright sunlight readability
   * Roof, exterior, and outdoor field conditions.
   */
  sunlightReadable: {
    required: true,
    minimumDisplayBrightness: "600 nits compatibility",
    highContrastMode:
      "Required — all primary UI elements must pass WCAG AA at 600 nits",
    rationale:
      "Roof inspections, exterior moisture mapping, and outdoor photo documentation are common.",
  },

  /**
   * One-handed operation
   * Confined spaces require one hand for stability.
   */
  oneHandedOperation: {
    required: true,
    scope: "Core data entry must be completable with one hand",
    thumb_reach_zone:
      "All critical fields accessible in thumb reach zone on 6-inch screen",
    rationale:
      "Crawl space and subfloor inspections require one hand for stability or torch.",
  },

  /**
   * Tiered completion model
   * A safe partial record is better than no record in emergency conditions.
   */
  tieredCompletion: {
    required: true,
    tiers: {
      critical: {
        description: "Fields that are REQUIRED before submission",
        examples: [
          "property_address",
          "water_category",
          "affected_area_sqm",
          "min_one_photo",
        ],
        blockSubmission: true,
      },
      supplementary: {
        description:
          "Fields that SHOULD be completed but do not block submission",
        examples: [
          "all_moisture_readings",
          "equipment_serial_numbers",
          "full_scope_items",
        ],
        blockSubmission: false,
        flagInReport: true, // Report flags incomplete supplementary fields
      },
    },
    rationale:
      "Emergency water damage requires immediate documentation before conditions change. A critical-fields-only record is valid and submittable.",
  },

  /**
   * Voice note support
   * Some conditions are difficult to describe via dropdown.
   */
  voiceNoteSupport: {
    required: true,
    attachmentScope: "Available on any field",
    useCases: [
      "Unusual odour characteristics (mould type indicators)",
      "Structural sounds (active leaks, building movement)",
      "Conditions requiring narrative beyond dropdown options",
    ],
    offlineCapable: true,
  },
} as const;
