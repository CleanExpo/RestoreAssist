/**
 * Browse shapes for Clients / Reports source switcher.
 * Native rows stay on /api/clients and /api/reports; external sources use
 * /api/synced/clients and /api/synced/jobs.
 */

export const DATA_SOURCES = ["native", "xero", "ascora"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const EXTERNAL_DATA_SOURCES = ["xero", "ascora"] as const;
export type ExternalDataSource = (typeof EXTERNAL_DATA_SOURCES)[number];

export function isDataSource(value: string): value is DataSource {
  return (DATA_SOURCES as readonly string[]).includes(value);
}

export function isExternalDataSource(
  value: string,
): value is ExternalDataSource {
  return (EXTERNAL_DATA_SOURCES as readonly string[]).includes(value);
}

export interface SyncedClientRow {
  id: string;
  externalId: string;
  source: ExternalDataSource;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Linked native Client id when already imported (Xero ExternalClient.contactId). */
  importedNativeId: string | null;
  jobCount: number | null;
  lastSyncedAt: string | null;
  /** True when Import via OAuth clients POST is available for this row. */
  canImport: boolean;
}

export interface SyncedJobRow {
  id: string;
  externalId: string;
  source: ExternalDataSource;
  title: string;
  status: string | null;
  clientName: string | null;
  address: string | null;
  description: string | null;
  claimType: string | null;
  totalExTax: number | null;
  completedAt: string | null;
  /** Linked native Report id when already imported (Xero ExternalJob.claimId). */
  importedNativeId: string | null;
  lastSyncedAt: string | null;
  canImport: boolean;
}

export interface SyncedListPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SyncedListResponse<T> {
  source: ExternalDataSource;
  connected: boolean;
  items: T[];
  pagination: SyncedListPagination;
  message?: string;
}
