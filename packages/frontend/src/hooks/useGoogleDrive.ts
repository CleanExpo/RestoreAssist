import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ============================================================================
// Types
// ============================================================================

interface GoogleDriveStatus {
  isConnected: boolean;
  email: string | null;
  storageQuota: {
    quotaBytes: number;
    usedBytes: number;
    availableBytes: number;
    percentageUsed: number;
  } | null;
  expiresIn: number | null;
  lastSync: Date | null;
  scopes: string[];
}

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  webViewLink: string;
  webContentLink?: string;
  owners?: { displayName: string; emailAddress: string }[];
}

interface GoogleDriveFileListResult {
  files: GoogleDriveFile[];
  nextPageToken: string | null;
  total: number;
}

interface BackupJob {
  syncJobId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  processed: number;
  total: number;
  failed: number;
  progress: number;
  elapsedTime: number;
  estimatedTimeRemaining: number;
  startedAt: Date;
  completedAt?: Date;
}

interface BackupStatistics {
  totalBackups: number;
  totalSize: number;
  lastBackup: Date | null;
  averageBackupSize: number;
  backupFrequency: string;
  successRate: number;
  lastWeekBackups: number;
  lastMonthBackups: number;
}

interface BackupSchedule {
  scheduleId: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  nextRun: Date;
  lastRun?: Date;
  isActive: boolean;
}

// ============================================================================
// Hook 1: useGoogleDrive - Manage connection and integration
// ============================================================================

