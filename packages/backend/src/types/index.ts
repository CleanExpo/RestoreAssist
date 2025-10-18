export type DamageType = 'water' | 'fire' | 'storm' | 'flood' | 'mold';

export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

export interface GenerateReportRequest {
  propertyAddress: string;
  damageType: DamageType;
  damageDescription: string;
  state: AustralianState;
  clientName?: string;
  insuranceCompany?: string;
  claimNumber?: string;
}

export interface ReportItem {
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  category: string;
}

export interface GeneratedReport {
  reportId: string;
  timestamp: string;
  propertyAddress: string;
  damageType: DamageType;
  state: AustralianState;
  summary: string;
  scopeOfWork: string[];
  itemizedEstimate: ReportItem[];
  totalCost: number;
  complianceNotes: string[];
  authorityToProceed: string;
  metadata: {
    clientName?: string;
    insuranceCompany?: string;
    claimNumber?: string;
    generatedBy: string;
    model: string;
  };
}
