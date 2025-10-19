/**
 * useAscora Hook
 * Connection and status management for Ascora CRM integration
 *
 * Features:
 * - Connect/disconnect from Ascora
 * - Get integration status
 * - Sync statistics
 * - Error handling
 *
 * @module useAscora
 */

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

// ===== Type Definitions =====

export interface AscoraStatus {
  connected: boolean;
  apiUrl?: string;
  companyCode?: string;
  lastSync?: Date | string;
  syncStatus?: 'idle' | 'syncing' | 'success' | 'error';
  syncSettings?: {
    syncCustomers: boolean;
    syncJobs: boolean;
    syncInvoices: boolean;
  };
  statistics?: {
    totalCustomers: number;
    totalJobs: number;
    totalInvoices: number;
  };
}

export interface AscoraConnectionData {
  userId: string;
  apiUrl: string;
  apiToken: string;
  companyCode: string;
}

export interface AscoraIntegrationResponse {
  integrationId: string;
  apiUrl: string;
  companyCode: string;
  isActive: boolean;
  webhookToken: string;
  syncSettings: {
    syncCustomers: boolean;
    syncJobs: boolean;
    syncInvoices: boolean;
  };
  createdAt: string;
}

// ===== Main Hook =====

export function useAscora(organizationId: string) {
  const [status, setStatus] = useState<AscoraStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ===== Fetch Status =====

  const fetchStatus = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(
        `/api/organizations/${organizationId}/ascora/status`
      );

      if (response.data.success) {
        setStatus(response.data.data);
      } else {
        setStatus({ connected: false });
      }
    } catch (err: any) {
      console.error('[useAscora] Status fetch failed:', err);

      if (err.response?.status === 404) {
        setStatus({ connected: false });
      } else {
        setError(err.response?.data?.message || 'Failed to fetch status');
        setStatus(null);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // ===== Connect to Ascora =====

  const connect = useCallback(
    async (connectionData: AscoraConnectionData): Promise<AscoraIntegrationResponse> => {
      setConnecting(true);
      setError(null);

      try {
        const response = await axios.post(
          `/api/organizations/${organizationId}/ascora/connect`,
          connectionData
        );

        if (response.data.success) {
          // Refresh status after successful connection
          await fetchStatus();
          return response.data.data;
        } else {
          throw new Error(response.data.message || 'Connection failed');
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to connect to Ascora';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setConnecting(false);
      }
    },
    [organizationId, fetchStatus]
  );

  // ===== Disconnect from Ascora =====

  const disconnect = useCallback(async (): Promise<void> => {
    setDisconnecting(true);
    setError(null);

    try {
      const response = await axios.post(
        `/api/organizations/${organizationId}/ascora/disconnect`
      );

      if (response.data.success) {
        setStatus({ connected: false });
      } else {
        throw new Error(response.data.message || 'Disconnection failed');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to disconnect';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setDisconnecting(false);
    }
  }, [organizationId]);

  // ===== Test Connection =====

  const testConnection = useCallback(
    async (connectionData: Omit<AscoraConnectionData, 'userId'>): Promise<boolean> => {
      try {
        // This would call a test endpoint
        // For now, we'll validate the inputs
        if (!connectionData.apiUrl || !connectionData.apiToken || !connectionData.companyCode) {
          throw new Error('All connection fields are required');
        }

        // Test URL format
        try {
          new URL(connectionData.apiUrl);
        } catch {
          throw new Error('Invalid API URL format');
        }

        return true;
      } catch (err: any) {
        setError(err.message);
        return false;
      }
    },
    []
  );

  // ===== Get Sync Statistics =====

  const getStatistics = useCallback((): {
    totalCustomers: number;
    totalJobs: number;
    totalInvoices: number;
  } | null => {
    return status?.statistics || null;
  }, [status]);

  // ===== Update Sync Settings =====

  const updateSyncSettings = useCallback(
    async (settings: {
      syncCustomers?: boolean;
      syncJobs?: boolean;
      syncInvoices?: boolean;
    }): Promise<void> => {
      try {
        // This would call an update endpoint
        // For now, update local state
        if (status) {
          setStatus({
            ...status,
            syncSettings: {
              ...status.syncSettings!,
              ...settings
            }
          });
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || 'Failed to update settings';
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [status]
  );

  // ===== Refresh Status =====

  const refresh = useCallback(async (): Promise<void> => {
    await fetchStatus();
  }, [fetchStatus]);

  // ===== Clear Error =====

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ===== Initial Load =====

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ===== Return Hook Interface =====

  return {
    // State
    status,
    loading,
    connecting,
    disconnecting,
    error,

    // Actions
    connect,
    disconnect,
    testConnection,
    updateSyncSettings,
    refresh,
    clearError,

    // Utilities
    getStatistics,
    isConnected: status?.connected || false,
    isSyncing: status?.syncStatus === 'syncing',
    hasError: !!error || status?.syncStatus === 'error'
  };
}

export default useAscora;
