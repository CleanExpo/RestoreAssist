// Ascora CRM Integration Components
// Export all components for easy importing throughout the application

export { AscoraConnect } from './AscoraConnect';
export type { AscoraConnectProps } from './AscoraConnect';

export { AscoraStatus } from './AscoraStatus';
export type { AscoraStatusProps } from './AscoraStatus';

export { AscoraJobCreator } from './AscoraJobCreator';
export type { AscoraJobCreatorProps } from './AscoraJobCreator';

export { AscoraJobList } from './AscoraJobList';
export type { AscoraJobListProps } from './AscoraJobList';

export { AscoraCustomerSync } from './AscoraCustomerSync';
export type { AscoraCustomerSyncProps } from './AscoraCustomerSync';

export { AscoraInvoiceManager } from './AscoraInvoiceManager';
export type { AscoraInvoiceManagerProps } from './AscoraInvoiceManager';

export { AscoraSyncManager } from './AscoraSyncManager';
export type { AscoraSyncManagerProps } from './AscoraSyncManager';

// Re-export types from hooks for convenience
export type {
  AscoraIntegration,
  AscoraStatus as AscoraIntegrationStatus,
  AscoraJob,
  AscoraCustomer,
  AscoraInvoice,
  AscoraPayment,
  AscoraSyncLog,
  AscoraConnectionData,
  AscoraIntegrationResponse,
  SyncResult,
  SyncStatus as AscoraSyncStatus
} from '../../types/ascora';