export function useGoogleDrive(organizationId: string) {
  const [status, setStatus] = useState<GoogleDriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get connection status
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(
        `/api/organizations/${organizationId}/google-drive/status`
      );

      setStatus(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to get Google Drive status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // Connect to Google Drive
  const connect = useCallback(async () => {
    try {
      setError(null);

      const response = await axios.get(
        `/api/organizations/${organizationId}/google-drive/auth`
      );

      if (response.data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = response.data.authUrl;
      } else {
        throw new Error('No authorisation URL received');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initiate connection');
      throw err;
    }
  }, [organizationId]);

  // Disconnect from Google Drive
  const disconnect = useCallback(async () => {
    try {
      setError(null);

      await axios.post(
        `/api/organizations/${organizationId}/google-drive/disconnect`
      );

      // Refresh status
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to disconnect');
      throw err;
    }
  }, [organizationId, fetchStatus]);

  // Get storage quota
  const getStorageQuota = useCallback(async () => {
    try {
      setError(null);

      const response = await axios.get(
        `/api/organizations/${organizationId}/google-drive/status`
      );

      return response.data.storageQuota;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to get storage quota');
      throw err;
    }
  }, [organizationId]);

  // Refresh status on mount
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    connect,
    disconnect,
    getStorageQuota,
    refetch: fetchStatus,
  };
}

// ============================================================================
// Hook 2: useGoogleDriveFiles - Manage files and folders
// ============================================================================

export function useGoogleDriveFiles(organizationId: string, folderId?: string) {
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // List files
  const fetchFiles = useCallback(async (pageToken?: string) => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {
        limit: 50,
      };

      if (folderId) {
        params.folderId = folderId;
      }

      if (pageToken) {
        params.pageToken = pageToken;
      }

      const response = await axios.get(
        `/api/organizations/${organizationId}/google-drive/files`,
        { params }
      );

      setFiles(response.data.files || []);
      setNextPageToken(response.data.nextPageToken || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to list files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, folderId]);

  // Upload file
  const uploadFile = useCallback(async (
    filePath: string,
    fileName: string,
    targetFolderId?: string
  ) => {
    try {
      setUploading(true);
      setError(null);

      const response = await axios.post(
        `/api/organizations/${organizationId}/google-drive/upload`,
        {
          filePath,
          fileName,
          folderId: targetFolderId || folderId,
        }
      );

      // Refresh file list
      await fetchFiles();

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload file');
      throw err;
    } finally {
      setUploading(false);
    }
  }, [organizationId, folderId, fetchFiles]);

  // Download file
  const downloadFile = useCallback(async (fileId: string, savePath?: string) => {
    try {
      setError(null);

      const params = savePath ? { savePath } : {};

      const response = await axios.get(
        `/api/organizations/${organizationId}/google-drive/download/${fileId}`,
        {
          params,
          responseType: savePath ? 'json' : 'blob',
        }
      );

      if (!savePath) {
        // Create download link for blob
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `file-${fileId}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download file');
      throw err;
    }
  }, [organizationId]);

  // Delete file
  const deleteFile = useCallback(async (fileId: string) => {
    try {
      setError(null);

      await axios.delete(
        `/api/organizations/${organizationId}/google-drive/files/${fileId}`
      );

      // Refresh file list
      await fetchFiles();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete file');
      throw err;
    }
  }, [organizationId, fetchFiles]);

  // Share file
  const shareFile = useCallback(async (
    fileId: string,
    email: string,
    role: 'reader' | 'commenter' | 'writer' = 'reader'
  ) => {
    try {
      setError(null);

      const response = await axios.post(
        `/api/organizations/${organizationId}/google-drive/share`,
        {
          fileId,
          email,
          role,
        }
      );

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to share file');
      throw err;
    }
  }, [organizationId]);

  // Create folder
  const createFolder = useCallback(async (
    name: string,
    parentFolderId?: string
  ) => {
    try {
      setError(null);

      const response = await axios.post(
        `/api/organizations/${organizationId}/google-drive/folders`,
        {
          name,
          parentFolderId: parentFolderId || folderId,
        }
      );

      // Refresh file list
      await fetchFiles();

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create folder');
      throw err;
    }
  }, [organizationId, folderId, fetchFiles]);

  // Fetch files on mount and when folderId changes
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return {
    files,
    loading,
    error,
    uploading,
    nextPageToken,
    uploadFile,
    downloadFile,
    deleteFile,
    shareFile,
    createFolder,
    refetch: fetchFiles,
    loadMore: () => nextPageToken && fetchFiles(nextPageToken),
  };
}

// ============================================================================
// Hook 3: useBackup - Manage report backups
// ============================================================================

export function useBackup(organizationId: string) {
  const [job, setJob] = useState<BackupJob | null>(null);
  const [statistics, setStatistics] = useState<BackupStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Backup single report
  const backupReport = useCallback(async (reportId: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(
        `/api/organizations/${organizationId}/google-drive/backup/report/${reportId}`
      );

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to backup report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // Backup all reports
  const backupAllReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(
        `/api/organizations/${organizationId}/google-drive/backup/all`
      );

      setJob({
        syncJobId: response.data.syncJobId,
        status: 'running',
        processed: 0,
        total: response.data.totalReports,
        failed: 0,
        progress: 0,
        elapsedTime: 0,
        estimatedTimeRemaining: response.data.estimatedTime,
        startedAt: new Date(response.data.startTime),
      });

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to start backup');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // Track sync progress
  const trackProgress = useCallback(async (syncJobId: string) => {
    try {
      setError(null);

      const response = await axios.get(
        `/api/organizations/${organizationId}/google-drive/backup/status/${syncJobId}`
      );

      setJob(response.data);

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to get backup status');
      throw err;
    }
  }, [organizationId]);

  // Cancel sync
  const cancelSync = useCallback(async (syncJobId: string) => {
    try {
      setError(null);

      const response = await axios.post(
        `/api/organizations/${organizationId}/google-drive/backup/cancel/${syncJobId}`
      );

      setJob(null);

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to cancel backup');
      throw err;
    }
  }, [organizationId]);

  // Get backup history (logs)
  const getHistory = useCallback(async (
    limit: number = 50,
    offset: number = 0,
    status?: 'success' | 'failed'
  ) => {
    try {
      setError(null);

      const params: any = { limit, offset };
      if (status) {
        params.status = status;
      }

      const response = await axios.get(
        `/api/organizations/${organizationId}/google-drive/backup/logs`,
        { params }
      );

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to get backup history');
      throw err;
    }
  }, [organizationId]);

  // Get statistics
  const fetchStatistics = useCallback(async () => {
    try {
      setError(null);

      const response = await axios.get(
        `/api/organizations/${organizationId}/google-drive/backup/statistics`
      );

      setStatistics(response.data);

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to get backup statistics');
      throw err;
    }
  }, [organizationId]);

  // Fetch statistics on mount
  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  return {
    job,
    statistics,
    loading,
    error,
    backupReport,
    backupAllReports,
    trackProgress,
    cancelSync,
    getHistory,
    refetchStatistics: fetchStatistics,
  };
}

// ============================================================================
// Hook 4: useBackupSchedule - Manage backup schedules
// ============================================================================

export function useBackupSchedule(organizationId: string) {
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get current schedule
  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Add endpoint to get existing schedule
      // For now, return null if no schedule exists
      setSchedule(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to get schedule');
      setSchedule(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // Create schedule
  const createSchedule = useCallback(async (
    frequency: 'daily' | 'weekly' | 'monthly'
  ) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(
        `/api/organizations/${organizationId}/google-drive/backup/schedule`,
        { frequency }
      );

      setSchedule({
        scheduleId: response.data.scheduleId,
        frequency: response.data.frequency,
        nextRun: new Date(response.data.nextRun),
        isActive: true,
      });

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create schedule');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // Update schedule
  const updateSchedule = useCallback(async (
    scheduleId: string,
    updates: Partial<BackupSchedule>
  ) => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Add endpoint to update schedule
      // For now, just update local state
      setSchedule((prev) => (prev ? { ...prev, ...updates } : null));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update schedule');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete schedule
  const deleteSchedule = useCallback(async (scheduleId: string) => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Add endpoint to delete schedule
      setSchedule(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete schedule');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Manually trigger schedule
  const triggerNow = useCallback(async () => {
    try {
      setError(null);

      // Trigger a manual backup
      const response = await axios.post(
        `/api/organizations/${organizationId}/google-drive/backup/all`
      );

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to trigger backup');
      throw err;
    }
  }, [organizationId]);

  // Fetch schedule on mount
  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  return {
    schedule,
    loading,
    error,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    triggerNow,
    refetch: fetchSchedule,
  };
}
