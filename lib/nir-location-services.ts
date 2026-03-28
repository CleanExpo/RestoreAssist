/**
 * NIR Location Services — Postcode-Based Property Risk Flag Detection
 *
 * Implements Integration #2 of the NIR v2.0 roadmap:
 * "Add flood zone, BAL, and cyclone zone API lookups."
 *
 * IMPORTANT — ADVISORY FLAGS ONLY:
 * These functions produce probabilistic risk flags based on postcode proximity
 * to known hazard zones. They are NOT legal determinations. Definitive ratings
 * require authoritative sources:
 *
 *   Flood zone:    State government flood mapping portals (QLD Flood Information
 *                  Portal, NSW Spatial Viewer, VIC DEECA flood mapping)
 *   BAL rating:    Licensed assessor per AS 3959. Cannot be derived from postcode alone.
 *   Cyclone zone:  AS/NZS 1170.2 Wind Region maps. Postcode ranges used here are
 *                  a reliable proxy for northern postcodes; verify for fringe areas.
 *   Heritage:      State Heritage Register search required for definitive status.
 *
 * TODO (Phase 2 integrations):
 *   - Replace detectFloodZone() with QLD/NSW/VIC government flood mapping API calls
 *   - Replace detectBushfireProne() with state Planning Portal API calls
 *   - Add GNAF geocoding for precise coordinate-based zone lookups
 *   - Heritage SA / VHR / NSW SHR API lookups for heritage flag
 */

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** Property risk flags consumed by getActiveTriggers() in nir-jurisdictional-matrix.ts */
export interface PropertyLocationFlags {
  isFloodZone: boolean
  isBushfireProne: boolean
  isCycloneZone: boolean
  isHeritageListed: boolean
  /** Wind region designation for structural assessment (null if not applicable) */
  windRegion: 'A' | 'B' | 'C' | 'D' | null
  /** BAL rating if determinable from zone data; null requires licensed assessor */
  approximateBALZone: 'BAL-LOW' | 'BAL-12.5' | 'BAL-19' | 'BAL-29' | 'BAL-40' | 'BAL-FZ' | null
  /** Whether flags are from reliable postcode data or require field verification */
  confidence: 'high' | 'medium' | 'requires-verification'
  /** Human-readable advisory notes for the inspection report */
  advisoryNotes: string[]
}

type PostcodeRange = readonly [number, number]

// ─── POSTCODE RANGE DEFINITIONS ──────────────────────────────────────────────
// Sources: ABS Postal Area data, state government hazard mapping, AS/NZS 1170.2

/**
 * Known high flood-risk postcode ranges by state.
 * These represent areas with documented significant flood history or
 * formal flood planning area designation.
 *
 * TODO: Replace with live government flood mapping API calls.
 */
const FLOOD_ZONES: Record<string, PostcodeRange[]> = {
  QLD: [
    [4000, 4013],   // Inner Brisbane / CBD flood plain
    [4059, 4059],   // Auchenflower / Toowong flood corridor
    [4064, 4068],   // Milton, Chelmer, Graceville
    [4101, 4105],   // West End, Dutton Park, Highgate Hill
    [4300, 4305],   // Ipswich city / Bremer River
    [4500, 4510],   // Caboolture / North Moreton Bay
    [4670, 4670],   // Bundaberg (2013 floods)
    [4740, 4745],   // Mackay / Pioneer River
    [4870, 4870],   // Cairns
  ],
  NSW: [
    [2480, 2480],   // Lismore — highest flood-risk in NSW
    [2460, 2464],   // Grafton / Clarence Valley
    [2350, 2350],   // Armidale flood plain
    [2650, 2650],   // Wagga Wagga / Murrumbidgee
    [2640, 2641],   // Albury / Murray River
  ],
  VIC: [
    [3616, 3618],   // Shepparton / Goulburn River
    [3644, 3644],   // Echuca / Murray River
    [3500, 3502],   // Mildura / Murray River
  ],
  NT: [
    [822,  822],    // Katherine — significant flood history (1998 flood)
    [828,  828],    // Mataranka
    [852,  852],    // Nhulunbuy
  ],
  SA: [
    [5253, 5253],   // Murray Bridge / Murray River
  ],
  WA: [
    [6230, 6232],   // Bunbury / Collie River
  ],
  TAS: [
    [7248, 7249],   // Launceston / Tamar River (2016 flood)
  ],
  ACT: [],
}

