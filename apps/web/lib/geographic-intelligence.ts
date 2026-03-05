// Geographic intelligence utilities for postcode-based information

export interface GeographicIntelligence {
  postcode: string
  state: string
  localCouncil: string
  councilContact?: string
  weatherPatterns?: {
    cycloneProne: boolean
    floodProne: boolean
    seasonalHumidity: string
    averageTemperature: string
  }
  buildingRequirements?: {
    cycloneRating?: string
    floodLevel?: string
    specialConsiderations?: string[]
  }
}

// Simplified council lookup (in production, would use actual API or database)
const COUNCIL_LOOKUP: { [key: string]: { name: string; contact?: string } } = {
  '4000': { name: 'Brisbane City Council', contact: '(07) 3403 8888' },
  '2000': { name: 'City of Sydney', contact: '02 9265 9333' },
  '3000': { name: 'City of Melbourne', contact: '(03) 9658 9658' },
  '5000': { name: 'City of Adelaide', contact: '(08) 8203 7203' },
  '6000': { name: 'City of Perth', contact: '(08) 9461 3333' },
  '7000': { name: 'Hobart City Council', contact: '(03) 6238 2711' },
  '2600': { name: 'ACT Government', contact: '13 22 81' },
  '800': { name: 'City of Darwin', contact: '(08) 8930 0300' }
}

// Postcode ranges for major councils (simplified)
const COUNCIL_POSTCODE_RANGES: { [key: string]: { name: string; ranges: number[][] } } = {
  'Brisbane': { name: 'Brisbane City Council', ranges: [[4000, 4199], [9000, 9099]] },
  'Sydney': { name: 'City of Sydney', ranges: [[2000, 2011], [2015, 2017]] },
  'Melbourne': { name: 'City of Melbourne', ranges: [[3000, 3004], [8000, 8999]] }
}

export function getGeographicIntelligence(postcode: string): GeographicIntelligence | null {
  if (!postcode) return null

  const numericPostcode = parseInt(postcode.replace(/\D/g, ''))
  if (isNaN(numericPostcode)) return null

  // Detect state (using local function)
  const state = detectStateFromPostcodeLocal(postcode)
  if (!state) return null

  // Get council (simplified - would use actual lookup in production)
  let council = 'Local Council'
  let councilContact: string | undefined

  // Check direct lookup
  if (COUNCIL_LOOKUP[postcode]) {
    council = COUNCIL_LOOKUP[postcode].name
    councilContact = COUNCIL_LOOKUP[postcode].contact
  } else {
    // Check ranges
    for (const [councilName, data] of Object.entries(COUNCIL_POSTCODE_RANGES)) {
      for (const [min, max] of data.ranges) {
        if (numericPostcode >= min && numericPostcode <= max) {
          council = data.name
          break
        }
      }
    }
  }

  // Weather patterns (simplified - would use BOM API in production)
  const weatherPatterns = getWeatherPatterns(postcode, state)

  // Building requirements
  const buildingRequirements = getBuildingRequirements(postcode, state)

  return {
    postcode,
    state,
    localCouncil: council,
    councilContact,
    weatherPatterns,
    buildingRequirements
  }
}

function detectStateFromPostcodeLocal(postcode: string): string | null {
  const numericPostcode = parseInt(postcode.replace(/\D/g, ''))
  if (isNaN(numericPostcode)) return null

  if (numericPostcode >= 1000 && numericPostcode <= 2599) return 'NSW'
  if (numericPostcode >= 2600 && numericPostcode <= 2618) return 'ACT'
  if (numericPostcode >= 2619 && numericPostcode <= 2899) return 'NSW'
  if (numericPostcode >= 2900 && numericPostcode <= 2920) return 'ACT'
  if (numericPostcode >= 2921 && numericPostcode <= 2999) return 'NSW'
  if (numericPostcode >= 3000 && numericPostcode <= 3999) return 'VIC'
  if (numericPostcode >= 4000 && numericPostcode <= 4999) return 'QLD'
  if (numericPostcode >= 5000 && numericPostcode <= 5999) return 'SA'
  if (numericPostcode >= 6000 && numericPostcode <= 6799) return 'WA'
  if (numericPostcode >= 7000 && numericPostcode <= 7999) return 'TAS'
  if (numericPostcode >= 800 && numericPostcode <= 999) return 'NT'
  if (numericPostcode >= 8000 && numericPostcode <= 8999) return 'VIC' // Some VIC postcodes

  return null
}

function getWeatherPatterns(postcode: string, state: string): GeographicIntelligence['weatherPatterns'] {
  const numericPostcode = parseInt(postcode.replace(/\D/g, ''))

  // Cyclone-prone areas (Far North QLD, Northern WA, NT)
  const cycloneProne = (state === 'QLD' && numericPostcode >= 4800 && numericPostcode <= 4899) ||
                       (state === 'WA' && numericPostcode >= 6700 && numericPostcode <= 6799) ||
                       (state === 'NT')

  // Flood-prone areas (simplified)
  const floodProne = (state === 'QLD' && (numericPostcode >= 4000 && numericPostcode <= 4999)) ||
                     (state === 'NSW' && (numericPostcode >= 2000 && numericPostcode <= 2999))

  // Seasonal humidity (simplified)
  let seasonalHumidity = 'Moderate'
  if (state === 'QLD' || state === 'NT') {
    seasonalHumidity = 'High (tropical)'
  } else if (state === 'VIC' || state === 'TAS') {
    seasonalHumidity = 'Moderate to Low'
  }

  // Average temperature
  let averageTemperature = '20-25°C'
  if (state === 'QLD' || state === 'NT' || state === 'WA') {
    averageTemperature = '25-30°C'
  } else if (state === 'TAS' || state === 'VIC') {
    averageTemperature = '15-20°C'
  }

  return {
    cycloneProne,
    floodProne,
    seasonalHumidity,
    averageTemperature
  }
}

function getBuildingRequirements(postcode: string, state: string): GeographicIntelligence['buildingRequirements'] {
  const numericPostcode = parseInt(postcode.replace(/\D/g, ''))

  // Cyclone rating for cyclone-prone areas
  if ((state === 'QLD' && numericPostcode >= 4800 && numericPostcode <= 4899) ||
      (state === 'WA' && numericPostcode >= 6700 && numericPostcode <= 6799) ||
      (state === 'NT')) {
    return {
      cycloneRating: 'Cyclone Category C3 or higher required',
      specialConsiderations: [
        'Compressed timeline before storm season recommended',
        'Equipment staging considerations for outdoor areas due to cyclone risk',
        'Secure equipment anchoring required'
      ]
    }
  }

  // Flood level for flood-prone areas
  if ((state === 'QLD' && numericPostcode >= 4000 && numericPostcode <= 4999) ||
      (state === 'NSW' && numericPostcode >= 2000 && numericPostcode <= 2999)) {
    return {
      floodLevel: 'Check local flood mapping for property-specific requirements',
      specialConsiderations: [
        'Flood history may affect drying timeline',
        'Consider elevated equipment staging'
      ]
    }
  }

  return {}
}

