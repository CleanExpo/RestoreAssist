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
 *   IICRC S500 — Standard for Professional Water Damage Restoration (7th Ed)
 *   IICRC S520 — Standard for Professional Mould Remediation (3rd Ed)
 *   IICRC S700 — Standard for Professional Fire and Smoke Damage Restoration (2nd Ed)
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
    clauseRef: 'IICRC S500 §12.3',
    thresholds: {
      wood:       { normal: 12, elevated: 16, critical: 25 },
      drywall:    { normal: 0.5, elevated: 1.0, critical: 2.0 },
      concrete:   { normal: 0.5, elevated: 1.0, critical: 2.0 },
      carpet:     { normal: 0, elevated: 0.1, critical: 0.5 },
    },
    engineLogic: 'Flag reading as NORMAL / ELEVATED / CRITICAL against material-specific threshold. CRITICAL triggers mandatory drying protocol citation.',
    adjusterValue: 'Adjuster sees pass/fail against a published standard clause, not technician judgement.',
  },

  /**
   * Relative humidity — drying target calculation
   * Source: IICRC S500 §12.4 — Drying goal: RH at or below ambient outdoor
   * conditions for the region
   */
  relativeHumidity: {
    clauseRef: 'IICRC S500 §12.4',
    drinkTarget: 'Match or below ambient outdoor RH at time of inspection',
    engineLogic: 'Compute drying target from recorded outdoor RH. Target is calculated, not estimated.',
    adjusterValue: 'Drying target is derived from standard — defensible in dispute.',
  },

  /**
   * Water category classification
   * Source: IICRC S500 §7.1–7.3
   * Cat 1: Clean/potable water  Cat 2: Grey water  Cat 3: Black/contaminated water
   */
  waterCategory: {
    clauseRef: 'IICRC S500 §7.1–7.3',
    definitions: {
      category1: { label: 'Clean Water', source: 'Potable supply, broken pipes, rainwater (initial contact)', requiresContainment: false },
      category2: { label: 'Grey Water', source: 'Washing machine overflow, dishwasher, toilet bowl (urine only)', requiresContainment: false, requiresSanitisation: true },
      category3: { label: 'Black Water', source: 'Sewage, flooding from external bodies, toilet bowl (faecal matter)', requiresContainment: true, requiresPPE: true },
    },
    timeEscalation: 'Cat 1 degrades to Cat 2 after 48 hrs standing (S500 §7.1 note)',
    engineLogic: 'Map observed water source to category. Cat 3 triggers mandatory containment protocol and PPE requirement in scope items.',
    adjusterValue: 'Scope of decontamination is standards-justified, not upsold.',
  },

  /**
   * Water class classification (evaporation load)
   * Source: IICRC S500 §8.1–8.4
   */
  waterClass: {
    clauseRef: 'IICRC S500 §8.1–8.4',
    definitions: {
      class1: { label: 'Slow Evaporation', affectedArea: '<10% of floor space', materials: 'Part of room, low porosity' },
      class2: { label: 'Fast Evaporation', affectedArea: '10–40% of floor space', materials: 'Carpet and cushion, entire room' },
      class3: { label: 'Fastest Evaporation', affectedArea: '>40% of floor space', materials: 'Walls, ceilings, insulation' },
      class4: { label: 'Specialty Drying', affectedArea: 'N/A', materials: 'Concrete, hardwood, plaster, brick' },
    },
    engineLogic: 'Calculate class from affected area %, materials, and moisture readings. Class drives drying equipment selection and quantity.',
    adjusterValue: 'Equipment specification is derived from class, not arbitrary.',
  },

  /**
   * Structural drying equipment adequacy
   * Source: IICRC S500 §14 — Equipment placement and air movement requirements
   */
  dryingEquipment: {
    clauseRef: 'IICRC S500 §14',
    engineLogic: 'Validate equipment selection and quantity against S500 §14 formulas for affected area and class. Flag if proposed equipment is undersized.',
    adjusterValue: 'Equipment adequacy is verifiable — audit trail available.',
  },

  /**
   * Photo documentation standard
   * Source: IICRC S500 §5.3 — Documentation requirements for insurance claims
   */
  photoDocumentation: {
    clauseRef: 'IICRC S500 §5.3',
    requirements: [
      'Auto-timestamp on every photo',
      'GPS geotag on every photo',
      'Sequential numbering per inspection',
      'Minimum coverage: overview, affected areas, moisture meter placement, equipment placement',
    ],
    engineLogic: 'Auto-timestamp, geo-stamp, and sequence photos per S500 §5.3 documentation standard. Flag incomplete coverage.',
    adjusterValue: 'Photos are court-admissible documentation in the correct format.',
  },
} as const

// ─── S520 MOULD REMEDIATION FIELD MAP ─────────────────────────────────────────