/**
 * Cyclone zone postcode ranges by state.
 * Based on AS/NZS 1170.2 Wind Region designations.
 *
 * Wind Regions:
 *   C — tropical cyclone region, sustained winds to 66 m/s (most of NT, north WA, tropical QLD)
 *   D — severe tropical cyclone, sustained winds to 74 m/s (Pilbara coast WA, parts NT coast)
 *
 * All postcodes within these ranges should be treated as Wind Region C minimum.
 */
const CYCLONE_ZONES: Record<string, PostcodeRange[]> = {
  NT: [
    [800, 999],     // ALL NT — Wind Region C/D throughout territory
  ],
  WA: [
    [6700, 6770],   // Pilbara (Karratha 6714, Port Hedland 6721) + Kimberley (Broome 6725, Kununurra 6743)
    [6798, 6799],   // Cocos/Christmas Islands
  ],
  QLD: [
    [4800, 4806],   // Whitsunday region
    [4810, 4825],   // Townsville / Magnetic Island
    [4870, 4895],   // Cairns / Far North QLD
    [4740, 4745],   // Mackay coast
  ],
}

/** Wind Region D designation — more severe cyclone rating */
const WIND_REGION_D: Record<string, PostcodeRange[]> = {
  NT: [
    [820, 820],     // Darwin coastal areas
    [822, 822],     // Palmerston
  ],
  WA: [
    [6714, 6714],   // Karratha / Dampier (Pilbara coast)
    [6721, 6721],   // Port Hedland coast
  ],
}

/**
 * Bushfire Prone Land postcode ranges by state.
 * Based on state planning portal designations and known fire history.
 *
 * TODO: Replace with state Planning Portal BPL API calls.
 *   NSW: https://mappingandgeoscience.planning.nsw.gov.au
 *   VIC: DEECA Wildfire Risk Landscape mapping
 *   ACT: ACT Planning bushfire mapping
 */
const BUSHFIRE_PRONE: Record<string, PostcodeRange[]> = {
  NSW: [
    [2777, 2785],   // Blue Mountains — BAL-HIGH / BAL-FZ common
    [2081, 2086],   // Ku-ring-gai / Hornsby bushland interface
    [2120, 2125],   // Pennant Hills / Hills District interface
    [2159, 2159],   // Galston / Berrilee
    [2250, 2251],   // Gosford / Somersby hinterland
    [2571, 2577],   // Southern Highlands / Bowral
  ],
  VIC: [
    [3777, 3779],   // Dandenong Ranges — BMO/WMO
    [3431, 3444],   // Macedon Ranges — BAL-29 common
    [3139, 3139],   // Healesville / Yarra Valley interface
    [3737, 3742],   // Alpine Valleys — Mount Beauty, Bright
  ],
  ACT: [
    [2611, 2614],   // Weston Creek / Tuggeranong fringe
    [2900, 2906],   // Tuggeranong — affected in 2003 bushfires
    [2618, 2620],   // Belconnen / Gungahlin rural fringe
  ],
  SA: [
    [5350, 5352],   // Barossa Valley / Eden Valley fire corridors
    [5151, 5153],   // Adelaide Hills — Cudlee Creek 2019 fire area
    [5076, 5082],   // Tea Tree Gully interface
  ],
  WA: [
    [6076, 6076],   // Mundaring / Darlington
    [6071, 6075],   // Swan Valley / Baskerville interface
    [6057, 6058],   // Greenmount / Helena Valley
  ],
  QLD: [
    [4310, 4315],   // Boonah / Scenic Rim
    [4551, 4556],   // Caloundra hinterland / Glass House Mountains
  ],
  NT: [],
  TAS: [
    [7109, 7120],   // Huon Valley — fire-prone south-west interface
  ],
}

