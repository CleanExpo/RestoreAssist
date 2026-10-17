import type { IicrcClaimType } from "@/lib/nir-standards-mapping";
import { newRoomEntryId } from "@/lib/forms/room-identity";
import {
  buildMakeSafePreset,
  type MakeSafeChecklistState,
} from "@/lib/compliance/make-safe-actions";

export type NirQuickFillTemplate = {
  id: string;
  name: string;
  description: string;
  claimType: IicrcClaimType;
  category?: string;
  waterClass?: string;
  propertyAddress: string;
  propertyPostcode: string;
  technicianName: string;
  inspectionDate: string;
  damageDescription: string;
  environmentalData: {
    ambientTemperature: number;
    humidityLevel: number;
    dewPoint: number;
    airCirculation: boolean;
    weatherConditions?: string;
  };
  moistureReadings: Array<{
    location: string;
    surfaceType: string;
    moistureLevel: number;
    depth: "Surface" | "Subsurface";
  }>;
  affectedAreas: Array<{
    id: string;
    roomZoneId: string;
    roomType: string;
    customRoomName?: string;
    length: number;
    width: number;
    height: number;
    affectedSquareFootage: number;
    materials: string[];
    waterSource: string;
    timeSinceLoss: number;
  }>;
  selectedScopeItems: string[];
  equipmentSelection: Array<{ id: string; type: string; quantity: number }>;
  dryingDuration: number;
  assessmentSeed: Record<string, unknown>;
  complianceSeed: Record<string, unknown>;
  makeSafeSeed: MakeSafeChecklistState;
};

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function waterAssessment(
  category: "1" | "2" | "3",
  waterClass: "1" | "2" | "3" | "4",
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    waterCategory: `CAT_${category}`,
    damageClass: `CLASS_${waterClass}`,
    lossSourceIdentified: true,
    lossSourceAddressed: true,
    ...extras,
  };
}

function baseCompliance(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    insurerName: "Demo Insurer Ltd",
    claimNumber: "CLM-DEMO-2026-001",
    lossAdjusterName: "A. Assessor",
    lossAdjusterReference: "LA-2026-0042",
    state: "NSW",
    technicianLicenseNumber: "NSW-REST-12345",
    technicianLicenseExpiry: "2027-12-31",
    ...over,
  };
}

function buildTemplate(
  partial: Omit<
    NirQuickFillTemplate,
    "assessmentSeed" | "complianceSeed" | "inspectionDate" | "makeSafeSeed"
  > & {
    assessmentSeed?: Record<string, unknown>;
    complianceSeed?: Record<string, unknown>;
    inspectionDate?: string;
    makeSafeSeed?: MakeSafeChecklistState;
  },
): NirQuickFillTemplate {
  return {
    inspectionDate: partial.inspectionDate ?? todayLocalDate(),
    assessmentSeed: partial.assessmentSeed ?? {},
    complianceSeed: partial.complianceSeed ?? baseCompliance(),
    makeSafeSeed:
      partial.makeSafeSeed ??
      buildMakeSafePreset(["power_isolated", "water_stopped", "occupant_briefing"]),
    ...partial,
  };
}

