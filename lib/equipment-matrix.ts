// Australian Equipment Standardization
// The "Ave" system automatically groups disparate manufacturer specifications into normalized "Performance Averages"

export interface EquipmentModel {
  name: string
  capacity: number
  amps?: number
  airflow?: number
  tempRange?: string
  capacityKW?: number
}

export interface EquipmentGroup {
  id: string
  name: string
  capacity: string
  amps: number
  tempRange?: string
  airflow?: number
  capacityKW?: number
  models: EquipmentModel[]
  dailyRate?: number // Default daily rental rate
}

export interface EquipmentSelection {
  groupId: string
  quantity: number
  dailyRate?: number
  totalCost?: number
}

// LGR Dehumidifiers
export const lgrDehumidifiers: EquipmentGroup[] = [
  {
    id: 'lgr-35',
    name: '35L/Day Ave',
    capacity: '35L/Day Ave',
    amps: 2.55,
    tempRange: '1°-38°',
    models: [
      { name: 'Trotec TTK Qube', capacity: 40 },
      { name: 'Dri-Eaz Evolution LGR', capacity: 35 }
    ],
    dailyRate: 45
  },
  {
    id: 'lgr-55',
    name: '55L/Day Ave',
    capacity: '55L/Day Ave',
    amps: 2.85,
    tempRange: '1°-40°',
    models: [
      { name: 'Dri-Eaz Revolution LGR', capacity: 55 },
      { name: 'ThorAir LGR 50L Compact', capacity: 50 },
      { name: 'Phoenix DryMAX XL', capacity: 58 },
      { name: 'Viking Pure LGR', capacity: 53 },
      { name: 'Climate Rental CR-LGR55', capacity: 55 },
      { name: 'Agile Equipment Midi LGR', capacity: 55 }
    ],
    dailyRate: 55
  },
  {
    id: 'lgr-85',
    name: '85L/Day Ave',
    capacity: '85L/Day Ave',
    amps: 5.02,
    tempRange: '1°-38°',
    models: [
      { name: 'ThorAir LGR 85L Pro', capacity: 85 },
      { name: 'Dri-Eaz LGR 7000XLi', capacity: 80 },
      { name: 'Trotec TTK 350 S', capacity: 88 },
      { name: 'Ionmax Commercial LGR', capacity: 90 }
    ],
    dailyRate: 75
  },
  {
    id: 'lgr-105',
    name: '105L/Day Ave',
    capacity: '105L/Day Ave',
    amps: 7,
    tempRange: '1°-40°',
    models: [
      { name: 'Trotec TTK 655 S', capacity: 110 },
      { name: 'ThorAir Industrial LGR 120', capacity: 120 }
    ],
    dailyRate: 95
  }
]

// Desiccant Dehumidifiers
export const desiccantDehumidifiers: EquipmentGroup[] = [
  {
    id: 'desiccant-20',
    name: '20L/Day Ave',
    capacity: '20L/Day Ave',
    amps: 3.75,
    tempRange: '-15°-35°',
    models: [
      { name: 'Trotec TTR 200', capacity: 18 },
      { name: 'Corroventa A2 Adsorption', capacity: 22 }
    ],
    dailyRate: 85
  },
  {
    id: 'desiccant-35',
    name: '35L/Day Ave',
    capacity: '35L/Day Ave',
    amps: 6.75,
    tempRange: '-15°-40°',
    models: [
      { name: 'Trotec TTR 400', capacity: 38 },
      { name: 'Dri-Eaz DriTec 4000i', capacity: 35 }
    ],
    dailyRate: 120
  },
  {
    id: 'desiccant-60',
    name: '60L/Day Ave',
    capacity: '60L/Day Ave',
    amps: 9,
    tempRange: '-10°-40°',
    models: [
      { name: 'Corroventa A4 ES X', capacity: 65 }
    ],
    dailyRate: 180
  }
]

// Air Movers
export const airMovers: EquipmentGroup[] = [
  {
    id: 'airmover-800',
    name: '800 CFM Ave',
    capacity: '800 CFM Ave',
    amps: 1.23,
    airflow: 800,
    models: [
      { name: 'Dri-Eaz Velo', airflow: 885 },
      { name: 'Dri-Eaz Velo Pro', airflow: 800 },
      { name: 'ThorAir Low Profile Mover', airflow: 850 },
      { name: 'Trotec TFV 10', airflow: 750 }
    ],
    dailyRate: 25
  },
  {
    id: 'airmover-1500',
    name: '1500 CFM Ave',
    capacity: '1500 CFM Ave',
    amps: 2.27,
    airflow: 1500,
    models: [
      { name: 'ThorAir Snail Fan', airflow: 1600 },
      { name: 'Vacmaster Air Mover AM1202', airflow: 1400 },
      { name: 'Climate Rental Carpet Dryer 3-Speed', airflow: 1550 }
    ],
    dailyRate: 35
  },
  {
    id: 'airmover-2500',
    name: '2500 CFM Ave',
    capacity: '2500 CFM Ave',
    amps: 2,
    airflow: 2500,
    models: [
      { name: 'Phoenix AirMAX Radial', airflow: 2600 },
      { name: 'ThorAir Axial Fan T500', airflow: 2800 },
      { name: 'Trotec TTV 4500', airflow: 3000 },
      { name: 'Viking VP3000 Axial', airflow: 2900 },
      { name: 'OmniDry O-550 Axial', airflow: 2750 }
    ],
    dailyRate: 45
  }
]

// Heat Drying Equipment
export const heatDrying: EquipmentGroup[] = [
  {
    id: 'heat-3kw',
    name: '3kW Ave',
    capacity: '3kW Ave',
    amps: 11,
    capacityKW: 3,
    models: [
      { name: 'Drymatic Boost Box', capacityKW: 2 },
      { name: 'Trotec TDS 19 E', capacityKW: 3 }
    ],
    dailyRate: 60
  },
  {
    id: 'heat-9kw',
    name: '9kW Ave',
    capacity: '9kW Ave',
    amps: 25.25,
    capacityKW: 9,
    models: [
      { name: 'Trotec TDS 50', capacityKW: 9 },
      { name: 'ThorAir 9KW Industrial', capacityKW: 9 }
    ],
    dailyRate: 150
  }
]

// Get all equipment groups
export function getAllEquipmentGroups(): EquipmentGroup[] {
  return [
    ...lgrDehumidifiers,
    ...desiccantDehumidifiers,
    ...airMovers,
    ...heatDrying
  ]
}

// Get equipment group by ID
export function getEquipmentGroupById(id: string): EquipmentGroup | undefined {
  return getAllEquipmentGroups().find(group => group.id === id)
}

// Calculate total amps for selected equipment
export function calculateTotalAmps(selections: EquipmentSelection[]): number {
  return selections.reduce((total, selection) => {
    const group = getEquipmentGroupById(selection.groupId)
    if (group) {
      return total + (group.amps * selection.quantity)
    }
    return total
  }, 0)
}

// Calculate total daily cost for selected equipment
export function calculateTotalDailyCost(selections: EquipmentSelection[]): number {
  return selections.reduce((total, selection) => {
    const rate = selection.dailyRate || getEquipmentGroupById(selection.groupId)?.dailyRate || 0
    return total + (rate * selection.quantity)
  }, 0)
}

// Calculate total cost for selected equipment over duration
export function calculateTotalCost(selections: EquipmentSelection[], durationDays: number): number {
  const dailyCost = calculateTotalDailyCost(selections)
  return dailyCost * durationDays
}

