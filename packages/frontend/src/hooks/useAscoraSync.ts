/**
 * useAscoraSync Hook
 * Sync operations and status tracking for Ascora CRM
 *
 * Features:
 * - Start/stop sync schedules
 * - Manual sync operations
 * - Track sync status
 * - View sync logs
 * - Retry failed items
 *
 * @module useAscoraSync
 */

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

// ===== Type Definitions =====

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'success' | 'error';
  lastSync: Date | string | null;
  totalCustomers: number;
  totalJobs: number;
  totalInvoices: number;
  recentLogs: SyncLog[];
}

export interface SyncLog {
  id: string;
  syncType: string;
  source?: string;
  target?: string;
  resourceType?: string;
  resourceId?: string;
  ascoraResourceId?: string;
  status: 'success' | 'failed' | 'pending' | 'skipped';
  errorMessage?: string;
  retryCount: number;
  responseData?: any;
  createdAt: string;
}

export interface SyncResult {
  success: boolean;
  processed: number;
  failed: number;
  skipped: number;
  errors: Array<{
    resource: string;
    id?: string;
    message: string;
  }>;
  duration: number;
}

export interface ManualSyncResult {
  customers: SyncResult;
  jobs: SyncResult;
  invoices: SyncResult;
}

export interface SyncLogFilters {
  status?: 'success' | 'failed' | 'pending' | 'skipped';
  syncType?: string;
  limit?: number;
  offset?: number;
}

// ===== Main Hook =====