export const NIR_QUICK_FILL_TEMPLATES: Record<string, NirQuickFillTemplate> = {
  "residential-burst-pipe": buildTemplate({
    id: "residential-burst-pipe",
    name: "Residential Burst Pipe",
    description:
      "Standard residential water damage from burst pipe affecting master bedroom and ensuite",
    claimType: "WATER",
    category: "1",
    waterClass: "2",
    propertyAddress: "123 Main Street, Suburb, NSW 2000",
    propertyPostcode: "2000",
    technicianName: "Mark O'Connor",
    damageDescription:
      "Burst flexi hose under ensuite vanity. Water tracked into master bedroom carpet and lower drywall. Source isolated; extraction and drying commenced same day.",
    environmentalData: {
      ambientTemperature: 22,
      humidityLevel: 65,
      dewPoint: 15.2,
      airCirculation: true,
      weatherConditions: "Fine, 22°C",
    },
    moistureReadings: [
      {
        location: "Master Bedroom - Floor",
        surfaceType: "Carpet",
        moistureLevel: 45.5,
        depth: "Surface",
      },
      {
        location: "Master Bedroom - Wall",
        surfaceType: "Drywall",
        moistureLevel: 38.2,
        depth: "Subsurface",
      },
      {
        location: "Ensuite - Floor",
        surfaceType: "Tile",
        moistureLevel: 52.1,
        depth: "Surface",
      },
      {
        location: "Ensuite - Wall",
        surfaceType: "Drywall",
        moistureLevel: 41.8,
        depth: "Subsurface",
      },
    ],
    affectedAreas: [
      {
        id: newRoomEntryId(),
        roomZoneId: "Master Bedroom",
        roomType: "Master Bedroom",
        length: 5.5,
        width: 4.0,
        height: 2.7,
        affectedSquareFootage: 22.0,
        materials: ["Carpet", "Drywall"],
        waterSource: "Clean Water",
        timeSinceLoss: 24,
      },
      {
        id: newRoomEntryId(),
        roomZoneId: "Ensuite",
        roomType: "Ensuite",
        length: 3.0,
        width: 2.5,
        height: 2.4,
        affectedSquareFootage: 7.5,
        materials: ["Tile", "Drywall"],
        waterSource: "Clean Water",
        timeSinceLoss: 24,
      },
    ],
    selectedScopeItems: [
      "remove_carpet",
      "extract_standing_water",
      "install_dehumidification",
      "install_air_movers",
      "demolish_drywall",
      "apply_antimicrobial",
      "dry_out_structure",
    ],
    equipmentSelection: [
      { id: "eq-1", type: "LGR Dehumidifier", quantity: 2 },
      { id: "eq-2", type: "Air Mover", quantity: 4 },
    ],
    dryingDuration: 4,
    assessmentSeed: waterAssessment("1", "2", {
      lossSourceType: "PLUMBING",
      hoursOfExposure: 24,
    }),
    complianceSeed: baseCompliance({ claimNumber: "CLM-DEMO-BURST-001" }),
  }),

  "commercial-hvac-failure": buildTemplate({
    id: "commercial-hvac-failure",
    name: "Commercial HVAC Failure",
    description:
      "Large-scale commercial office water damage from HVAC system failure",
    claimType: "WATER",
    category: "1",
    waterClass: "3",
    propertyAddress: "456 Business Park Drive, Melbourne VIC 3000",
    propertyPostcode: "3000",
    technicianName: "David Chen",
    damageDescription:
      "HVAC condensate line failure on level 3. Water released through ceiling grid affecting open office and adjacent server room. Plant isolated; containment and extraction in progress.",
    environmentalData: {
      ambientTemperature: 24,
      humidityLevel: 70,
      dewPoint: 18.1,
      airCirculation: false,
      weatherConditions: "Overcast, 24°C",
    },
    moistureReadings: [
      {
        location: "3rd Floor - Office Area - Ceiling",
        surfaceType: "Drywall",
        moistureLevel: 58.3,
        depth: "Subsurface",
      },
      {
        location: "3rd Floor - Server Room - Floor",
        surfaceType: "Concrete",
        moistureLevel: 42.1,
        depth: "Surface",
      },
      {
        location: "2nd Floor - Office Area - Wall",
        surfaceType: "Drywall",
        moistureLevel: 35.7,
        depth: "Subsurface",
      },
    ],
    affectedAreas: [
      {
        id: newRoomEntryId(),
        roomZoneId: "3rd Floor - Office Area",
        roomType: "Other",
        customRoomName: "3rd Floor - Office Area",
        length: 15.0,
        width: 10.0,
        height: 3.0,
        affectedSquareFootage: 150.0,
        materials: ["Drywall", "Carpet"],
        waterSource: "Clean Water",
        timeSinceLoss: 12,
      },
    ],
    selectedScopeItems: [
      "extract_standing_water",
      "install_dehumidification",
      "install_air_movers",
      "demolish_drywall",
      "containment_setup",
      "ppe_required",
    ],
    equipmentSelection: [
      { id: "eq-1", type: "LGR Dehumidifier", quantity: 3 },
      { id: "eq-2", type: "Air Mover", quantity: 8 },
    ],
    dryingDuration: 7,
    assessmentSeed: waterAssessment("1", "3", {
      lossSourceType: "HVAC",
      hoursOfExposure: 12,
    }),
    complianceSeed: baseCompliance({
      state: "VIC",
      claimNumber: "CLM-DEMO-HVAC-002",
    }),
  }),

  "mould-remediation": buildTemplate({
    id: "mould-remediation",
    name: "Mould Remediation",
    description:
      "Residential property with extensive mould growth due to long-term moisture",
    claimType: "MOULD",
    propertyAddress: "789 Oak Street, Brisbane QLD 4000",
    propertyPostcode: "4000",
    technicianName: "Emma Thompson",
    damageDescription:
      "Long-term moisture behind shower wall. Visible mould growth on bathroom and laundry drywall. Containment erected; HEPA filtration active; root cause traced to failed waterproof membrane.",
    environmentalData: {
      ambientTemperature: 26,
      humidityLevel: 75,
      dewPoint: 21.2,
      airCirculation: false,
      weatherConditions: "Humid, 26°C",
    },
    moistureReadings: [
      {
        location: "Bathroom - Wall Behind Shower",
        surfaceType: "Drywall",
        moistureLevel: 62.4,
        depth: "Subsurface",
      },
      {
        location: "Bathroom - Ceiling",
        surfaceType: "Plaster",
        moistureLevel: 55.8,
        depth: "Subsurface",
      },
      {
        location: "Laundry - Wall",
        surfaceType: "Drywall",
        moistureLevel: 48.2,
        depth: "Subsurface",
      },
    ],
    affectedAreas: [
      {
        id: newRoomEntryId(),
        roomZoneId: "Bathroom",
        roomType: "Bathroom",
        length: 3.5,
        width: 2.5,
        height: 2.4,
        affectedSquareFootage: 8.75,
        materials: ["Drywall", "Plaster"],
        waterSource: "Grey Water",
        timeSinceLoss: 720,
      },
    ],
    selectedScopeItems: [
      "demolish_drywall",
      "apply_antimicrobial",
      "containment_setup",
      "ppe_required",
      "sanitize_materials",
    ],
    equipmentSelection: [
      { id: "eq-1", type: "Desiccant Dehumidifier", quantity: 2 },
      { id: "eq-2", type: "Air Mover", quantity: 6 },
    ],
    dryingDuration: 10,
    assessmentSeed: {
      mouldConditionLevel: "CONDITION_3",
      visibleGrowthObserved: true,
      sporeType: "STACHYBOTRYS",
      affectedAreaM2: 8.75,
      moistureSourceIdentified: true,
      rootCauseAddressed: false,
      containmentBarrierMaterial: "6-mil poly sheeting",
      pressureDifferentialPa: -2.5,
    },
    complianceSeed: baseCompliance({
      state: "QLD",
      claimNumber: "CLM-DEMO-MOULD-003",
    }),
    makeSafeSeed: buildMakeSafePreset([
      "power_isolated",
      "mould_containment",
      "occupant_briefing",
    ]),
  }),

  "storm-damage": buildTemplate({
    id: "storm-damage",
    name: "Storm Damage - Roof Leak",
    description:
      "Residential property with water damage from severe storm causing roof penetration",
    claimType: "WATER",
    category: "2",
    waterClass: "3",
    propertyAddress: "321 Weather Street, Sydney NSW 2000",
    propertyPostcode: "2000",
    technicianName: "Michael Brown",
    damageDescription:
      "Severe storm event with roof penetration above living room. Storm water entered ceiling cavity and affected living room ceiling, walls, and flooring. Temporary tarp installed; Category 2 conditions documented.",
    environmentalData: {
      ambientTemperature: 20,
      humidityLevel: 68,
      dewPoint: 14.0,
      airCirculation: true,
      weatherConditions: "Post-storm, 20°C",
    },
    moistureReadings: [
      {
        location: "Living Room - Ceiling",
        surfaceType: "Plaster",
        moistureLevel: 67.3,
        depth: "Subsurface",
      },
      {
        location: "Living Room - Wall",
        surfaceType: "Drywall",
        moistureLevel: 59.1,
        depth: "Subsurface",
      },
      {
        location: "Living Room - Floor",
        surfaceType: "Hardwood",
        moistureLevel: 44.7,
        depth: "Surface",
      },
      {
        location: "Attic - Floor Joists",
        surfaceType: "Wood",
        moistureLevel: 72.5,
        depth: "Subsurface",
      },
    ],
    affectedAreas: [
      {
        id: newRoomEntryId(),
        roomZoneId: "Living Room",
        roomType: "Living Room",
        length: 6.0,
        width: 5.0,
        height: 2.7,
        affectedSquareFootage: 30.0,
        materials: ["Plaster", "Drywall", "Hardwood"],
        waterSource: "Grey Water",
        timeSinceLoss: 18,
      },
      {
        id: newRoomEntryId(),
        roomZoneId: "Attic Space",
        roomType: "Other",
        customRoomName: "Attic Space",
        length: 8.0,
        width: 6.0,
        height: 2.4,
        affectedSquareFootage: 48.0,
        materials: ["Wood", "Insulation"],
        waterSource: "Grey Water",
        timeSinceLoss: 18,
      },
    ],
    selectedScopeItems: [
      "extract_standing_water",
      "install_dehumidification",
      "install_air_movers",
      "demolish_drywall",
      "apply_antimicrobial",
      "dry_out_structure",
      "containment_setup",
      "ppe_required",
    ],
    equipmentSelection: [
      { id: "eq-1", type: "LGR Dehumidifier", quantity: 3 },
      { id: "eq-2", type: "Air Mover", quantity: 5 },
    ],
    dryingDuration: 6,
    assessmentSeed: waterAssessment("2", "3", {
      lossSourceType: "ROOF",
      hoursOfExposure: 18,
    }),
    complianceSeed: baseCompliance({ claimNumber: "CLM-DEMO-STORM-004" }),
  }),

  "flood-damage": buildTemplate({
    id: "flood-damage",
    name: "Flood Damage - Category 3",
    description:
      "Severe flood damage from overflowing river affecting ground floor",
    claimType: "WATER",
    category: "3",
    waterClass: "3",
    propertyAddress: "555 Riverside Drive, Adelaide SA 5000",
    propertyPostcode: "5000",
    technicianName: "Thomas Wilson",
    damageDescription:
      "River overflow inundated ground floor to approximately 1.2 m. Category 3 water confirmed in kitchen, family room, dining, and garage. Occupants evacuated; PPE and containment mandatory before structural drying.",
    environmentalData: {
      ambientTemperature: 18,
      humidityLevel: 80,
      dewPoint: 14.6,
      airCirculation: false,
      weatherConditions: "Cool, 18°C, high humidity",
    },
    moistureReadings: [
      {
        location: "Kitchen - Floor",
        surfaceType: "Tile",
        moistureLevel: 78.5,
        depth: "Subsurface",
      },
      {
        location: "Family Room - Wall",
        surfaceType: "Drywall",
        moistureLevel: 71.2,
        depth: "Subsurface",
      },
      {
        location: "Garage - Floor",
        surfaceType: "Concrete",
        moistureLevel: 65.8,
        depth: "Surface",
      },
      {
        location: "Dining Room - Wall",
        surfaceType: "Drywall",
        moistureLevel: 69.4,
        depth: "Subsurface",
      },
    ],
    affectedAreas: [
      {
        id: newRoomEntryId(),
        roomZoneId: "Kitchen",
        roomType: "Kitchen",
        length: 5.0,
        width: 4.0,
        height: 2.7,
        affectedSquareFootage: 20.0,
        materials: ["Tile", "Drywall", "Cabinetry"],
        waterSource: "Black Water",
        timeSinceLoss: 48,
      },
      {
        id: newRoomEntryId(),
        roomZoneId: "Family Room",
        roomType: "Living Room",
        length: 6.5,
        width: 5.5,
        height: 2.7,
        affectedSquareFootage: 35.75,
        materials: ["Drywall", "Carpet"],
        waterSource: "Black Water",
        timeSinceLoss: 48,
      },
    ],
    selectedScopeItems: [
      "remove_carpet",
      "extract_standing_water",
      "install_dehumidification",
      "install_air_movers",
      "demolish_drywall",
      "apply_antimicrobial",
      "dry_out_structure",
      "containment_setup",
      "ppe_required",
      "sanitize_materials",
    ],
    equipmentSelection: [
      { id: "eq-1", type: "LGR Dehumidifier", quantity: 4 },
      { id: "eq-2", type: "Air Mover", quantity: 10 },
    ],
    dryingDuration: 14,
    assessmentSeed: waterAssessment("3", "3", {
      lossSourceType: "FLOOD",
      hoursOfExposure: 48,
    }),
    complianceSeed: baseCompliance({
      state: "SA",
      claimNumber: "CLM-DEMO-FLOOD-005",
    }),
    makeSafeSeed: buildMakeSafePreset([
      "power_isolated",
      "water_stopped",
      "occupant_briefing",
      "gas_isolated",
    ]),
  }),
};

export const NIR_QUICK_FILL_USE_CASES = Object.values(NIR_QUICK_FILL_TEMPLATES).map(
  ({ id, name, description }) => ({ id, name, description }),
);