/**
 * Heritage-dense postcode ranges.
 * These are areas with high concentrations of heritage-listed properties —
 * NOT a definitive list. Individual property heritage status MUST be
 * confirmed via the relevant state Heritage Register.
 *
 * TODO: Replace with Heritage SA / VHR / NSW SHR API lookups.
 */
const HERITAGE_DENSE: Record<string, PostcodeRange[]> = {
  SA: [
    [5000, 5006],   // Adelaide CBD / North Adelaide — Heritage Register concentration
    [5350, 5355],   // Barossa Valley heritage townships
  ],
  VIC: [
    [3000, 3006],   // Melbourne CBD — Heritage Overlay
    [3121, 3122],   // Richmond / Prahran Victorian terrace concentration
  ],
  NSW: [
    [2000, 2000],   // Sydney CBD — The Rocks SHR items
    [2010, 2011],   // Surry Hills / Pyrmont heritage precincts
  ],
  TAS: [
    [7000, 7005],   // Hobart CBD — Battery Point, Sullivan's Cove SHR
    [7250, 7252],   // Launceston CBD heritage precinct
  ],
  QLD: [
    [4350, 4352],   // Toowoomba heritage streetscapes
  ],
}

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

function inRange(postcode: number, ranges: PostcodeRange[]): boolean {
  return ranges.some(([min, max]) => postcode >= min && postcode <= max)
}

function postcodeToNumber(postcode: string): number {
  return parseInt(postcode.replace(/\D/g, ''), 10)
}

// ─── DETECTION FUNCTIONS ──────────────────────────────────────────────────────

/**
 * Detect if a postcode is in a known flood-risk zone.
 *
 * @advisory Probabilistic — confirm with state government flood mapping portal.
 */
export function detectFloodZone(postcode: string, state: string): boolean {
  const stateUpper = state.toUpperCase()
  const postcodeNum = postcodeToNumber(postcode)
  const ranges = FLOOD_ZONES[stateUpper] ?? []
  return inRange(postcodeNum, ranges)
}

/**
 * Detect if a postcode is in a cyclone-affected wind region (C or D).
 * All NT postcodes, northern WA, and tropical QLD return true.
 *
 * @advisory High confidence for NT/far-north WA. QLD ranges verified for major centres.
 *           Verify for fringe postcodes against AS/NZS 1170.2 wind region maps.
 */
export function detectCycloneZone(postcode: string, state: string): boolean {
  const stateUpper = state.toUpperCase()
  const postcodeNum = postcodeToNumber(postcode)
  const ranges = CYCLONE_ZONES[stateUpper] ?? []
  return inRange(postcodeNum, ranges)
}

/**
 * Determine wind region designation for structural specification.
 * Returns null for non-cyclone zones.
 *
 * @advisory Region D is a subset of Region C zones. Verify coastal vs inland
 *           distinction with AS/NZS 1170.2 Appendix A for specific site.
 */
export function detectWindRegion(
  postcode: string,
  state: string
): 'C' | 'D' | null {
  const stateUpper = state.toUpperCase()
  const postcodeNum = postcodeToNumber(postcode)

  const regionDRanges = WIND_REGION_D[stateUpper] ?? []
  if (inRange(postcodeNum, regionDRanges)) return 'D'

  const regionCRanges = CYCLONE_ZONES[stateUpper] ?? []
  if (inRange(postcodeNum, regionCRanges)) return 'C'

  return null
}

/**
 * Detect if a postcode is in a designated Bushfire Prone Land area.
 *
 * @advisory Probabilistic — definitive status requires state Planning Portal lookup.
 *           BAL rating CANNOT be derived from postcode alone — requires licensed assessor.
 */
export function detectBushfireProne(postcode: string, state: string): boolean {
  const stateUpper = state.toUpperCase()
  const postcodeNum = postcodeToNumber(postcode)
  const ranges = BUSHFIRE_PRONE[stateUpper] ?? []
  return inRange(postcodeNum, ranges)
}

