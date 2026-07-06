// Australian Equipment Standardisation
// The "Ave" system groups real, verifiable manufacturer specifications into
// normalised "Performance Averages" for 230 V / 50 Hz equipment sold into the
// Australian restoration market.
//
// DATA POLICY (2026-07): every model listed below carries a published-source
// annotation (manufacturer + model + where the spec is published). Where a
// figure is DERIVED (e.g. watts = published amps x 230 V, or watts from a
// published COP), the derivation is stated. Models whose 230 V specs could not
// be verified from a published source have been removed rather than guessed.
// Rating conditions matter for dehumidifiers: AHAM = 26.7C/60%RH; AU-relevant
// hot-humid rating = 30C/80%RH; each capacity states its condition.
import { FT3_TO_M3 } from "@/lib/anz/localisation";

export interface EquipmentModel {
  name: string;
  capacity?: number; // L/day for dehumidifiers (see model comment for rating condition)
  amps?: number; // amp draw at 230 V
  watts?: number; // rated power input, W
  airflow?: number; // CFM (multiply by 0.4719 for L/s)
  tempRange?: string;
  capacityKW?: number; // Used for heat drying
  /** Provenance: manufacturer + spec-sheet location for the numbers above. */
  source?: string;
}

export interface EquipmentGroup {
  id: string;
  name: string;
  capacity: string;
  amps: number; // group average amp draw at 230 V
  watts: number; // group average rated power input, W
  style?: "axial" | "centrifugal"; // air movers only — drives pricing field
  tempRange?: string;
  airflow?: number; // group average, CFM
  capacityKW?: number;
  models: EquipmentModel[];
  // dailyRate removed - all rates come from pricing configuration
}

export interface EquipmentSelection {
  groupId: string;
  quantity: number;
  dailyRate?: number;
  totalCost?: number;
}

/** Convert CFM (cubic feet per minute) to L/s. 1 CFM ≈ 0.4719 L/s — derived
 * from the canonical AU/NZ layer factor (RA-7000). */
export function cfmToLps(cfm: number): number {
  return (cfm * FT3_TO_M3 * 1000) / 60;
}

// LGR Dehumidifiers (230 V low-grain refrigerant)
export const lgrDehumidifiers: EquipmentGroup[] = [
  {
    id: "lgr-35",
    name: "35L/Day Ave",
    capacity: "35L/Day Ave",
    // Dri-Eaz Revolution LGR 230V: 3.4 A @ 230 V, 0.78 kW, 36 L/day AHAM
    // (26.7C/60%RH), 63 L/day max @ 32.2C/90%RH, 272 m3/h.
    // Source: Legend Brands Europe Revolution LGR 230V spec table
    // (legendbrandseurope.com/en/products/revolution-lgr-dehumidifier/).
    amps: 3.4,
    watts: 780,
    models: [
      {
        name: "Dri-Eaz Revolution LGR (230V)",
        capacity: 36, // L/day AHAM 26.7C/60%RH (63 L/day max @ 32.2C/90%RH)
        amps: 3.4,
        watts: 780,
        source:
          "Legend Brands Europe Revolution LGR 230V spec sheet (legendbrandseurope.com)",
      },
    ],
  },
  {
    id: "lgr-55",
    name: "55L/Day Ave",
    capacity: "55L/Day Ave",
    // Dri-Eaz LGR 7000XLi 230V: 4.0 A @ 230 V, 0.92 kW, 58 L/day AHAM
    // (26.7C/60%RH), 91 L/day max @ 32.2C/90%RH, 513 m3/h.
    // Source: Legend Brands Europe LGR 7000XLi 230V spec table
    // (legendbrandseurope.com/en/products/lgr-7000xli-dehumidifier/);
    // AU retail via ccwonline.com.au / wacer.com.au.
    amps: 4.0,
    watts: 920,
    models: [
      {
        name: "Dri-Eaz LGR 7000XLi (230V)",
        capacity: 58, // L/day AHAM 26.7C/60%RH (91 L/day max @ 32.2C/90%RH)
        amps: 4.0,
        watts: 920,
        source:
          "Legend Brands Europe LGR 7000XLi 230V spec sheet (legendbrandseurope.com)",
      },
    ],
  },
  {
    id: "lgr-85",
    name: "85L/Day Ave",
    capacity: "85L/Day Ave",
    // AlorAir Storm Pro (AU 220-240V/50Hz build): 85 L/day @ 30C/80%RH
    // (149 PPD), 350 m3/h, operating range 1-40C, COP 3.0 L/kWh.
    // Watts DERIVED from published figures: 85 L/day / 3.0 L/kWh = 28.3 kWh/day
    // = ~1180 W average; amps DERIVED: 1180 W / 230 V = ~5.1 A.
    // Source: AlorAir factory spec via AU retailer The Hydro Bros
    // (thehydrobros.com Storm Pro 85L listing); AU market via alorairau.com.
    amps: 5.1,
    watts: 1180,
    tempRange: "1°-40°",
    models: [
      {
        name: "AlorAir Storm Pro (240V AU)",
        capacity: 85, // L/day @ 30C/80%RH
        amps: 5.1, // derived: 1180 W / 230 V
        watts: 1180, // derived: 85 L/day at published COP 3.0 L/kWh
        tempRange: "1°-40°",
        source:
          "AlorAir Storm Pro AU spec (COP 3.0 L/kWh, 85 L/day @ 30C/80%RH) via thehydrobros.com / alorairau.com",
      },
    ],
  },
  {
    id: "lgr-105",
    name: "100L/Day Ave",
    capacity: "100L/Day Ave",
    // Trotec TTK 655 S: 220-240V/50Hz, max power input 2.1 kW per Trotec
    // Australia (en.trotec.com states max 2.5 kW — discrepancy noted; the AU
    // market page figure is used). 44 L/day @ 20C/60%RH; 91 L/day @ 30C/80%RH;
    // 100 L/day max; 925 m3/h; operating range 5-32C.
    // Amps DERIVED: 2100 W / 230 V = ~9.1 A.
    // Source: trotecaustralia.com.au TTK 655 S product page + en.trotec.com.
    amps: 9.1,
    watts: 2100,
    tempRange: "5°-32°",
    models: [
      {
        name: "Trotec TTK 655 S",
        capacity: 91, // L/day @ 30C/80%RH (44 @ 20C/60%RH; 100 L/day max)
        amps: 9.1, // derived: 2100 W / 230 V
        watts: 2100,
        tempRange: "5°-32°",
        source:
          "Trotec Australia TTK 655 S spec (trotecaustralia.com.au; en.trotec.com lists 2.5 kW max)",
      },
    ],
  },
];

