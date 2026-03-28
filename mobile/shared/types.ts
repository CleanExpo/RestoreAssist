// ============================================================
// RESTOREASSIST SHARED TYPES
// Shared between Next.js web app and React Native mobile app
// ============================================================

// --- BYOK Provider Types ---
export const ALLOWED_MODELS = {
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6'] as const,
  google: ['gemini-3.1-pro', 'gemini-3.1-flash'] as const,
  openai: ['gpt-5.4', 'gpt-5.4-mini'] as const,
} as const;

export type Provider = keyof typeof ALLOWED_MODELS;
export type AnthropicModel = typeof ALLOWED_MODELS.anthropic[number];
export type GoogleModel = typeof ALLOWED_MODELS.google[number];
export type OpenAIModel = typeof ALLOWED_MODELS.openai[number];
export type AllowedModel = AnthropicModel | GoogleModel | OpenAIModel;

export interface BYOKConfig {
  provider: Provider;
  model: AllowedModel;
  apiKey: string;
}

// --- User & Auth Types ---
export type UserRole = 'USER' | 'MANAGER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  businessProfileId: string | null;
  organizationId: string | null;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
}
export type SubscriptionStatus = 
  | 'active' 
  | 'trialing' 
  | 'past_due' 
  | 'canceled' 
  | 'incomplete' 
  | 'lifetime';

// --- Inspection Types ---
export type WaterDamageCategory = 'CAT_1' | 'CAT_2' | 'CAT_3';
export type WaterDamageClass = 'CLASS_1' | 'CLASS_2' | 'CLASS_3' | 'CLASS_4';
export type InspectionStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'SUBMITTED' | 'APPROVED';

export interface Inspection {
  id: string;
  localId?: string; // For offline-created inspections
  jobId: string;
  status: InspectionStatus;
  category: WaterDamageCategory | null;
  damageClass: WaterDamageClass | null;
  propertyAddress: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface MoistureReading {
  id: string;
  localId?: string;
  inspectionId: string;
  location: string; // e.g., "Living Room - North Wall"
  material: MaterialType;
  reading: number; // Percentage or raw value
  unit: 'percentage' | 'raw';
  meterType: string; // e.g., "Tramex MRH III"
  meterSerial: string | null;
  calibrationDate: string | null; // S500:2025 compliance - RA-221
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  syncStatus: SyncStatus;
}
export type MaterialType = 
  | 'drywall' 
  | 'wood_structural' 
  | 'wood_flooring' 
  | 'concrete' 
  | 'carpet' 
  | 'insulation' 
  | 'tile' 
  | 'other';

export interface InspectionPhoto {
  id: string;
  localId?: string;
  inspectionId: string;
  uri: string; // Local file URI
  remoteUrl: string | null; // Cloudinary URL after upload
  caption: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  width: number;
  height: number;
  syncStatus: SyncStatus;
}

// --- Equipment Types (S500:2025 - RA-224) ---
export type EquipmentType = 'DEHUMIDIFIER' | 'AIR_MOVER' | 'AIR_SCRUBBER' | 'HEPA_FILTER' | 'MOISTURE_METER' | 'THERMAL_CAMERA';

export interface EquipmentDeployment {
  id: string;
  localId?: string;
  inspectionId: string;
  equipmentType: EquipmentType;
  make: string;
  model: string;
  serialNumber: string | null;
  location: string;
  deployedAt: string;
  removedAt: string | null;
  runHours: number | null;
  syncStatus: SyncStatus;
}
// --- Environmental Data (S500:2025 - RA-222, RA-223) ---
export interface EnvironmentalReading {
  id: string;
  localId?: string;
  inspectionId: string;
  temperature: number; // Celsius
  relativeHumidity: number; // Percentage
  gpp: number | null; // Grains Per Pound - RA-222
  emc: number | null; // Equilibrium Moisture Content - RA-223
  location: string;
  timestamp: string;
  syncStatus: SyncStatus;
}

// --- Job Types ---
export type JobStatus = 'PENDING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';

export interface Job {
  id: string;
  clientId: string;
  clientName: string;
  propertyAddress: string;
  status: JobStatus;
  category: WaterDamageCategory | null;
  damageClass: WaterDamageClass | null;
  assignedTo: string[];
  inspectionCount: number;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
}

// --- Report Types ---
export type ReportStatus = 'GENERATING' | 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SENT';

export interface Report {
  id: string;
  inspectionId: string;
  jobId: string;
  status: ReportStatus;
  reportType: 'INITIAL_ASSESSMENT' | 'PROGRESS' | 'FINAL' | 'FORENSIC';
  generatedBy: AllowedModel | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
// --- Sync Types ---
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'conflict' | 'error';

export interface SyncQueueItem {
  id: string;
  entityType: 'inspection' | 'moisture_reading' | 'photo' | 'equipment' | 'environmental';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  payload: string; // JSON stringified
  attempts: number;
  maxAttempts: number;
  lastAttempt: string | null;
  error: string | null;
  createdAt: string;
}

// --- Notification Types ---
export interface AppNotification {
  id: string;
  type: 'JOB_ASSIGNED' | 'REPORT_APPROVED' | 'REPORT_REJECTED' | 'COMPLIANCE_ALERT' | 'SYNC_ERROR';
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
}

// --- Psychrometric Calculations (S500:2025) ---
export function calculateGPP(tempC: number, rh: number): number {
  // Magnus formula for saturation vapor pressure
  const a = 17.27;
  const b = 237.7;
  const svp = 6.1078 * Math.exp((a * tempC) / (b + tempC));
  const actualVP = svp * (rh / 100);
  // Convert to grains per pound (1 kPa ≈ 7000 grains / 0.622)
  const gpp = (actualVP * 7000 * 0.622) / 1013.25;
  return Math.round(gpp * 10) / 10;
}

export function calculateEMC(tempC: number, rh: number): number {
  // Hailwood-Horrobin equation for wood EMC
  const h = rh / 100;
  const T = tempC * 1.8 + 32; // Convert to Fahrenheit for the standard equation
  const W = 330 + 0.452 * T + 0.00415 * T * T;
  const K = 0.791 + 0.000463 * T - 0.000000844 * T * T;
  const K1 = 6.34 + 0.000775 * T - 0.0000935 * T * T;
  const K2 = 1.09 + 0.0284 * T - 0.0000904 * T * T;
  const emc = (1800 / W) * ((K * h) / (1 - K * h) + (K1 * K * h + 2 * K1 * K2 * K * K * h * h) / (1 + K1 * K * h + K1 * K2 * K * K * h * h));
  return Math.round(emc * 10) / 10;
}