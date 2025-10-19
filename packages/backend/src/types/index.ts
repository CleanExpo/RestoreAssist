export type DamageType = 'water' | 'fire' | 'storm' | 'flood' | 'mold';

export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

export type UserRole = 'admin' | 'user' | 'viewer';

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
  severity: string;
  urgent: boolean;
  recommendations: string[];
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