// Desiccant Dehumidifiers (adsorption — effective at low temperature and for
// Class 4 / dense-material drying where very low humidity ratios are needed)
export const desiccantDehumidifiers: EquipmentGroup[] = [
  {
    id: "desiccant-20",
    name: "8L/Day Ave",
    capacity: "8L/Day Ave",
    // Trotec TTR 200: 230V 1ph, 0.45 kW total (0.4 kW regeneration heating),
    // 80 m3/h nominal dry-air flow, 8.4 kg/24h (en.trotec.com headline;
    // Dantherm Group datasheet lists 0.5 kg/h @ 20C/60%RH), -15 to +35C.
    // Amps DERIVED: 450 W / 230 V = ~2.0 A.
    // Source: danthermgroup.com/products/trotec-ttr-200 + en.trotec.com.
    amps: 2.0,
    watts: 450,
    tempRange: "-15°-35°",
    models: [
      {
        name: "Trotec TTR 200",
        capacity: 8, // kg/24h (en.trotec.com; Dantherm datasheet: 0.5 kg/h @ 20C/60%RH)
        amps: 2.0, // derived: 450 W / 230 V
        watts: 450,
        tempRange: "-15°-35°",
        source:
          "Dantherm Group Trotec TTR 200 datasheet (danthermgroup.com) + en.trotec.com",
      },
    ],
  },
  {
    id: "desiccant-35",
    name: "33L/Day Ave",
    capacity: "33L/Day Ave",
    // Group average of the two verified models below:
    // watts (1500 + 2200) / 2 = 1850; amps DERIVED 1850 W / 230 V = ~8.0 A;
    // capacity (27 + 38) / 2 = ~33 L/day (rating conditions differ per model).
    amps: 8.0,
    watts: 1850,
    tempRange: "-15°-35°",
    models: [
      {
        name: "Corroventa A4 ES",
        capacity: 27, // L/day @ 20C/60%RH
        amps: 6.5, // derived: 1500 W / 230 V
        watts: 1500, // rated (1300 W actual consumption @ 20C/60%RH)
        source:
          "Corroventa A4 ES official spec (corroventa.com/products/adsorption-dehumidifiers/adsorption-dehumidifier-a4-es)",
      },
      {
        name: "Trotec TTR 400 D",
        capacity: 38, // kg/24h max (en.trotec.com headline: 38.4 kg/24h)
        amps: 9.6, // derived: 2200 W / 230 V
        watts: 2200, // 2.2 kW total (1.9 kW regeneration heating)
        tempRange: "-15°+",
        source:
          "Trotec TTR 400 D spec (en.trotec.com/shop/ttr-400-d-desiccant-dehumidifier.html; danthermgroup.com)",
      },
    ],
  },
];

