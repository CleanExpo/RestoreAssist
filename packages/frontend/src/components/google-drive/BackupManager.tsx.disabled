import React, { useState, useEffect, useCallback } from 'react';
import { useBackup } from '../../hooks/useGoogleDrive';
import {
  Upload,
  Cloud,
  Loader,
  CheckCircle,
  AlertCircle,
  X,
  Download,
  Clock,
  TrendingUp,
  Activity,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronUp,
  Pause,
  Play
} from 'lucide-react';

interface BackupManagerProps {
  organizationId: string;
  reportIds?: string[]; // Optional: specific reports to backup
  onBackupComplete?: (jobId: string, processedCount: number) => void;
  onBackupError?: (error: string) => void;
  showHistory?: boolean;
  showStatistics?: boolean;
}

interface BackupHistoryItem {
  id: string;
  timestamp: Date;
  reportCount: number;
  totalSize: number;
  status: 'success' | 'failed' | 'partial';
  duration: number;
  errorMessage?: string;
}

export const BackupManager: React.FC<BackupManagerProps> = ({
  organizationId,
  reportIds,
  onBackupComplete,
  onBackupError,
  showHistory = true,
  showStatistics = true
}) => {
  const {
    job,
    statistics,
    loading,
    error,
    backupReport,
    backupAllReports,
    trackProgress,
    cancelSync,
    getHistory
  } = useBackup(organizationId);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'7days' | '30days' | 'all'>('30days');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Format duration
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // Format date
  const formatDate = (date: Date | string): string => {
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate ETA
  const calculateETA = (processed: number, total: number, elapsedMs: number): string => {
    if (processed === 0) return 'Calculating...';
    const avgTimePerReport = elapsedMs / processed;
    const remaining = total - processed;
    const etaMs = avgTimePerReport * remaining;
    return formatDuration(etaMs);
  };

  // Load backup history
  const loadHistory = useCallback(async () => {
    try {
      const logs = await getHistory();
      setHistory(logs || []);
    } catch (err) {
      console.error('Failed to load backup history:', err);
    }
  }, [getHistory]);

  // Start backup all reports
  const handleBackupAll = async () => {
    try {
      setIsBackingUp(true);
      const result = await backupAllReports();
      setCurrentJobId(result.syncJobId);

      // Start tracking progress
      if (result.syncJobId) {
        await trackBackupProgress(result.syncJobId);
      }
    } catch (err: any) {
      console.error('Backup failed:', err);
      onBackupError?.(err.message || 'Backup failed');
      setIsBackingUp(false);
    }
  };

  // Start backup selected reports
  const handleBackupSelected = async () => {
    if (!reportIds || reportIds.length === 0) return;

    try {
      setIsBackingUp(true);
      // Backup each report individually
      for (const reportId of reportIds) {
        await backupReport(reportId);
      }
      setIsBackingUp(false);
      await loadHistory();
    } catch (err: any) {
      console.error('Backup failed:', err);
      onBackupError?.(err.message || 'Backup failed');
      setIsBackingUp(false);
    }
  };

  // Track backup progress
  const trackBackupProgress = async (jobId: string) => {
    const startTime = Date.now();
    const pollInterval = setInterval(async () => {
      try {
        const progress = await trackProgress(jobId);

        if (progress.status === 'completed' || progress.status === 'failed') {
          clearInterval(pollInterval);
          setIsBackingUp(false);
          setCurrentJobId(null);
          await loadHistory();

          if (progress.status === 'completed') {
            onBackupComplete?.(jobId, progress.processed);
          } else {
            onBackupError?.(progress.error || 'Backup failed');
          }
        }
      } catch (err) {
        console.error('Progress tracking error:', err);
        clearInterval(pollInterval);
        setIsBackingUp(false);
        setCurrentJobId(null);
      }
    }, 2000); // Poll every 2 seconds
  };

  // Cancel backup
  const handleCancelBackup = async () => {
    if (!currentJobId) return;

    try {
      await cancelSync(currentJobId);
      setIsBackingUp(false);
      setCurrentJobId(null);
      await loadHistory();
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  // Filter history
  const filteredHistory = history.filter(item => {
    // Date filter
    const now = new Date();
    const itemDate = new Date(item.timestamp);
    const daysDiff = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));

    if (dateFilter === '7days' && daysDiff > 7) return false;
    if (dateFilter === '30days' && daysDiff > 30) return false;

    // Status filter
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;

    return true;
  });

  // Load initial data
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Backup Manager</h3>
              <p className="text-sm text-gray-600">Sync reports to Google Drive</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {reportIds && reportIds.length > 0 ? (
              <button
                onClick={handleBackupSelected}
                disabled={isBackingUp}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Backup Selected ({reportIds.length})
              </button>
            ) : (
              <button
                onClick={handleBackupAll}
                disabled={isBackingUp}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isBackingUp ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Backing Up...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Backup All Reports
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Live Progress Tracker */}
        {isBackingUp && job && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600 animate-pulse" />
                <h4 className="text-sm font-semibold text-gray-900">Backup In Progress</h4>
              </div>
              <button
                onClick={handleCancelBackup}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-700 font-medium">
                  {job.processed} of {job.total} reports
                </span>
                <span className="text-gray-600">{job.progress}%</span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300"
                  style={{ width: `${job.progress}%` }}
                ></div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Elapsed:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {formatDuration(Date.now() - new Date(job.startTime).getTime())}
                </span>
              </div>
              <div>
                <span className="text-gray-600">ETA:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {calculateETA(
                    job.processed,
                    job.total,
                    Date.now() - new Date(job.startTime).getTime()
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        {showStatistics && statistics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                <span className="text-xs font-medium text-blue-600 bg-blue-200 px-2 py-0.5 rounded-full">
                  Total
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{statistics.totalBackups}</p>
              <p className="text-xs text-gray-600 mt-1">Total Backups</p>
            </div>

            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <Cloud className="w-5 h-5 text-green-600" />
                <span className="text-xs font-medium text-green-600 bg-green-200 px-2 py-0.5 rounded-full">
                  Storage
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatBytes(statistics.totalSize)}</p>
              <p className="text-xs text-gray-600 mt-1">Total Size</p>
            </div>

            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-5 h-5 text-purple-600" />
                <span className="text-xs font-medium text-purple-600 bg-purple-200 px-2 py-0.5 rounded-full">
                  Recent
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {statistics.lastBackup
                  ? new Date(statistics.lastBackup).toLocaleDateString()
                  : 'Never'}
              </p>
              <p className="text-xs text-gray-600 mt-1">Last Backup</p>
            </div>

            <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg border border-yellow-200">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-5 h-5 text-yellow-600" />
                <span className="text-xs font-medium text-yellow-600 bg-yellow-200 px-2 py-0.5 rounded-full">
                  Rate
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {statistics.successRate ? `${statistics.successRate.toFixed(1)}%` : 'N/A'}
              </p>
              <p className="text-xs text-gray-600 mt-1">Success Rate</p>
            </div>
          </div>
        )}

        {/* Backup History */}
        {showHistory && (
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Backup History
              </h4>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as any)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="7days">Last 7 days</option>
                  <option value="30days">Last 30 days</option>
                  <option value="all">All time</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All statuses</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>

            {/* History Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-12">
                <Cloud className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No backup history found</p>
                <p className="text-sm text-gray-500 mt-1">Start your first backup to see it here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredHistory.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                    >
                      {/* Status Icon */}
                      <div className="flex items-center gap-3 flex-1">
                        {item.status === 'success' ? (
                          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                        ) : item.status === 'failed' ? (
                          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              {formatDate(item.timestamp)}
                            </p>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                item.status === 'success'
                                  ? 'bg-green-100 text-green-800'
                                  : item.status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            {item.reportCount} reports • {formatBytes(item.totalSize)} • {formatDuration(item.duration)}
                          </p>
                        </div>

                        {/* Expand Icon */}
                        <button className="p-1 text-gray-400 hover:text-gray-600">
                          {expandedHistoryId === item.id ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedHistoryId === item.id && (
                      <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200">
                        <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                          <div>
                            <span className="text-gray-600">Reports:</span>
                            <span className="ml-2 font-medium text-gray-900">{item.reportCount}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Size:</span>
                            <span className="ml-2 font-medium text-gray-900">{formatBytes(item.totalSize)}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Duration:</span>
                            <span className="ml-2 font-medium text-gray-900">{formatDuration(item.duration)}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Status:</span>
                            <span
                              className={`ml-2 font-medium ${
                                item.status === 'success'
                                  ? 'text-green-600'
                                  : item.status === 'failed'
                                  ? 'text-red-600'
                                  : 'text-yellow-600'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                        </div>

                        {item.errorMessage && (
                          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                            <p className="text-xs text-red-800">{item.errorMessage}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
