// State detection and regulatory framework utilities

export interface StateInfo {
  code: string
  name: string
  buildingAuthority: string
  workSafetyAuthority: string
  epaAuthority: string
  buildingCode: string
  whsAct: string
  epaAct: string
  workSafetyContact: string
  epaContact: string
}

// Postcode ranges for Australian states/territories (simplified - actual ranges are more complex)
const POSTCODE_RANGES: { [key: string]: number[][] } = {
  NSW: [[1000, 2599], [2619, 2899], [2921, 2999]],
  VIC: [[3000, 3999], [8000, 8999]],
  QLD: [[4000, 4999], [9000, 9999]],
  SA: [[5000, 5999]],
  WA: [[6000, 6799]],
  TAS: [[7000, 7999]],
  ACT: [[200, 299], [2600, 2618], [2900, 2920]],
  NT: [[800, 999]]
}

export function detectStateFromPostcode(postcode: string): string | null {
  if (!postcode) return null
  
  const numericPostcode = parseInt(postcode.replace(/\D/g, ''))
  if (isNaN(numericPostcode)) return null

  for (const [state, ranges] of Object.entries(POSTCODE_RANGES)) {
    for (const [min, max] of ranges) {
      if (numericPostcode >= min && numericPostcode <= max) {
        return state
      }
    }
  }

  return null
}

export function getStateInfo(stateCode: string | null): StateInfo | null {
  if (!stateCode) return null

  const frameworks: { [key: string]: StateInfo } = {
    QLD: {
      code: 'QLD',
      name: 'Queensland',
      buildingAuthority: 'Queensland Building and Construction Commission (QBCC)',
      buildingCode: 'QDC 4.5 (Queensland Development Code)',
      workSafetyAuthority: 'WorkSafe QLD',
      workSafetyContact: '1300 362 128',
      epaAuthority: 'EPA Queensland',
      epaContact: '13 QGOV (13 74 68)',
      whsAct: 'Work Health and Safety Act 2011 (Qld)',
      epaAct: 'Environmental Protection Act 1994 (Qld)'
    },
    NSW: {
      code: 'NSW',
      name: 'New South Wales',
      buildingAuthority: 'NSW Fair Trading',
      buildingCode: 'BCA (Building Code of Australia) + NSW Building Code',
      workSafetyAuthority: 'SafeWork NSW',
      workSafetyContact: '13 10 50',
      epaAuthority: 'EPA NSW',
      epaContact: '131 555',
      whsAct: 'Work Health and Safety Act 2011 (NSW)',
      epaAct: 'Protection of the Environment Operations Act 1997 (NSW)'
    },
    VIC: {
      code: 'VIC',
      name: 'Victoria',
      buildingAuthority: 'Victorian Building Authority (VBA)',
      buildingCode: 'BCA + Victorian Building Regulations',
      workSafetyAuthority: 'WorkSafe Victoria',
      workSafetyContact: '1800 136 089',
      epaAuthority: 'EPA Victoria',
      epaContact: '1300 372 842',
      whsAct: 'Occupational Health and Safety Act 2004 (Vic)',
      epaAct: 'Environment Protection Act 2017 (Vic)'
    },
    SA: {
      code: 'SA',
      name: 'South Australia',
      buildingAuthority: 'Consumer and Business Services (CBS)',
      buildingCode: 'BCA + South Australian Building Regulations',
      workSafetyAuthority: 'SafeWork SA',
      workSafetyContact: '1300 365 255',
      epaAuthority: 'EPA South Australia',
      epaContact: '(08) 8204 2004',
      whsAct: 'Work Health and Safety Act 2012 (SA)',
      epaAct: 'Environment Protection Act 1993 (SA)'
    },
    WA: {
      code: 'WA',
      name: 'Western Australia',
      buildingAuthority: 'Building and Energy (Department of Mines, Industry Regulation and Safety)',
      buildingCode: 'BCA + Western Australian Building Regulations',
      workSafetyAuthority: 'WorkSafe WA',
      workSafetyContact: '1300 307 877',
      epaAuthority: 'Department of Water and Environmental Regulation (DWER)',
      epaContact: '(08) 6364 7000',
      whsAct: 'Work Health and Safety Act 2020 (WA)',
      epaAct: 'Environmental Protection Act 1986 (WA)'
    },
    TAS: {
      code: 'TAS',
      name: 'Tasmania',
      buildingAuthority: 'Consumer, Building and Occupational Services (CBOS)',
      buildingCode: 'BCA + Tasmanian Building Regulations',
      workSafetyAuthority: 'WorkSafe Tasmania',
      workSafetyContact: '1300 366 322',
      epaAuthority: 'EPA Tasmania',
      epaContact: '(03) 6165 4599',
      whsAct: 'Work Health and Safety Act 2012 (Tas)',
      epaAct: 'Environmental Management and Pollution Control Act 1994 (Tas)'
    },
    ACT: {
      code: 'ACT',
      name: 'Australian Capital Territory',
      buildingAuthority: 'ACT Planning and Land Authority',
      buildingCode: 'BCA + ACT Building Code',
      workSafetyAuthority: 'WorkSafe ACT',
      workSafetyContact: '02 6207 3000',
      epaAuthority: 'Environment, Planning and Sustainable Development Directorate',
      epaContact: '13 22 81',
      whsAct: 'Work Health and Safety Act 2011 (ACT)',
      epaAct: 'Environment Protection Act 1997 (ACT)'
    },
    NT: {
      code: 'NT',
      name: 'Northern Territory',
      buildingAuthority: 'Building Advisory Services (Department of Infrastructure, Planning and Logistics)',
      buildingCode: 'BCA + Northern Territory Building Regulations',
      workSafetyAuthority: 'NT WorkSafe',
      workSafetyContact: '1800 019 115',
      epaAuthority: 'Department of Environment, Parks and Water Security',
      epaContact: '(08) 8999 5511',
      whsAct: 'Work Health and Safety (National Uniform Legislation) Act 2011 (NT)',
      epaAct: 'Waste Management and Pollution Control Act 1998 (NT)'
    }
  }

  return frameworks[stateCode] || null
}