// Air Movers (230 V)
export const airMovers: EquipmentGroup[] = [
  {
    id: "airmover-800",
    name: "800 CFM Ave (Low-Profile Axial)",
    capacity: "800 CFM Ave",
    style: "axial",
    // Group average of the two verified models below:
    // amps (0.53 + 0.6) / 2 = ~0.57; watts (124 + 138) / 2 = ~131;
    // airflow (700 + 950) / 2 = ~825 CFM.
    amps: 0.57,
    watts: 131,
    airflow: 825,
    models: [
      {
        name: "Dri-Eaz Velo Pro (230V)",
        airflow: 700, // 1190 m3/h max actual = ~700 CFM
        amps: 0.53,
        watts: 124, // 0.124 kW motor rating
        source:
          "Legend Brands Europe Velo Pro 230V spec sheet (legendbrandseurope.com); AU retail via ctss.net.au",
      },
      {
        name: "AlorAir Zeus 900 (240V AU)",
        airflow: 950, // ~950 CFM published for the AU-configured unit
        amps: 0.6, // high speed @ 220-240 VAC 50 Hz
        watts: 138, // derived: 0.6 A x 230 V
        source:
          "NLR Australia AlorAir Zeus 900 AU-configuration listing (nlr.com.au)",
      },
    ],
  },
  {
    id: "airmover-1500",
    name: "900 CFM Ave (Centrifugal)",
    capacity: "900 CFM Ave",
    style: "centrifugal",
    // Group average of the two verified models below:
    // amps (1.9 + 0.5) / 2 = 1.2; watts (440 + 120) / 2 = 280;
    // airflow (1077 + 748) / 2 = ~913 CFM.
    amps: 1.2,
    watts: 280,
    airflow: 913,
    models: [
      {
        name: "Dri-Eaz Sahara E TurboDryer (230V)",
        airflow: 1077, // 1830 m3/h actual max = ~1077 CFM (4500 m3/h rated)
        amps: 1.9,
        watts: 440, // published consumption 0.44 kW
        source:
          "Legend Brands Europe Sahara E 230V spec sheet (legendbrandseurope.com)",
      },
      {
        name: "Dri-Eaz Dri-Pod Floor Dryer (230V)",
        airflow: 748, // 1270 m3/h max = ~748 CFM
        amps: 0.5,
        watts: 120, // published consumption 0.12 kW
        source:
          "Legend Brands Europe Dri-Pod 230V spec sheet (legendbrandseurope.com)",
      },
    ],
  },
  {
    id: "airmover-2500",
    name: "3100 CFM Ave (High-Volume Axial)",
    capacity: "3100 CFM Ave",
    style: "axial",
    // Trotec TTV 4500: 0.25 kW @ 230V/50Hz, up to 5300 m3/h = ~3119 CFM.
    // Amps DERIVED: 250 W / 230 V = ~1.1 A.
    // Source: en.trotec.com/shop/ttv-4500-industrial-floor-fan.html;
    // AU market via trotecaustralia.com.au.
    amps: 1.1,
    watts: 250,
    airflow: 3119,
    models: [
      {
        name: "Trotec TTV 4500",
        airflow: 3119, // 5300 m3/h max
        amps: 1.1, // derived: 250 W / 230 V
        watts: 250,
        source:
          "Trotec TTV 4500 spec (en.trotec.com; AU via trotecaustralia.com.au)",
      },
    ],
  },
];

// Air Filtration Devices (AFD / HEPA Air Scrubbers)
export const afdUnits: EquipmentGroup[] = [
  {
    id: "afd-500",
    name: "AFD 500 CFM Ave",
    capacity: "AFD 500 CFM Ave",
    // Dri-Eaz DefendAir HEPA 500 230V (model F284): 1.5 A @ 230 V, variable
    // 250-500 CFM, HEPA 99.97% @ 0.3 micron.
    // Watts DERIVED: 1.5 A x 230 V = ~345 W.
    // Source: Legend Brands F284 owner's manual/parts list (115V & 230V
    // variants, legendbrands.com); 230V retail listing via cleaningsystems.co.nz.
    amps: 1.5,
    watts: 345,
    airflow: 500,
    models: [
      {
        name: "Dri-Eaz DefendAir HEPA 500 (230V, F284)",
        airflow: 500, // variable 250-500 CFM
        amps: 1.5,
        watts: 345, // derived: 1.5 A x 230 V
        source:
          "Legend Brands DefendAir HEPA 500 F284 230V spec (legendbrands.com manual; cleaningsystems.co.nz)",
      },
    ],
  },
];

