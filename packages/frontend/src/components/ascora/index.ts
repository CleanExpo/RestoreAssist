// Ascora CRM Integration Components
// Components are temporarily disabled due to type mismatches
// TODO: Fix type alignment between hooks and types/ascora.ts

// export { AscoraConnect } from './AscoraConnect';
// export type { AscoraConnectProps } from './AscoraConnect';

// export { AscoraStatus } from './AscoraStatus';
// export type { AscoraStatusProps } from './AscoraStatus';

// export { AscoraJobCreator } from './AscoraJobCreator';
// export type { AscoraJobCreatorProps } from './AscoraJobCreator';

// export { AscoraJobList } from './AscoraJobList';
// export type { AscoraJobListProps } from './AscoraJobList';

// export { AscoraCustomerSync } from './AscoraCustomerSync';
// export type { AscoraCustomerSyncProps } from './AscoraCustomerSync';

// export { AscoraInvoiceManager } from './AscoraInvoiceManager';
// export type { AscoraInvoiceManagerProps } from './AscoraInvoiceManager';

// export { AscoraSyncManager } from './AscoraSyncManager';
// export type { AscoraSyncManagerProps } from './AscoraSyncManager';

// Re-export types from types/ascora for convenience
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
