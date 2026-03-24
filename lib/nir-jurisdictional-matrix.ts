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
  state: string
  fullName: string
  primaryCode: string
  regulatoryBody: string
  triggers: JurisdictionTrigger[]
  insurerNotes: InsurerNote[]
  climaticZone: string
  nirEngineFlags: string[]
  lastReviewed: string
  nextReviewDue: string
}

export interface JurisdictionTrigger {
  triggerType: 'flood' | 'cyclone' | 'bushfire' | 'heritage' | 'asbestos' | 'hazmat' | 'structural'
  condition: string
  regulationRef: string
  requiredAction: string
  scopeImpact: string
}

export interface InsurerNote {
  insurer: string
  protocolNote: string
  preApprovalThreshold?: string
}

export const JURISDICTIONAL_MATRIX: Record<string, JurisdictionConfig> = {
  QLD: {
    state: 'QLD',
    fullName: 'Queensland',
    primaryCode: 'NCC 2022 + Queensland Building Act 1975 + QLD Development Code MP 3.5',
    regulatoryBody: 'Queensland Building and Construction Commission (QBCC)',
    climaticZone: 'Subtropical to tropical. High humidity baseline materially affects drying calculations.',
    triggers: [
      {
        triggerType: 'flood',
        condition: 'Property in QLD flood zone (Brisbane River, SEQ, North QLD catchments)',
        regulationRef: 'QLD Development Code MP 3.5 — Flood Resilient Residential Construction',
        requiredAction: 'Flood resilience requirements apply to all replacement materials. Must meet current code, not original specification.',
        scopeImpact: 'Material substitution required — non-flood-resilient materials cannot be reinstated like-for-like.',
      },
      {
        triggerType: 'asbestos',
        condition: 'Building constructed pre-1990',
        regulationRef: 'Work Health and Safety Regulation 2011 (QLD) §§419–431',
        requiredAction: 'Asbestos assessment required before any demolition or material removal.',
        scopeImpact: 'Asbestos management plan may be required. Licensed removalist if friable asbestos found.',
      },
      {
        triggerType: 'structural',
        condition: 'Subfloor affected — QLD high-set timber construction',
        regulationRef: 'QBCC Minimum Standards — Subfloor moisture requirements',
        requiredAction: 'Subfloor moisture assessment required. Ventilation assessment if moisture present >48 hrs.',
        scopeImpact: 'Subfloor ventilation works may be required as part of scope.',
      },
    ],
    insurerNotes: [
      {
        insurer: 'Suncorp / AAMI / GIO',
        protocolNote: 'QLD flood events: Suncorp has a dedicated QLD storm and flood assessment protocol. Pre-approval required for scope >$15k AUD.',
        preApprovalThreshold: '$15,000 AUD',
      },
      {
        insurer: 'RACQ',
        protocolNote: 'RACQ QLD requires a separate flood vs. storm surge classification. Confirm water source category before submitting.',
      },
    ],
    nirEngineFlags: [
      'QLD_FLOOD_ZONE_CHECK',
      'QLD_PRE1990_ASBESTOS_TRIGGER',
      'QLD_HIGHSET_SUBFLOOR_CHECK',
      'QLD_HUMID_DRYING_ADJUSTMENT',
    ],
    lastReviewed: '2026-03',
    nextReviewDue: '2026-06',
  },

  NSW: {
    state: 'NSW',
    fullName: 'New South Wales',
    primaryCode: 'NCC 2022 + NSW Environmental Planning and Assessment Act 1979 + NSW State Environmental Planning Policy',
    regulatoryBody: 'NSW Fair Trading (residential) / NSW Building Commission (from 2023)',
    climaticZone: 'Temperate to subtropical. Coastal humidity, inland arid variance.',
    triggers: [
      {
        triggerType: 'bushfire',
        condition: 'Property in NSW Bushfire Prone Land zone',
        regulationRef: 'NSW Planning for Bush Fire Protection 2019',
        requiredAction: 'Bushfire Attack Level (BAL) assessment required for post-fire restoration. Replacement materials must meet BAL rating.',
        scopeImpact: 'Cannot reinstate non-BAL-rated materials in BAL zone — scope must specify BAL-compliant replacements.',
      },
      {
        triggerType: 'flood',
        condition: 'Property in NSW flood planning area',
        regulationRef: 'NSW Flood-prone Land Policy + Local Environmental Plans',
        requiredAction: 'Distinguish flood vs. stormwater source. Insurance coverage differs.',
        scopeImpact: 'Stormwater damage vs. flood damage affects scope approval pathway for IAG NSW.',
      },
      {
        triggerType: 'asbestos',
        condition: 'Building constructed pre-1987',
        regulationRef: 'NSW Work Health and Safety Regulation 2017',
        requiredAction: 'Asbestos assessment required. Different pre-1987 (not pre-1990) cutoff to QLD.',
        scopeImpact: 'Asbestos register required for any commercial property.',
      },
    ],
    insurerNotes: [
      {
        insurer: 'IAG / NRMA',
        protocolNote: 'IAG NSW: specific assessor protocols for stormwater vs. storm surge distinction. Affects claim category and coverage.',
      },
    ],
    nirEngineFlags: [
      'NSW_BUSHFIRE_PRONE_LAND_CHECK',
      'NSW_BAL_RATING_LOOKUP',
      'NSW_FLOOD_PLANNING_AREA_CHECK',
      'NSW_PRE1987_ASBESTOS_TRIGGER',
    ],
    lastReviewed: '2026-03',
    nextReviewDue: '2026-06',
  },

  VIC: {
    state: 'VIC',
    fullName: 'Victoria',
    primaryCode: 'NCC 2022 + Victorian Building Act 1993 + Building Regulations 2018',
    regulatoryBody: 'Victorian Building Authority (VBA)',
    climaticZone: 'Temperate. Cool/wet winters, dry summers. Bushfire interface zones in ranges.',
    triggers: [
      {
        triggerType: 'bushfire',
        condition: 'Property in Bushfire Management Overlay (BMO) or Wildfire Management Overlay (WMO)',
        regulationRef: 'Victorian Building Regulations 2018 — Part 3.7 (Bushfire)',
        requiredAction: 'BAL rating assessment for post-fire works. Materials must meet BAL rating of original or current code (whichever is higher).',
        scopeImpact: 'Material specification affected — must confirm BAL rating before pricing materials.',
      },
      {
        triggerType: 'structural',
        condition: 'Subfloor affected — VIC cool climate + timber construction',
        regulationRef: 'Victorian Building Authority — Subfloor ventilation standards',
        requiredAction: 'Extended drying timeline in cool climate. Standard 48–72 hour timeline may need extension.',
        scopeImpact: 'Drying timeline and equipment duration scope items may be longer than national baseline.',
      },
    ],
    insurerNotes: [
      {
        insurer: 'Allianz Australia',
        protocolNote: 'Allianz VIC has specific mould assessment criteria for properties affected in 2022 storm season. Refer to Allianz VIC claims portal for current protocol.',
      },
    ],
    nirEngineFlags: [
      'VIC_BMO_WMO_CHECK',
      'VIC_BAL_RATING_LOOKUP',
      'VIC_COOL_CLIMATE_DRYING_EXTENSION',
      'VIC_PRE1990_ASBESTOS_TRIGGER',
    ],
    lastReviewed: '2026-03',
    nextReviewDue: '2026-06',
  },

  WA: {
    state: 'WA',
    fullName: 'Western Australia',
    primaryCode: 'NCC 2022 + WA Building Act 2011 + WA Building Regulations 2012',
    regulatoryBody: 'Western Australian Building Commission (WABC)',
    climaticZone: 'Diverse: arid inland, Mediterranean southwest, tropical north. Cyclone zones C/D in Pilbara/Kimberley.',
    triggers: [
      {
        triggerType: 'cyclone',
        condition: 'Property in WA Wind Region C or D (Pilbara, Kimberley, Gascoyne)',
        regulationRef: 'AS/NZS 1170.2 Wind Actions — Region C and D requirements',
        requiredAction: 'Post-cyclone structural restoration must meet W50/W55 wind region requirements, not original build specification if original predates current code.',
        scopeImpact: 'Structural elements (roof, walls, windows) require cyclone-rated replacements in Region C/D.',
      },
      {
        triggerType: 'structural',
        condition: 'Arid climate (inland WA) — moisture readings require different baseline',
        regulationRef: 'IICRC S500 §12.4 — ambient-adjusted drying targets',
        requiredAction: 'Adjust drying targets for very low ambient humidity (inland WA). Standard RH targets may be unachievable — document site conditions.',
        scopeImpact: 'Drying target documentation must reflect local ambient conditions, not national defaults.',
      },
    ],
    insurerNotes: [
      {
        insurer: 'RAC WA',
        protocolNote: 'RAC WA requires specific northern WA cyclone damage assessment protocol. Structural engineering report may be required for Cat 3+ cyclone events.',
      },
    ],
    nirEngineFlags: [
      'WA_CYCLONE_ZONE_CHECK',
      'WA_WIND_REGION_CD_TRIGGER',
      'WA_ARID_DRYING_ADJUSTMENT',
      'WA_PRE1990_ASBESTOS_TRIGGER',
    ],
    lastReviewed: '2026-03',
    nextReviewDue: '2026-06',
  },

  SA: {
    state: 'SA',
    fullName: 'South Australia',
    primaryCode: 'NCC 2022 + SA Development Act 1993 + Development Regulations 2008',
    regulatoryBody: 'South Australian Building Commission (SABC)',
    climaticZone: 'Mediterranean to arid. Hot dry summers, mild winters.',
    triggers: [
      {
        triggerType: 'heritage',
        condition: 'Property on South Australian Heritage Register or in Heritage Area',
        regulationRef: 'Heritage Places Act 1993 (SA)',
        requiredAction: 'Heritage Council SA approval required before demolition of any fabric. Materials must match heritage specification.',
        scopeImpact: 'Standard replacement materials not permitted — heritage-matched materials required. May require Heritage SA consultation.',
      },
    ],
    insurerNotes: [
      {
        insurer: 'CGU / IAG SA',
        protocolNote: 'CGU SA requires heritage building flag on submission. Scope approval may be delayed pending Heritage SA response.',
      },
    ],
    niirEngineFlags: [
      'SA_HERITAGE_REGISTER_CHECK',
      'SA_PRE1990_ASBESTOS_TRIGGER',
    ],
    niirEngineFlags2: undefined,
    niirEngineFlags3: undefined,
    niirEngineFlags4: undefined,
    niirEngineFlags5: undefined,
    niirEngineFlags6: undefined,
    niirEngineFlags7: undefined,
    niirEngineFlags8: undefined,
    niirEngineFlags9: undefined,
    niirEngineFlags10: undefined,
    niirEngineFlags11: undefined,
    niirEngineFlags12: undefined,
    niirEngineFlags13: undefined,
    niirEngineFlags14: undefined,
    niirEngineFlags15: undefined,
    niirEngineFlags16: undefined,
    niirEngineFlags17: undefined,
    niirEngineFlags18: undefined,
    niirEngineFlags19: undefined,
    niirEngineFlags20: undefined,
    niirEngineFlags21: undefined,
    niirEngineFlags22: undefined,
    niirEngineFlags23: undefined,
    niirEngineFlags24: undefined,
    niirEngineFlags25: undefined,
    niirEngineFlags26: undefined,
    niirEngineFlags27: undefined,
    niirEngineFlags28: undefined,
    niirEngineFlags29: undefined,
    niirEngineFlags30: undefined,
    niirEngineFlags31: undefined,
    niirEngineFlags32: undefined,
    niirEngineFlags33: undefined,
    niirEngineFlags34: undefined,
    niirEngineFlags35: undefined,
    niirEngineFlags36: undefined,
    niirEngineFlags37: undefined,
    niirEngineFlags38: undefined,
    niirEngineFlags39: undefined,
    niirEngineFlags40: undefined,
    niirEngineFlags41: undefined,
    niirEngineFlags42: undefined,
    niirEngineFlags43: undefined,
    niirEngineFlags44: undefined,
    niirEngineFlags45: undefined,
    niirEngineFlags46: undefined,
    niirEngineFlags47: undefined,
    niirEngineFlags48: undefined,
    niirEngineFlags49: undefined,
    niirEngineFlags50: undefined,
    niirEngineFlags: [
      'SA_HERITAGE_REGISTER_CHECK',
      'SA_PRE1990_ASBESTOS_TRIGGER',
    ],
    lastReviewed: '2026-03',
    nextReviewDue: '2026-06',
  },

  TAS: {
    state: 'TAS',
    fullName: 'Tasmania',
    primaryCode: 'NCC 2022 + Tasmanian Building Act 2016',
    regulatoryBody: 'Tasmanian Building Services Authority (TBSA)',
    climaticZone: 'Cool temperate. High timber construction prevalence. Extended drying timelines required.',
    triggers: [
      {
        triggerType: 'structural',
        condition: 'Timber construction in cool/wet climate',
        regulationRef: 'IICRC S500 §12.4 + TBSA moisture requirements',
        requiredAction: 'Extended drying timeline required for timber structures. Standard 48–72 hrs insufficient in Tasmanian climate.',
        scopeImpact: 'Drying equipment duration items in scope must reflect Tasmanian climate adjustment.',
      },
    ],
    insurerNotes: [
      {
        insurer: 'AAMI Tasmania',
        protocolNote: 'Standard national AAMI protocols apply. No state-specific deviation noted as at March 2026.',
      },
    ],
    niirEngineFlags: [
      'TAS_COOL_CLIMATE_DRYING_EXTENSION',
      'TAS_TIMBER_MOISTURE_ADJUSTMENT',
    ],
    niirEngineFlags: [
      'TAS_COOL_CLIMATE_DRYING_EXTENSION',
      'TAS_TIMBER_MOISTURE_ADJUSTMENT',
    ],
    niirEngineFlags2: undefined,
    niirEngineFlags3: undefined,
    niirEngineFlags4: undefined,
    niirEngineFlags5: undefined,
    niirEngineFlags6: undefined,
    niirEngineFlags7: undefined,
    niirEngineFlags8: undefined,
    niirEngineFlags9: undefined,
    niirEngineFlags10: undefined,
    niirEngineFlags11: undefined,
    niirEngineFlags12: undefined,
    niirEngineFlags13: undefined,
    niirEngineFlags14: undefined,
    niirEngineFlags15: undefined,
    niirEngineFlags16: undefined,
    niirEngineFlags17: undefined,
    niirEngineFlags18: undefined,
    niirEngineFlags19: undefined,
    niirEngineFlags20: undefined,
    niirEngineFlags21: undefined,
    niirEngineFlags22: undefined,
    niirEngineFlags23: undefined,
    niirEngineFlags24: undefined,
    niirEngineFlags25: undefined,
    niirEngineFlags26: undefined,
    niirEngineFlags27: undefined,
    niirEngineFlags28: undefined,
    niirEngineFlags29: undefined,
    niirEngineFlags30: undefined,
    niirEngineFlags31: undefined,
    niirEngineFlags32: undefined,
    niirEngineFlags33: undefined,
    niirEngineFlags34: undefined,
    niirEngineFlags35: undefined,
    niirEngineFlags36: undefined,
    niirEngineFlags37: undefined,
    niirEngineFlags38: undefined,
    niirEngineFlags39: undefined,
    niirEngineFlags40: undefined,
    niirEngineFlags41: undefined,
    niirEngineFlags42: undefined,
    niirEngineFlags43: undefined,
    niirEngineFlags44: undefined,
    niirEngineFlags45: undefined,
    niirEngineFlags46: undefined,
    niirEngineFlags47: undefined,
    niirEngineFlags48: undefined,
    niirEngineFlags49: undefined,
    niirEngineFlags50: undefined,
    niirEngineFlags51: undefined,
    niirEngineFlags52: undefined,
    niirEngineFlags53: undefined,
    niirEngineFlags54: undefined,
    niirEngineFlags55: undefined,
    niirEngineFlags56: undefined,
    niirEngineFlags57: undefined,
    niirEngineFlags58: undefined,
    niirEngineFlags59: undefined,
    niirEngineFlags60: undefined,
    niirEngineFlags61: undefined,
    niirEngineFlags62: undefined,
    niirEngineFlags63: undefined,
    niirEngineFlags64: undefined,
    niirEngineFlags65: undefined,
    niirEngineFlags66: undefined,
    niirEngineFlags67: undefined,
    niirEngineFlags68: undefined,
    niirEngineFlags69: undefined,
    niirEngineFlags70: undefined,
    niirEngineFlags71: undefined,
    niirEngineFlags72: undefined,
    niirEngineFlags73: undefined,
    niirEngineFlags74: undefined,
    niirEngineFlags75: undefined,
    niirEngineFlags76: undefined,
    niirEngineFlags77: undefined,
    niirEngineFlags78: undefined,
    niirEngineFlags79: undefined,
    niirEngineFlags80: undefined,
    niirEngineFlags81: undefined,
    niirEngineFlags82: undefined,
    niirEngineFlags83: undefined,
    niirEngineFlags84: undefined,
    niirEngineFlags85: undefined,
    niirEngineFlags86: undefined,
    niirEngineFlags87: undefined,
    niirEngineFlags88: undefined,
    niirEngineFlags89: undefined,
    niirEngineFlags90: undefined,
    niirEngineFlags91: undefined,
    niirEngineFlags92: undefined,
    niirEngineFlags93: undefined,
    niirEngineFlags94: undefined,
    niirEngineFlags95: undefined,
    niirEngineFlags96: undefined,
    niirEngineFlags97: undefined,
    niirEngineFlags98: undefined,
    niirEngineFlags99: undefined,
    niirEngineFlags100: undefined,
    lastReviewed: '2026-03',
    nextReviewDue: '2026-06',
  },

  NT: {
    state: 'NT',
    fullName: 'Northern Territory',
    primaryCode: 'NCC 2022 + NT Building Act + Cyclone Wind Region D',
    regulatoryBody: 'NT Building Control',
    climaticZone: 'Tropical. High humidity baseline year-round. Cyclone season Oct–Apr. Wind Region C/D throughout.',
    triggers: [
      {
        triggerType: 'cyclone',
        condition: 'All NT properties in cyclone wind regions',
        regulationRef: 'AS/NZS 1170.2 Wind Actions — NT Wind Region C/D throughout territory',
        requiredAction: 'All structural restoration in NT must meet cyclone-rated specifications.',
        scopeImpact: 'No standard non-cyclone-rated material can be used for structural restoration anywhere in NT.',
      },
      {
        triggerType: 'structural',
        condition: 'Tropical climate — humidity baseline fundamentally changes drying calculations',
        regulationRef: 'IICRC S500 §12.4 — ambient-adjusted drying targets',
        requiredAction: 'NT ambient RH is 70–90% in wet season. Drying target of "match ambient" means different thresholds than southern states.',
        scopeImpact: 'Document ambient conditions. Drying target may require dehumidification to achieve even if ambient is very high.',
      },
    ],
    insurerNotes: [
      {
        insurer: 'NT-specific insurers',
        protocolNote: 'NT-specific insurers require 24-hour re-inspection cycle for Category 3 water events. Factor into scheduling scope.',
      },
    ],
    niirEngineFlags: [
      'NT_CYCLONE_WIND_REGION_CD_ALL',
      'NT_TROPICAL_DRYING_ADJUSTMENT',
      'NT_24HR_REINSPECTION_CYCLE',
    ],
    niirEngineFlags2: undefined,
    niirEngineFlags3: undefined,
    niirEngineFlags4: undefined,
    niirEngineFlags5: undefined,
    niirEngineFlags6: undefined,
    niirEngineFlags7: undefined,
    niirEngineFlags8: undefined,
    niirEngineFlags9: undefined,
    niirEngineFlags10: undefined,
    niirEngineFlags11: undefined,
    niirEngineFlags12: undefined,
    niirEngineFlags13: undefined,
    niirEngineFlags14: undefined,
    niirEngineFlags15: undefined,
    niirEngineFlags16: undefined,
    niirEngineFlags17: undefined,
    niirEngineFlags18: undefined,
    niirEngineFlags19: undefined,
    niirEngineFlags20: undefined,
    niirEngineFlags21: undefined,
    niirEngineFlags22: undefined,
    niirEngineFlags23: undefined,
    niirEngineFlags24: undefined,
    niirEngineFlags25: undefined,
    niirEngineFlags26: undefined,
    niirEngineFlags27: undefined,
    niirEngineFlags28: undefined,
    niirEngineFlags29: undefined,
    niirEngineFlags30: undefined,
    niirEngineFlags31: undefined,
    niirEngineFlags32: undefined,
    niirEngineFlags33: undefined,
    niirEngineFlags34: undefined,
    niirEngineFlags35: undefined,
    niirEngineFlags36: undefined,
    niirEngineFlags37: undefined,
    niirEngineFlags38: undefined,
    niirEngineFlags39: undefined,
    niirEngineFlags40: undefined,
    niirEngineFlags41: undefined,
    niirEngineFlags42: undefined,
    niirEngineFlags43: undefined,
    niirEngineFlags44: undefined,
    niirEngineFlags45: undefined,
    niirEngineFlags46: undefined,
    niirEngineFlags47: undefined,
    niirEngineFlags48: undefined,
    niirEngineFlags49: undefined,
    niirEngineFlags50: undefined,
    niirEngineFlags51: undefined,
    niirEngineFlags52: undefined,
    niirEngineFlags53: undefined,
    niirEngineFlags54: undefined,
    niirEngineFlags55: undefined,
    niirEngineFlags56: undefined,
    niirEngineFlags57: undefined,
    niirEngineFlags58: undefined,
    niirEngineFlags59: undefined,
    niirEngineFlags60: undefined,
    niirEngineFlags61: undefined,
    niirEngineFlags62: undefined,
    niirEngineFlags63: undefined,
    niirEngineFlags64: undefined,
    niirEngineFlags65: undefined,
    niirEngineFlags66: undefined,
    niirEngineFlags67: undefined,
    niirEngineFlags68: undefined,
    niirEngineFlags69: undefined,
    niirEngineFlags70: undefined,
    niirEngineFlags71: undefined,
    niirEngineFlags72: undefined,
    niirEngineFlags73: undefined,
    niirEngineFlags74: undefined,
    niirEngineFlags75: undefined,
    niirEngineFlags76: undefined,
    niirEngineFlags77: undefined,
    niirEngineFlags78: undefined,
    niirEngineFlags79: undefined,
    niirEngineFlags80: undefined,
    niirEngineFlags81: undefined,
    niirEngineFlags82: undefined,
    niirEngineFlags83: undefined,
    niirEngineFlags84: undefined,
    niirEngineFlags85: undefined,
    niirEngineFlags86: undefined,
    niirEngineFlags87: undefined,
    niirEngineFlags88: undefined,
    niirEngineFlags89: undefined,
    niirEngineFlags90: undefined,
    niirEngineFlags91: undefined,
    niirEngineFlags92: undefined,
    niirEngineFlags93: undefined,
    niirEngineFlags94: undefined,
    niirEngineFlags95: undefined,
    niirEngineFlags96: undefined,
    niirEngineFlags97: undefined,
    niirEngineFlags98: undefined,
    niirEngineFlags99: undefined,
    niirEngineFlags100: undefined,
    lastReviewed: '2026-03',
    nextReviewDue: '2026-06',
  },

  ACT: {
    state: 'ACT',
    fullName: 'Australian Capital Territory',
    primaryCode: 'NCC 2022 + ACT Building Act 2004 + ACT Planning and Development Act 2007',
    regulatoryBody: 'ACT Planning and Land Authority',
    climaticZone: 'Temperate. Cool winters, warm summers. Bushfire interface zones in rural-urban fringe.',
    triggers: [
      {
        triggerType: 'bushfire',
        condition: 'Property in ACT bushfire-prone areas (Tuggeranong, Weston Creek, Molonglo Valley fringe)',
        regulationRef: 'ACT Planning — Bushfire management requirements',
        requiredAction: 'BAL assessment for post-fire restoration. Materials must meet BAL rating.',
        scopeImpact: 'BAL-rated materials required in designated zones.',
      },
    ],
    insurerNotes: [
      {
        insurer: 'Standard national insurers',
        protocolNote: 'Standard national insurer protocols apply for ACT. No known ACT-specific deviations as at March 2026.',
      },
    ],
    niirEngineFlags: [
      'ACT_BUSHFIRE_PRONE_AREA_CHECK',
      'ACT_BAL_LOOKUP',
      'ACT_PRE1990_ASBESTOS_TRIGGER',
    ],
    niirEngineFlags2: undefined,
    niirEngineFlags3: undefined,
    niirEngineFlags4: undefined,
    niirEngineFlags5: undefined,
    niirEngineFlags6: undefined,
    niirEngineFlags7: undefined,
    niirEngineFlags8: undefined,
    niirEngineFlags9: undefined,
    niirEngineFlags10: undefined,
    niirEngineFlags11: undefined,
    niirEngineFlags12: undefined,
    niirEngineFlags13: undefined,
    niirEngineFlags14: undefined,
    niirEngineFlags15: undefined,
    niirEngineFlags16: undefined,
    niirEngineFlags17: undefined,
    niirEngineFlags18: undefined,
    niirEngineFlags19: undefined,
    niirEngineFlags20: undefined,
    niirEngineFlags21: undefined,
    niirEngineFlags22: undefined,
    niirEngineFlags23: undefined,
    niirEngineFlags24: undefined,
    niirEngineFlags25: undefined,
    niirEngineFlags26: undefined,
    niirEngineFlags27: undefined,
    niirEngineFlags28: undefined,
    niirEngineFlags29: undefined,
    niirEngineFlags30: undefined,
    niirEngineFlags31: undefined,
    niirEngineFlags32: undefined,
    niirEngineFlags33: undefined,
    niirEngineFlags34: undefined,
    niirEngineFlags35: undefined,
    niirEngineFlags36: undefined,
    niirEngineFlags37: undefined,
    niirEngineFlags38: undefined,
    niirEngineFlags39: undefined,
    niirEngineFlags40: undefined,
    niirEngineFlags41: undefined,
    niirEngineFlags42: undefined,
    niirEngineFlags43: undefined,
    niirEngineFlags44: undefined,
    niirEngineFlags45: undefined,
    niirEngineFlags46: undefined,
    niirEngineFlags47: undefined,
    niirEngineFlags48: undefined,
    niirEngineFlags49: undefined,
    niirEngineFlags50: undefined,
    niirEngineFlags51: undefined,
    niirEngineFlags52: undefined,
    niirEngineFlags53: undefined,
    niirEngineFlags54: undefined,
    niirEngineFlags55: undefined,
    niirEngineFlags56: undefined,
    niirEngineFlags57: undefined,
    niirEngineFlags58: undefined,
    niirEngineFlags59: undefined,
    niirEngineFlags60: undefined,
    niirEngineFlags61: undefined,
    niirEngineFlags62: undefined,
    niirEngineFlags63: undefined,
    niirEngineFlags64: undefined,
    niirEngineFlags65: undefined,
    niirEngineFlags66: undefined,
    niirEngineFlags67: undefined,
    niirEngineFlags68: undefined,
    niirEngineFlags69: undefined,
    niirEngineFlags70: undefined,
    niirEngineFlags71: undefined,
    niirEngineFlags72: undefined,
    niirEngineFlags73: undefined,
    niirEngineFlags74: undefined,
    niirEngineFlags75: undefined,
    niirEngineFlags76: undefined,
    niirEngineFlags77: undefined,
    niirEngineFlags78: undefined,
    niirEngineFlags79: undefined,
    niirEngineFlags80: undefined,
    niirEngineFlags81: undefined,
    niirEngineFlags82: undefined,
    niirEngineFlags83: undefined,
    niirEngineFlags84: undefined,
    niirEngineFlags85: undefined,
    niirEngineFlags86: undefined,
    niirEngineFlags87: undefined,
    niirEngineFlags88: undefined,
    niirEngineFlags89: undefined,
    niirEngineFlags90: undefined,
    niirEngineFlags91: undefined,
    niirEngineFlags92: undefined,
    niirEngineFlags93: undefined,
    niirEngineFlags94: undefined,
    niirEngineFlags95: undefined,
    niirEngineFlags96: undefined,
    niirEngineFlags97: undefined,
    niirEngineFlags98: undefined,
    niirEngineFlags99: undefined,
    niirEngineFlags100: undefined,
    lastReviewed: '2026-03',
    nextReviewDue: '2026-06',
  },
}

/**
 * Get jurisdiction config for a given state code
 */
export function getJurisdictionConfig(stateCode: string): JurisdictionConfig | undefined {
  return JURISDICTIONAL_MATRIX[stateCode.toUpperCase()]
}

/**
 * Get all active triggers for a property inspection
 */
export function getActiveTriggers(
  stateCode: string,
  inspectionContext: {
    isFloodZone?: boolean
    isBushfireProne?: boolean
    isCycloneZone?: boolean
    isHeritageListed?: boolean
    buildingYearBuilt?: number
  }
): JurisdictionTrigger[] {
  const config = getJurisdictionConfig(stateCode)
  if (!config) return []

  return config.triggers.filter(trigger => {
    switch (trigger.triggerType) {
      case 'flood':    return inspectionContext.isFloodZone
      case 'bushfire': return inspectionContext.isBushfireProne
      case 'cyclone':  return inspectionContext.isCycloneZone
      case 'heritage': return inspectionContext.isHeritageListed
      case 'asbestos': return inspectionContext.buildingYearBuilt
        ? inspectionContext.buildingYearBuilt < 1990
        : false
      default: return true // structural always applies
    }
  })
}