export const S520_FIELD_MAP = {
  /**
   * Mould condition classification
   * Source: IICRC S520 §6 — Assessment and classification of mould conditions
   */
  mouldCondition: {
    clauseRef: 'IICRC S520 §6',
    definitions: {
      condition1: { label: 'Normal Fungal Ecology', description: 'No visible mould, air quality normal. No remediation required.' },
      condition2: { label: 'Settled Spores', description: 'Settled spores or hyphal fragments from a condition 3 area. Limited remediation.' },
      condition3: { label: 'Active Mould Growth', description: 'Active mould growth visible. Full remediation required.' },
    },
    engineLogic: 'Map visual observation to Condition 1/2/3. Condition 3 triggers mandatory full remediation scope and containment.',
    adjusterValue: 'Remediation scope is standard-justified — not estimator discretion.',
  },

  /**
   * Containment requirements by affected area
   * Source: IICRC S520 §7.3
   */
  containmentRequirements: {
    clauseRef: 'IICRC S520 §7.3',
    thresholds: {
      noContainment:      { maxArea: 1,   label: '<1 m²' },
      limitedContainment: { maxArea: 10,  label: '1–10 m²' },
      fullContainment:    { maxArea: null, label: '>10 m²' },
    },
    engineLogic: 'Calculate containment requirement from affected area. Cost is formula-derived, not estimator judgement.',
    adjusterValue: 'Containment cost is defensible against the standard.',
  },

  /**
   * Moisture source identification (prerequisite gate)
   * Source: IICRC S520 §8.1 — Source identification required before remediation
   */
  moistureSourceIdentification: {
    clauseRef: 'IICRC S520 §8.1',
    gateCondition: 'MANDATORY — report flagged as INCOMPLETE if moisture source field is empty',
    engineLogic: 'Block scope approval if moisture source is not identified. Prevents scope approval without root cause.',
    adjusterValue: 'Reduces repeat claims by ensuring root cause is addressed before remediation scope is approved.',
  },

  /**
   * Air quality testing requirements
   * Source: IICRC S520 §9 — Pre/post clearance testing
   */
  airQualityTesting: {
    clauseRef: 'IICRC S520 §9',
    triggers: [
      { condition: 'Condition 3 classification', requirement: 'Pre-remediation air sampling mandatory' },
      { condition: 'Affected area >10 m²', requirement: 'Pre and post clearance air sampling' },
      { condition: 'Occupant health vulnerability noted', requirement: 'Pre-remediation industrial hygienist assessment' },
    ],
    engineLogic: 'Flag testing requirement based on condition and area. Adjuster knows upfront — no surprise costs.',
    adjusterValue: 'Liability risk managed systematically.',
  },
} as const

// ─── S700 FIRE AND SMOKE FIELD MAP ────────────────────────────────────────────

export const S700_FIELD_MAP = {
  /**
   * Smoke residue classification
   * Source: IICRC S700 §6
   */
  smokeResidueType: {
    clauseRef: 'IICRC S700 §6',
    types: {
      wetSmoke:   { label: 'Wet Smoke', materials: 'Rubber, plastics, slow smoulder', cleaning: 'Degreaser required, high odour' },
      drySmoke:   { label: 'Dry Smoke', materials: 'Paper, wood, fast burn', cleaning: 'Dry cleaning method first' },
      proteinResidue: { label: 'Protein Residue', materials: 'Kitchen fires, food', cleaning: 'Enzymatic cleaner required' },
      fuelOilSoot: { label: 'Fuel Oil Soot', materials: 'Furnace puff-back', cleaning: 'Dry cleaning sponges, degreaser' },
    },
    engineLogic: 'Map observed residue to type. Type drives cleaning method selection in scope items.',
    adjusterValue: 'Cleaning specification is standard-matched, not arbitrary.',
  },

  /**
   * Structural stability assessment
   * Source: IICRC S700 §8
   */
  structuralStability: {
    clauseRef: 'IICRC S700 §8',
    gateCondition: 'Structural stability must be assessed before restoration work proceeds',
    engineLogic: 'Require structural stability field completion before scope generation. Flag if stability is uncertain.',
    adjusterValue: 'Safety and liability risk managed before scope commitment.',
  },
} as const

// ─── STANDARDS VERSION TRACKING ───────────────────────────────────────────────

export const STANDARDS_VERSIONS = {
  S500: { edition: '7th', year: 2021, nextRevisionExpected: 2027 },
  S520: { edition: '3rd', year: 2015, nextRevisionExpected: 2026 },
  S700: { edition: '2nd', year: 2015, nextRevisionExpected: 2026 },
  NCC:  { edition: '2022', year: 2022, nextRevisionExpected: 2025 },
} as const

/**
 * Get the full citation string for a standards reference
 * Used in PDF report generation to cite the governing clause
 */
export function getStandardsCitation(fieldKey: string): string {
  const allFields = { ...S500_FIELD_MAP, ...S520_FIELD_MAP, ...S700_FIELD_MAP }
  const field = (allFields as Record<string, { clauseRef: string }>)[fieldKey]
  if (!field) return 'Standards reference not found'
  return field.clauseRef
}