/**
 * Flag postcodes with high heritage property concentration.
 * Triggers heritage scope check for restoration projects.
 *
 * @advisory Individual property heritage status MUST be confirmed via:
 *   SA: Heritage SA register (www.environment.sa.gov.au/heritage)
 *   VIC: Victorian Heritage Register (vhr.heritage.vic.gov.au)
 *   NSW: NSW State Heritage Register (www.environment.nsw.gov.au)
 *   TAS: Tasmanian Heritage Register (www.heritage.tas.gov.au)
 */
export function detectHeritageDenseArea(postcode: string, state: string): boolean {
  const stateUpper = state.toUpperCase()
  const postcodeNum = postcodeToNumber(postcode)
  const ranges = HERITAGE_DENSE[stateUpper] ?? []
  return inRange(postcodeNum, ranges)
}

// ─── COMPOSITE FLAG FUNCTION ──────────────────────────────────────────────────

/**
 * Get all location-based property risk flags for a postcode.
 * Output shape matches the inspectionContext parameter of getActiveTriggers()
 * in nir-jurisdictional-matrix.ts.
 *
 * Called by getBuildingCodeRequirements() to auto-populate activeTriggers
 * without requiring the API call site to provide manual context.
 */
export function getPropertyLocationFlags(
  postcode: string,
  state: string
): PropertyLocationFlags {
  const stateUpper = state.toUpperCase()

  const isFloodZone = detectFloodZone(postcode, stateUpper)
  const isCycloneZone = detectCycloneZone(postcode, stateUpper)
  const isBushfireProne = detectBushfireProne(postcode, stateUpper)
  const isHeritageDense = detectHeritageDenseArea(postcode, stateUpper)
  const windRegion = detectWindRegion(postcode, stateUpper)

  const advisoryNotes: string[] = []
  let confidence: PropertyLocationFlags['confidence'] = 'high'

  if (isFloodZone) {
    advisoryNotes.push(
      `Flood zone flag: postcode ${postcode} is in a documented high-risk flood area. ` +
      `Confirm with state government flood mapping portal before finalising scope.`
    )
    confidence = 'medium'
  }

  if (isCycloneZone) {
    const region = windRegion ?? 'C'
    advisoryNotes.push(
      `Cyclone zone flag: Wind Region ${region} designation applies per AS/NZS 1170.2. ` +
      `All structural restoration must meet Wind Region ${region} specifications.`
    )
  }

  if (isBushfireProne) {
    advisoryNotes.push(
      `Bushfire Prone Land flag: postcode ${postcode} is in a designated or likely BPL area. ` +
      `BAL rating requires licensed assessor — cannot be derived from postcode. ` +
      `Confirm via state planning portal before specifying replacement materials.`
    )
    confidence = 'medium'
  }

  if (isHeritageDense) {
    advisoryNotes.push(
      `Heritage area flag: postcode ${postcode} has high heritage property concentration. ` +
      `Confirm individual property heritage status via state Heritage Register ` +
      `before any material removal or demolition works.`
    )
    confidence = 'requires-verification'
  }

  // Approximate BAL zone — only useful for known high-BAL areas
  // Cannot derive specific BAL-12.5 vs BAL-29 from postcode alone
  let approximateBALZone: PropertyLocationFlags['approximateBALZone'] = null
  if (isBushfireProne) {
    // All we can say from postcode is "BAL applies — specific rating needs assessor"
    approximateBALZone = 'BAL-12.5' // conservative minimum — real rating may be higher
    advisoryNotes.push(
      `BAL-12.5 shown as minimum advisory. Actual BAL rating determined by licensed assessor only.`
    )
  }

  if (advisoryNotes.length === 0) {
    advisoryNotes.push(
      `No specific risk zone flags detected for postcode ${postcode} (${stateUpper}). ` +
      `Standard state requirements apply.`
    )
  }

  return {
    isFloodZone,
    isBushfireProne,
    isCycloneZone,
    isHeritageListed: isHeritageDense, // advisory only — field name matches getActiveTriggers() param
    windRegion: windRegion ? (windRegion as 'C' | 'D') : null,
    approximateBALZone,
    confidence,
    advisoryNotes,
  }
}