// Heat Drying Equipment (230 V single-phase)
export const heatDrying: EquipmentGroup[] = [
  {
    id: "heat-3kw",
    name: "2.5kW Ave",
    capacity: "2.5kW Ave",
    // DBK Drymatic II (Australian manufacturer DBK): 230V/50Hz, 2500 W,
    // max current 10.9 A (designed to plug into a standard 10 A outlet per
    // drymatic.com.au), 650 m3/h recirculation / 595 m3/h exhaust.
    // Source: DBK Drymatic II Spec Sheet 2019 (official PDF) + drymatic.com.au.
    amps: 10.9,
    watts: 2500,
    capacityKW: 2.5,
    models: [
      {
        name: "DBK Drymatic II (230V AU)",
        capacityKW: 2.5,
        amps: 10.9,
        watts: 2500,
        airflow: 383, // 650 m3/h recirculation = ~383 CFM
        source: "DBK Drymatic II Spec Sheet 2019 (drymatic.com.au)",
      },
    ],
  },
];

// Get all equipment groups
export function getAllEquipmentGroups(): EquipmentGroup[] {
  return [
    ...lgrDehumidifiers,
    ...desiccantDehumidifiers,
    ...airMovers,
    ...afdUnits,
    ...heatDrying,
  ];
}

// Get equipment group by ID
export function getEquipmentGroupById(id: string): EquipmentGroup | undefined {
  return getAllEquipmentGroups().find((group) => group.id === id);
}

// Calculate total amps for selected equipment
export function calculateTotalAmps(selections: EquipmentSelection[]): number {
  return selections.reduce((total, selection) => {
    const group = getEquipmentGroupById(selection.groupId);
    if (group) {
      return total + group.amps * selection.quantity;
    }
    return total;
  }, 0);
}

// Map equipment group ID to pricing config field name
export function getEquipmentPricingField(groupId: string): string | null {
  if (groupId.startsWith("lgr-")) {
    return "dehumidifierLGRDailyRate";
  }
  if (groupId.startsWith("desiccant-")) {
    return "dehumidifierDesiccantDailyRate";
  }
  if (groupId.startsWith("airmover-")) {
    // Axial vs centrifugal is carried on the group definition
    const group = getEquipmentGroupById(groupId);
    return group?.style === "centrifugal"
      ? "airMoverCentrifugalDailyRate"
      : "airMoverAxialDailyRate";
  }
  if (groupId.startsWith("afd-")) {
    return "afdUnitLargeDailyRate";
  }
  if (groupId.startsWith("heat-")) {
    // Heat drying uses injectionDryingSystemDailyRate
    return "injectionDryingSystemDailyRate";
  }
  return null;
}

// Get daily rate from pricing config for an equipment group
export function getEquipmentDailyRate(
  groupId: string,
  pricingConfig: any,
): number {
  // ALWAYS prioritise pricing config rates when available
  // Pricing config has one rate per equipment type (e.g., all LGR use dehumidifierLGRDailyRate)
  const pricingField = getEquipmentPricingField(groupId);

  if (
    pricingField &&
    pricingConfig &&
    pricingConfig[pricingField] !== undefined &&
    pricingConfig[pricingField] !== null
  ) {
    // Use pricing config rate - this is the user's configured rate
    const rate = pricingConfig[pricingField];
    return rate;
  }

  // No fallback - pricing config is required
  // Return 0 if pricing config is not available (should not happen in production)
  console.warn(
    `[Pricing Config] No rate found for equipment group: ${groupId} (field: ${pricingField}). Please configure pricing.`,
  );
  return 0;
}

// Calculate total daily cost for selected equipment using pricing config
export function calculateTotalDailyCost(
  selections: EquipmentSelection[],
  pricingConfig?: any,
): number {
  return selections.reduce((total, selection) => {
    // Use the rate from selection (which should come from pricing config), or get from pricing config
    const rate =
      selection.dailyRate ||
      (pricingConfig
        ? getEquipmentDailyRate(selection.groupId, pricingConfig)
        : 0);
    return total + rate * selection.quantity;
  }, 0);
}

// Calculate total cost for selected equipment over duration
export function calculateTotalCost(
  selections: EquipmentSelection[],
  durationDays: number,
  pricingConfig?: any,
): number {
  const dailyCost = calculateTotalDailyCost(selections, pricingConfig);
  return dailyCost * durationDays;
}