export function useAscoraSync(organizationId: string) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [currentFilters, setCurrentFilters] = useState<SyncLogFilters>({
    limit: 50,
    offset: 0
  });

  // ===== Fetch Sync Status =====

  const fetchSyncStatus = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        `/api/organizations/${organizationId}/ascora/sync/status`
      );

      if (response.data.success) {
        setSyncStatus(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to fetch sync status');
      }
    } catch (err: any) {
      console.error('[useAscoraSync] Status fetch failed:', err);
      setError(err.response?.data?.message || 'Failed to fetch sync status');
      setSyncStatus(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // ===== Fetch Sync Logs =====

  const fetchLogs = useCallback(
    async (filters: SyncLogFilters = {}) => {
      if (!organizationId) return;

      setLoading(true);
      setError(null);

      try {
        const params = {
          ...currentFilters,
          ...filters
        };

        const response = await axios.get(
          `/api/organizations/${organizationId}/ascora/logs`,
          { params }
        );

        if (response.data.success) {
          setLogs(response.data.data.logs);
          setTotalLogs(response.data.data.total);
          setCurrentFilters(params);
        } else {
          throw new Error(response.data.message || 'Failed to fetch logs');
        }
      } catch (err: any) {
        console.error('[useAscoraSync] Logs fetch failed:', err);
        setError(err.response?.data?.message || 'Failed to fetch logs');
        setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    [organizationId, currentFilters]
  );

  // ===== Start Sync Schedule =====

  const startSyncSchedule = useCallback(
    async (intervalSeconds: number = 300): Promise<void> => {
      setError(null);

      try {
        const response = await axios.post(
          `/api/organizations/${organizationId}/ascora/sync`,
          { intervalSeconds }
        );

        if (response.data.success) {
          await fetchSyncStatus();
        } else {
          throw new Error(response.data.message || 'Failed to start sync schedule');
        }
      } catch (err: any) {
        console.error('[useAscoraSync] Start schedule failed:', err);
        const errorMessage = err.response?.data?.message || 'Failed to start sync schedule';
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [organizationId, fetchSyncStatus]
  );

  // ===== Manual Sync =====

  const manualSync = useCallback(async (): Promise<ManualSyncResult> => {
    setSyncing(true);
    setError(null);

    try {
      const response = await axios.post(
        `/api/organizations/${organizationId}/ascora/sync/manual`
      );

      if (response.data.success) {
        await fetchSyncStatus();
        await fetchLogs();
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Manual sync failed');
      }
    } catch (err: any) {
      console.error('[useAscoraSync] Manual sync failed:', err);
      const errorMessage = err.response?.data?.message || 'Manual sync failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setSyncing(false);
    }
  }, [organizationId, fetchSyncStatus, fetchLogs]);

  // ===== Retry Failed Items =====

  const retryFailed = useCallback(async (): Promise<SyncResult> => {
    setSyncing(true);
    setError(null);

    try {
      const response = await axios.post(
        `/api/organizations/${organizationId}/ascora/sync/retry`
      );

      if (response.data.success) {
        await fetchLogs();
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Retry failed');
      }
    } catch (err: any) {
      console.error('[useAscoraSync] Retry failed:', err);
      const errorMessage = err.response?.data?.message || 'Retry failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setSyncing(false);
    }
  }, [organizationId, fetchLogs]);

  // ===== Filter Logs =====

  const filterLogs = useCallback(
    async (filters: SyncLogFilters): Promise<void> => {
      await fetchLogs(filters);
    },
    [fetchLogs]
  );

  // ===== Get Logs by Status =====

  const getLogsByStatus = useCallback(
    (status: SyncLog['status']): SyncLog[] => {
      return logs.filter(log => log.status === status);
    },
    [logs]
  );

  // ===== Get Failed Logs =====

  const getFailedLogs = useCallback((): SyncLog[] => {
    return logs.filter(log => log.status === 'failed');
  }, [logs]);

  // ===== Get Success Rate =====

  const getSuccessRate = useCallback((): number => {
    if (logs.length === 0) return 0;

    const successCount = logs.filter(log => log.status === 'success').length;
    return (successCount / logs.length) * 100;
  }, [logs]);

  // ===== Get Sync Statistics =====

  const getStatistics = useCallback((): {
    totalLogs: number;
    successCount: number;
    failedCount: number;
    pendingCount: number;
    skippedCount: number;
    successRate: number;
    recentErrors: SyncLog[];
    bySyncType: Record<string, number>;
  } => {
    let successCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    let skippedCount = 0;
    const bySyncType: Record<string, number> = {};

    logs.forEach(log => {
      switch (log.status) {
        case 'success':
          successCount++;
          break;
        case 'failed':
          failedCount++;
          break;
        case 'pending':
          pendingCount++;
          break;
        case 'skipped':
          skippedCount++;
          break;
      }

      if (log.syncType) {
        bySyncType[log.syncType] = (bySyncType[log.syncType] || 0) + 1;
      }
    });

    const recentErrors = logs
      .filter(log => log.status === 'failed')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return {
      totalLogs: logs.length,
      successCount,
      failedCount,
      pendingCount,
      skippedCount,
      successRate: getSuccessRate(),
      recentErrors,
      bySyncType
    };
  }, [logs, getSuccessRate]);

  // ===== Format Sync Type =====

  const formatSyncType = useCallback((syncType: string): string => {
    return syncType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }, []);

  // ===== Format Duration =====

  const formatDuration = useCallback((ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }, []);

  // ===== Get Time Since Last Sync =====

  const getTimeSinceLastSync = useCallback((): string | null => {
    if (!syncStatus?.lastSync) return null;

    const lastSyncDate = new Date(syncStatus.lastSync);
    const now = new Date();
    const diffMs = now.getTime() - lastSyncDate.getTime();

    if (diffMs < 60000) return 'Just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} minutes ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} hours ago`;
    return `${Math.floor(diffMs / 86400000)} days ago`;
  }, [syncStatus]);

  // ===== Check if Syncing =====

  const isSyncing = useCallback((): boolean => {
    return syncStatus?.status === 'syncing' || syncing;
  }, [syncStatus, syncing]);

  // ===== Pagination =====

  const loadMore = useCallback(async (): Promise<void> => {
    await fetchLogs({
      ...currentFilters,
      offset: (currentFilters.offset || 0) + (currentFilters.limit || 50)
    });
  }, [fetchLogs, currentFilters]);

  const hasMore = useCallback((): boolean => {
    return logs.length < totalLogs;
  }, [logs.length, totalLogs]);

  // ===== Refresh =====

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([fetchSyncStatus(), fetchLogs(currentFilters)]);
  }, [fetchSyncStatus, fetchLogs, currentFilters]);

  // ===== Clear Error =====

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ===== Auto Refresh (Poll for updates when syncing) =====

  useEffect(() => {
    if (!isSyncing()) return;

    const intervalId = setInterval(() => {
      fetchSyncStatus();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(intervalId);
  }, [isSyncing, fetchSyncStatus]);

  // ===== Initial Load =====

  useEffect(() => {
    if (organizationId) {
      fetchSyncStatus();
      fetchLogs();
    }
  }, [organizationId]); // Only run on mount/org change

  // ===== Return Hook Interface =====

  return {
    // State
    syncStatus,
    logs,
    loading,
    syncing,
    error,
    totalLogs,
    currentFilters,

    // Actions
    startSyncSchedule,
    manualSync,
    retryFailed,
    filterLogs,
    refresh,
    clearError,

    // Utilities
    getLogsByStatus,
    getFailedLogs,
    getSuccessRate,
    getStatistics,
    formatSyncType,
    formatDuration,
    getTimeSinceLastSync,
    isSyncing: isSyncing(),

    // Pagination
    loadMore,
    hasMore: hasMore()
  };
}

export default useAscoraSync;
