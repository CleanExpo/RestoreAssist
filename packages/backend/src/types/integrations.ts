/**
 * ServiceM8 and other CRM integration types
 */

// ServiceM8 Job Types
export interface ServiceM8Job {
  uuid: string;
  job_address: string;
  job_description: string;
  status: 'Quote' | 'Approved' | 'Work Order' | 'In Progress' | 'Completed' | 'Cancelled';
  contact_first: string;
  contact_last: string;
  contact_email: string;
  contact_phone: string;
  total_invoice_amount?: number;
  created_date: string;
  updated_date: string;
  custom_fields?: Record<string, any>;
}

export interface ServiceM8JobCreateRequest {
  job_address: string;
  job_description: string;
  contact_first: string;
  contact_last: string;
  contact_email?: string;
  contact_phone?: string;
  status?: 'Quote' | 'Approved' | 'Work Order' | 'In Progress' | 'Completed';
  custom_fields?: Record<string, any>;
}

export interface ServiceM8JobUpdateRequest {
  job_address?: string;
  job_description?: string;
  status?: 'Quote' | 'Approved' | 'Work Order' | 'In Progress' | 'Completed' | 'Cancelled';
  contact_first?: string;
  contact_last?: string;
  contact_email?: string;
  contact_phone?: string;
  total_invoice_amount?: number;
  custom_fields?: Record<string, any>;
}

// ServiceM8 API Response Types
export interface ServiceM8ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

export interface ServiceM8JobsListResponse {
  jobs: ServiceM8Job[];
  total: number;
  page: number;
  limit: number;
}

// Sync Status Tracking
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncRecord {
  syncId: string;
  reportId: string;
  serviceM8JobId: string;
  status: SyncStatus;
  lastSyncAt?: string;
  errorMessage?: string;
  syncData?: {
    reportSnapshot?: any;
    jobSnapshot?: any;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SyncReportToJobRequest {
  reportId: string;
  serviceM8JobId: string;
  syncFields?: {
    description?: boolean;
    address?: boolean;
    cost?: boolean;
    customFields?: boolean;
  };
}

export interface SyncReportToJobResponse {
  success: boolean;
  syncRecord: SyncRecord;
  updatedJob?: ServiceM8Job;
  message: string;
}

// Google Drive Types
export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  webContentLink?: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  webViewLink: string;
  createdTime: string;
}

export interface GoogleDriveUploadRequest {
  fileName: string;
  filePath: string;
  folderId?: string;
  mimeType?: string;
  description?: string;
}

export interface GoogleDriveUploadResponse {
  success: boolean;
  file?: GoogleDriveFile;
  message: string;
}

export interface GoogleDriveAuthTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type: string;
  scope: string;
}

export interface GoogleDriveUserAuth {
  userId: string;
  tokens: GoogleDriveAuthTokens;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveToDriveRequest {
  reportId: string;
  format: 'docx' | 'pdf';
  folderId?: string;
  share?: {
    type: 'anyone' | 'domain' | 'user';
    role: 'reader' | 'writer' | 'commenter';
    emailAddress?: string;
  };
}

export interface SaveToDriveResponse {
  success: boolean;
  file?: GoogleDriveFile;
  exportResult?: any;
  message: string;
}

export interface DriveFileRecord {
  recordId: string;
  reportId: string;
  driveFileId: string;
  fileName: string;
  fileUrl: string;
  format: 'docx' | 'pdf';
  uploadedAt: string;
  uploadedBy: string;
}

// Integration Configuration
export interface IntegrationConfig {
  servicem8?: {
    enabled: boolean;
    apiKey: string;
    domain: string;
    autoSync?: boolean;
    syncInterval?: number; // minutes
  };
  googleDrive?: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    defaultFolder?: string;
  };
}

// Integration Statistics
export interface IntegrationStats {
  servicem8?: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    lastSyncAt?: string;
    connectedJobs: number;
  };
  googleDrive?: {
    totalUploads: number;
    successfulUploads: number;
    failedUploads: number;
    lastUploadAt?: string;
    connectedUsers: number;
  };
}
