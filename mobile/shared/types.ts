/**
 * Shared TypeScript types mirroring the Prisma schema for mobile field use.
 * These are the key models needed for offline-first field operations.
 */

export type InspectionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PROCESSING"
  | "CLASSIFIED"
  | "SCOPED"
  | "ESTIMATED"
  | "COMPLETED"
  | "REJECTED";

export interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  businessName: string | null;
  businessABN: string | null;
  businessPhone: string | null;
}

export interface EnvironmentalData {
  id: string;
  inspectionId: string;
  ambientTemperature: number;
  humidityLevel: number;
  dewPoint: number | null;
  airCirculation: boolean;
  weatherConditions: string | null;
  notes: string | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MoistureReading {
  id: string;
  inspectionId: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: string;
  notes: string | null;
  photoUrl: string | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AffectedArea {
  id: string;
  inspectionId: string;
  roomZoneId: string;
  affectedSquareFootage: number;
  waterSource: string;
  timeSinceLoss: number | null;
  category: string | null;
  class: string | null;
  description: string | null;
  photos: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScopeItem {
  id: string;
  inspectionId: string;
  itemType: string;
  description: string;
  areaId: string | null;
  quantity: number | null;
  unit: string | null;
  specification: string | null;
  autoDetermined: boolean;
  justification: string | null;
  isRequired: boolean;
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Inspection {
  id: string;
  reportId: string | null;
  inspectionNumber: string;
  propertyAddress: string;
  propertyPostcode: string;
  inspectionDate: string;
  technicianName: string | null;
  technicianId: string | null;
  status: InspectionStatus;
  submittedAt: string | null;
  processedAt: string | null;
  userId: string;
  // Property details
  propertyYearBuilt: number | null;
  propertyWallMaterial: string | null;
  propertyRoofMaterial: string | null;
  propertyFloorType: string | null;
  propertyFloorArea: number | null;
  propertyBedrooms: number | null;
  propertyBathrooms: number | null;
  // Visual mapping
  floorPlanImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations (populated when fetching full detail)
  environmentalData?: EnvironmentalData | null;
  moistureReadings?: MoistureReading[];
  affectedAreas?: AffectedArea[];
  scopeItems?: ScopeItem[];
  photos?: Array<{ id: string; url?: string | null; location?: string | null }>;
}

export type ReportStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "REVIEW"
  | "COMPLETED"
  | "ARCHIVED";

export interface Report {
  id: string;
  title: string;
  description: string | null;
  status: ReportStatus;
  clientName: string;
  propertyAddress: string;
  hazardType: string;
  insuranceType: string;
  totalCost: number | null;
  claimReferenceNumber: string | null;
  incidentDate: string | null;
  technicianName: string | null;
  jobNumber: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}
