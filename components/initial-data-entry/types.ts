/**
 * Shared types for the InitialDataEntryForm component and its sub-components.
 *
 * Extracted from components/InitialDataEntryForm.tsx during RA-512 refactor.
 * Keeping the full initialData shape as a named type lets sub-components
 * (review section, quick-fill dialog, etc.) import just the types they need
 * without pulling in the 5,900-line parent component.
 */

export interface InitialDataShape {
  clientName?: string;
  clientContactDetails?: string;
  propertyAddress?: string;
  propertyPostcode?: string;
  claimReferenceNumber?: string;
  incidentDate?: string;
  technicianAttendanceDate?: string;
  technicianName?: string;
  technicianFieldReport?: string;
  // Property Intelligence
  buildingAge?: string;
  structureType?: string;
  accessNotes?: string;
  // New Fields
  propertyId?: string;
  jobNumber?: string;
  reportInstructions?: string;
  // Additional Contact Information
  builderDeveloperCompanyName?: string;
  builderDeveloperContact?: string;
  builderDeveloperAddress?: string;
  builderDeveloperPhone?: string;
  ownerManagementContactName?: string;
  ownerManagementPhone?: string;
  ownerManagementEmail?: string;
  // Previous Maintenance & Repair History
  lastInspectionDate?: string;
  buildingChangedSinceLastInspection?: string;
  structureChangesSinceLastInspection?: string;
  previousLeakage?: string;
  emergencyRepairPerformed?: string;
  // Hazard Profile
  insurerName?: string;
  methamphetamineScreen?: string;
  methamphetamineTestCount?: string;
  biologicalMouldDetected?: boolean;
  biologicalMouldCategory?: string;
  // Timeline Estimation
  phase1StartDate?: string;
  phase1EndDate?: string;
  phase2StartDate?: string;
  phase2EndDate?: string;
  phase3StartDate?: string;
  phase3EndDate?: string;
  // Equipment & Tools Selection
  psychrometricWaterClass?: number;
  psychrometricTemperature?: number;
  psychrometricHumidity?: number;
  psychrometricSystemType?: "open" | "closed";
  scopeAreas?: Array<{
    name: string;
    length: number;
    width: number;
    height: number;
    wetPercentage: number;
  }>;
  equipmentMentioned?: string[];
  estimatedDryingDuration?: number;
  equipmentDeployment?: Array<{
    equipmentName: string;
    quantity: number;
    dailyRate: number;
    duration: number;
    totalCost: number;
  }>;
  totalEquipmentCost?: number;
  // NIR Inspection Data
  nirData?: {
    moistureReadings?: Array<{
      location: string;
      surfaceType: string;
      moistureLevel: number;
      depth: "Surface" | "Subsurface";
    }>;
    affectedAreas?: Array<{
      roomZoneId: string;
      affectedSquareFootage: number;
      waterSource: string;
      timeSinceLoss: number;
    }>;
    scopeItems?: string[];
  };
}

export type ReportType = "basic" | "enhanced" | "optimised";

export interface InitialDataEntryFormProps {
  onSuccess?: (reportId: string, reportType?: ReportType) => void;
  /** Report ID when editing existing report */
  initialReportId?: string | null;
  initialData?: InitialDataShape;
  subscriptionStatus?: string;
}
