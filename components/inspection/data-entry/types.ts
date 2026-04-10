/**
 * Shared types for the InitialDataEntryForm and its sub-components.
 *
 * Extracted from the monolithic InitialDataEntryForm.tsx to allow
 * independent compilation and reuse across the data-entry component family.
 */

import type { EquipmentSelection } from "@/lib/equipment-matrix";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Form Data ──────────────────────────────────────────────────────────

export interface FormData {
  clientName: string;
  clientContactDetails: string;
  propertyAddress: string;
  propertyPostcode: string;
  claimReferenceNumber: string;
  incidentDate: string;
  technicianAttendanceDate: string;
  technicianName: string;
  technicianFieldReport: string;
  // Property Intelligence
  buildingAge: string;
  structureType: string;
  accessNotes: string;
  // New Fields
  propertyId: string;
  jobNumber: string;
  reportInstructions: string;
  // Additional Contact Information
  builderDeveloperCompanyName: string;
  builderDeveloperContact: string;
  builderDeveloperAddress: string;
  builderDeveloperPhone: string;
  ownerManagementContactName: string;
  ownerManagementPhone: string;
  ownerManagementEmail: string;
  // Previous Maintenance & Repair History
  lastInspectionDate: string;
  buildingChangedSinceLastInspection: string;
  structureChangesSinceLastInspection: string;
  previousLeakage: string;
  emergencyRepairPerformed: string;
  // Hazard Profile
  insurerName: string;
  methamphetamineScreen: string;
  methamphetamineTestCount: string;
  biologicalMouldDetected: boolean;
  biologicalMouldCategory: string;
  // Timeline Estimation
  phase1StartDate: string;
  phase1EndDate: string;
  phase2StartDate: string;
  phase2EndDate: string;
  phase3StartDate: string;
  phase3EndDate: string;
}

// ── Scope Area ─────────────────────────────────────────────────────────

export interface ScopeArea {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  wetPercentage: number;
}

// ── NIR Types ──────────────────────────────────────────────────────────

export interface NirMoistureReading {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: "Surface" | "Subsurface";
}

export interface NirAffectedArea {
  id: string;
  roomZoneId: string;
  affectedSquareFootage: number;
  waterSource: string;
  timeSinceLoss: number;
  materials?: string[];
}

export interface NirEnvironmentalData {
  ambientTemperature: number;
  humidityLevel: number;
  dewPoint: number;
  airCirculation: boolean;
}

// ── Scope Item ─────────────────────────────────────────────────────────

export interface ScopeItemType {
  id: string;
  label: string;
}

// ── Step Definition ────────────────────────────────────────────────────

export interface StepDefinition {
  id: number;
  title: string;
  icon: any; // Lucide icon component
  description: string;
  requiredFields: string[];
  conditional?: boolean;
}

// ── Property Data ──────────────────────────────────────────────────────

export interface PropertyData {
  yearBuilt?: number | null;
  wallMaterial?: string | null;
  wallConstruction?: string | null;
  roofMaterial?: string | null;
  floorType?: string | null;
  floorArea?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  landArea?: number | null;
  stories?: number | null;
}

// ── Use Case ───────────────────────────────────────────────────────────

export interface UseCaseData {
  id: string;
  name: string;
  description: string;
  formData: FormData;
  nirMoistureReadings: Omit<NirMoistureReading, "id">[];
  nirAffectedAreas: Omit<NirAffectedArea, "id">[];
  nirSelectedScopeItems: Set<string>;
  nirEnvironmentalData: NirEnvironmentalData;
  waterClass: 1 | 2 | 3 | 4;
  temperature: number;
  humidity: number;
  systemType: "open" | "closed";
  areas: Omit<ScopeArea, "id">[];
  durationDays: number;
  equipmentSelections: EquipmentSelection[];
}

// ── Constants ──────────────────────────────────────────────────────────

export const SURFACE_TYPES = [
  "Drywall",
  "Wood",
  "Carpet",
  "Concrete",
  "Tile",
  "Vinyl",
  "Hardwood",
  "Particle Board",
  "Plaster",
  "Other",
] as const;

export const WATER_SOURCES = [
  "Clean Water",
  "Grey Water",
  "Black Water",
] as const;

export const SCOPE_ITEM_TYPES: ScopeItemType[] = [
  { id: "remove_carpet", label: "Remove Carpet" },
  { id: "sanitize_materials", label: "Sanitise Materials" },
  { id: "install_dehumidification", label: "Install Dehumidification" },
  { id: "install_air_movers", label: "Install Air Movers" },
  { id: "extract_standing_water", label: "Extract Standing Water" },
  { id: "demolish_drywall", label: "Demolish Drywall" },
  { id: "apply_antimicrobial", label: "Apply Antimicrobial Treatment" },
  { id: "dry_out_structure", label: "Dry Out Structure" },
  { id: "containment_setup", label: "Containment Setup" },
  { id: "ppe_required", label: "PPE Required" },
];
