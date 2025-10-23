export type DamageType = 'water' | 'fire' | 'storm' | 'flood' | 'mold';

export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

export type UserRole = 'admin' | 'user' | 'viewer' | 'premium';

export interface User {
  userId: string;
  email: string;
  password: string; // hashed
  name: string;
  role: UserRole;
  company?: string;
  createdAt: string;
  lastLogin?: string;
}

export interface UserPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface GenerateReportRequest {
  propertyAddress: string;
  damageType: DamageType;
  damageDescription: string;
  state: AustralianState;

  // Client information
  clientName?: string;
  clientContact?: string;
  insuranceCompany?: string;
  claimNumber?: string;
  assessorName?: string;

  // Property details
  propertyType?: 'Residential' | 'Commercial' | 'Industrial';
  affectedAreas?: string[];
  severity?: 'Minor' | 'Moderate' | 'Major' | 'Severe';

  // Supporting data
  photos?: Array<{ url: string; description: string }>;
  floorPlan?: string;
  previousWork?: string;
  specialRequirements?: string;
}

export interface ReportItem {
  description: string;
  quantity: number;
  unit?: string; // sqm, lm, hours, each, etc.
  unitCost: number;
  totalCost: number;
  category: string;
  notes?: string;
}

export interface GeneratedReport {
  reportId: string;
  timestamp: string;
  propertyAddress: string;
  damageType: DamageType;
  state: AustralianState;
  summary: string;
  severity: string;
  urgent: boolean;
  recommendations: string[];

  // Agent-generated detailed workflow
  restorationProtocol?: string[]; // Step-by-step emergency and restoration protocol
  scopeOfWork: string[];
  itemizedEstimate: ReportItem[];
  totalCost: number;

  // Compliance and safety
  complianceNotes: string[];
  safetyRequirements?: string[];

  // Timeline information
  timeline?: {
    emergency?: string;
    restoration?: string;
    completion?: string;
  };

  authorityToProceed: string;

  metadata: {
    clientName?: string;
    insuranceCompany?: string;
    claimNumber?: string;
    assessorName?: string;
    generatedBy: string;
    model: string;
    agentVersion?: string;
    generatedAt?: string;
  };
}
