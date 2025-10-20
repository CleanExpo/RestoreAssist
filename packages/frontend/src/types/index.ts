export type DamageType = 'water' | 'fire' | 'storm' | 'flood' | 'mold' | 'biohazard' | 'impact' | 'other';
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
  category?: string;
}

export interface PaymentMilestone {
  milestone: string;
  percentage: number;
  amount: number;
}

export interface PaymentTerms {
  depositRequired: number;
  paymentSchedule: PaymentMilestone[];
  terms: string[];
}

export interface GeneratedReport {
  reportId: string;
  timestamp: string;
  propertyAddress: string;
  damageType: DamageType;
  state: AustralianState;
  summary: string;
  severity?: string;
  urgent?: boolean;
  recommendations?: string[];
  scopeOfWork: string[];
  itemizedEstimate: ReportItem[];
  subtotal?: number;
  gst?: number;
  totalCost: number;
  complianceNotes: string[];
  paymentTerms?: PaymentTerms;
  authorityToProceed: string;
  metadata?: {
    clientName?: string;
    insuranceCompany?: string;
    claimNumber?: string;
    generatedBy: string;
    model: string;
  };
}
