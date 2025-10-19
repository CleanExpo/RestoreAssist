// Ascora CRM Integration Type Definitions
// Comprehensive TypeScript interfaces for Ascora CRM integration

/**
 * Ascora Integration Configuration
 */
export interface AscoraIntegration {
  id: string;
  organizationId: string;
  userId: string;
  apiUrl: string;
  companyCode: string;
  isActive: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncAt?: string;
  syncSettings: AscoraSync Settings;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Sync Settings Configuration
 */
export interface AscoraSync Settings {
  syncCustomers: boolean;
  syncJobs: boolean;
  syncInvoices: boolean;
  autoSync?: boolean;
  syncInterval?: number; // minutes
  conflictResolution?: 'local' | 'remote' | 'manual';
}

/**
 * Connection Data for Initial Setup
 */
export interface AscoraConnectionData {
  apiUrl: string;
  apiToken: string;
  companyCode: string;
  syncSettings?: Partial<AscoraSync Settings>;
}

/**
 * Integration Response After Connection
 */
export interface AscoraIntegrationResponse {
  integration: AscoraIntegration;
  testResult: {
    success: boolean;
    message: string;
    companyInfo?: {
      name: string;
      code: string;
      status: string;
    };
  };
}

/**
 * Ascora Integration Status
 */
export interface AscoraStatus {
  isConnected: boolean;
  isActive: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncAt?: string;
  nextSyncAt?: string;
  integration?: AscoraIntegration;
  statistics: AscoraStatistics;
  errors?: string[];
}

/**
 * Integration Statistics
 */
export interface AscoraStatistics {
  totalCustomers: number;
  totalJobs: number;
  totalInvoices: number;
  syncedCustomers: number;
  syncedJobs: number;
  syncedInvoices: number;
  pendingSync: number;
  failedSync: number;
  lastSyncDuration?: number; // milliseconds
}

/**
 * Ascora Job
 */
export interface AscoraJob {
  id: string;
  integrationId: string;
  ascoraJobId: string;
  jobNumber: string;
  reportId?: string;
  customerId?: string;
  customerName?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description?: string;
  notes?: string;
  scheduledDate?: string;
  completedDate?: string;
  estimatedCost?: number;
  actualCost?: number;
  estimatedHours?: number;
  actualHours?: number;
  assignedTo?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Job Note
 */
export interface JobNote {
  id: string;
  jobId: string;
  userId: string;
  userName?: string;
  note: string;
  isInternal: boolean;
  createdAt: string;
}

/**
 * Job Attachment
 */
export interface JobAttachment {
  id: string;
  jobId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
}

/**
 * Ascora Customer
 */
export interface AscoraCustomer {
  id: string;
  integrationId: string;
  ascoraCustomerId: string;
  contactId?: string; // Link to RestoreAssist contact
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  billingAddress?: CustomerAddress;
  shippingAddress?: CustomerAddress;
  notes?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  isActive: boolean;
  lastSyncedAt?: string;
  syncStatus: 'synced' | 'pending' | 'error';
  syncError?: string;
  hasConflict?: boolean;
  conflictData?: ConflictData;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Customer Address
 */
export interface CustomerAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * Conflict Data for Resolution
 */
export interface ConflictData {
  local?: Partial<AscoraCustomer> | Partial<AscoraJob>;
  remote?: Partial<AscoraCustomer> | Partial<AscoraJob>;
  fields?: string[];
  conflictedAt?: string;
}

/**
 * Ascora Invoice
 */
export interface AscoraInvoice {
  id: string;
  integrationId: string;
  ascoraInvoiceId: string;
  invoiceNumber: string;
  jobId?: string;
  jobNumber?: string;
  customerId?: string;
  customerName?: string;
  issueDate: string;
  dueDate?: string;
  totalAmount: number;
  taxAmount?: number;
  subtotal?: number;
  paidAmount: number;
  balanceDue: number;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'partial' | 'overdue' | 'cancelled';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  lineItems?: InvoiceLineItem[];
  payments?: AscoraPayment[];
  notes?: string;
  terms?: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Invoice Line Item
 */
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate?: number;
  taxAmount?: number;
}

/**
 * Ascora Payment
 */
export interface AscoraPayment {
  id?: string;
  invoiceId: string;
  amount: number;
  paymentMethod: 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'check' | 'other';
  paymentDate: string;
  reference?: string;
  notes?: string;
  processedBy?: string;
  createdAt?: string;
}

/**
 * Sync Log Entry
 */
export interface AscoraSync Log {
  id: string;
  integrationId: string;
  resourceType: 'customer' | 'job' | 'invoice';
  operation: 'sync' | 'create' | 'update' | 'delete';
  status: 'success' | 'error' | 'in_progress' | 'pending';
  direction: 'push' | 'pull' | 'bidirectional';
  totalItems?: number;
  itemsProcessed?: number;
  itemsFailed?: number;
  errorMessage?: string;
  details?: Record<string, any>;
  duration?: number; // milliseconds
  timestamp: string;
}

/**
 * Sync Result
 */
export interface SyncResult {
  success: boolean;
  resourceType: string;
  totalItems: number;
  itemsProcessed: number;
  itemsFailed: number;
  errors?: SyncError[];
  duration: number;
  timestamp: string;
}

/**
 * Sync Error
 */
export interface SyncError {
  itemId: string;
  itemType: string;
  error: string;
  details?: any;
}

/**
 * Sync Status
 */
export interface SyncStatus {
  status: 'idle' | 'syncing' | 'success' | 'error';
  currentOperation?: string;
  progress?: number; // 0-100
  startedAt?: string;
  estimatedCompletion?: string;
  lastError?: string;
}

/**
 * List Options for API Queries
 */
export interface AscoraListOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, any>;
}

/**
 * API Response Wrapper
 */
export interface AscoraApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Webhook Event
 */
export interface WebhookEvent {
  id: string;
  event: string;
  resourceType: 'job' | 'customer' | 'invoice' | 'payment';
  resourceId: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed';
  data: any;
  timestamp: string;
  signature?: string;
}

/**
 * Job Creation from Report
 */
export interface CreateJobFromReportRequest {
  reportId: string;
  customerId?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  scheduledDate?: string;
  notes?: string;
  customFields?: Record<string, any>;
}

/**
 * Job Creation Response
 */
export interface CreateJobFromReportResponse {
  jobId: string;
  ascoraJobId: string;
  jobNumber: string;
  job: AscoraJob;
}

/**
 * Customer Search Result
 */
export interface CustomerSearchResult {
  customers: AscoraCustomer[];
  total: number;
  hasMore: boolean;
}

/**
 * Job Statistics
 */
export interface JobStatistics {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  totalEstimatedCost: number;
  totalActualCost: number;
  averageEstimatedCost: number;
  averageActualCost: number;
  averageDuration: number;
}

/**
 * Customer Statistics
 */
export interface CustomerStatistics {
  total: number;
  synced: number;
  pending: number;
  conflicts: number;
  errors: number;
  active: number;
  inactive: number;
}

/**
 * Sync Statistics
 */
export interface SyncStatistics {
  total: number;
  successful: number;
  failed: number;
  inProgress: number;
  pending: number;
  averageDuration: number;
  successRate: number;
  lastSyncAt?: string;
}

/**
 * Error Response
 */
export interface AscoraErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
  timestamp: string;
}

/**
 * Validation Error
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Bulk Operation Request
 */
export interface BulkOperationRequest<T> {
  operation: 'create' | 'update' | 'delete' | 'sync';
  items: T[];
  options?: {
    stopOnError?: boolean;
    continueOnConflict?: boolean;
  };
}

/**
 * Bulk Operation Response
 */
export interface BulkOperationResponse {
  success: boolean;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  results: Array<{
    itemId: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Export all types
 */
export type {
  // Re-export everything for convenience
};

// Default export for easier importing
export default {
  // Type guards and utilities can be added here
};
