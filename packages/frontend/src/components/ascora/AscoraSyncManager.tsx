import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAscoraSync } from '../../hooks/useAscoraSync';
import { AscoraSync Log } from '../../types/ascora';

export interface AscoraSync ManagerProps {
  organizationId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

type SyncStatus = 'success' | 'error' | 'in_progress' | 'pending';
type ResourceType = 'customer' | 'job' | 'invoice' | 'all';
type SortField = 'timestamp' | 'resourceType' | 'status' | 'duration';
type SortOrder = 'asc' | 'desc';

export const AscoraSync Manager: React.FC<AscoraSync ManagerProps> = ({
  organizationId,
  autoRefresh = true,
  refreshInterval = 30000
}) => {
  const {
    logs,
    loading,
    syncing,
    error,
    total,
    syncAll,
    syncCustomers,
    syncJobs,
    syncInvoices,
    retryFailed,
    getLogsByStatus,
    getLogsByResourceType,
    getStatistics,
    loadMore,
    hasMore,
    clearError
  } = useAscoraSync(organizationId);

  const [statusFilter, setStatusFilter] = useState<SyncStatus | 'all'>('all');
  const [resourceFilter, setResourceFilter] = useState<ResourceType>('all');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AscoraSync Log | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const itemsPerPage = 20;

  // Get statistics
  const stats = useMemo(() => getStatistics(), [getStatistics]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || syncing) return;

    const interval = setInterval(() => {
      // Silent refresh - don't show loading state
      loadMore();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, syncing, loadMore]);

  // Filter and sort logs
  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(log => log.status === statusFilter);
    }

    // Apply resource type filter
    if (resourceFilter !== 'all') {
      result = result.filter(log => log.resourceType === resourceFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'timestamp':
          aValue = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          bValue = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          break;
        case 'resourceType':
          aValue = a.resourceType?.toLowerCase() || '';
          bValue = b.resourceType?.toLowerCase() || '';
          break;
        case 'status':
          aValue = a.status?.toLowerCase() || '';
          bValue = b.status?.toLowerCase() || '';
          break;
        case 'duration':
          aValue = a.duration || 0;
          bValue = b.duration || 0;
          break;
        default:
          aValue = '';
          bValue = '';
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [logs, statusFilter, resourceFilter, sortField, sortOrder]);

  // Paginate logs
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  // Get status color
  const getStatusColor = useCallback((status: string) => {
    switch (status?.toLowerCase()) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }, []);

  // Get resource type icon
  const getResourceIcon = useCallback((type: string) => {
    switch (type?.toLowerCase()) {
      case 'customer':
        return '👤';
      case 'job':
        return '📋';
      case 'invoice':
        return '💰';
      default:
        return '📦';
    }
  }, []);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Handle sync action
  const handleSync = async (type: 'all' | 'customers' | 'jobs' | 'invoices') => {
    try {
      switch (type) {
        case 'all':
          await syncAll();
          break;
        case 'customers':
          await syncCustomers();
          break;
        case 'jobs':
          await syncJobs();
          break;
        case 'invoices':
          await syncInvoices();
          break;
      }
    } catch (err) {
      console.error(`Error syncing ${type}:`, err);
    }
  };

  // Handle retry failed
  const handleRetryFailed = async () => {
    try {
      await retryFailed();
    } catch (err) {
      console.error('Error retrying failed syncs:', err);
    }
  };

  // Show log details
  const showLogDetails = (log: AscoraSync Log) => {
    setSelectedLog(log);
    setShowDetailsModal(true);
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Format duration
  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  // Load more on scroll
  useEffect(() => {
    if (currentPage === totalPages && hasMore && !loading) {
      loadMore();
    }
  }, [currentPage, totalPages, hasMore, loading, loadMore]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sync Manager</h2>
          <p className="text-sm text-gray-600 mt-1">
            Monitor and manage synchronization operations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSync('all')}
            disabled={syncing || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {syncing ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Syncing...
              </>
            ) : (
              'Sync All'
            )}
          </button>
        </div>
      </div>

      {/* Statistics Dashboard */}
      {stats && (
        <div className="grid grid-cols-5 gap-3 p-4 bg-gray-50 rounded-lg">
          <div>
            <div className="text-sm text-gray-600">Total Syncs</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Successful</div>
            <div className="text-2xl font-bold text-green-600">{stats.successful}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Failed</div>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">In Progress</div>
            <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Success Rate</div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.total > 0 ? `${((stats.successful / stats.total) * 100).toFixed(1)}%` : 'N/A'}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start justify-between">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <div className="font-medium text-red-900">Error</div>
              <div className="text-sm text-red-700 mt-1">{error}</div>
            </div>
          </div>
          <button onClick={clearError} className="text-red-600 hover:text-red-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg">
        <div className="text-sm font-medium text-gray-700">Quick Actions:</div>
        <button
          onClick={() => handleSync('customers')}
          disabled={syncing}
          className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
        >
          Sync Customers
        </button>
        <button
          onClick={() => handleSync('jobs')}
          disabled={syncing}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          Sync Jobs
        </button>
        <button
          onClick={() => handleSync('invoices')}
          disabled={syncing}
          className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded-md hover:bg-teal-700 disabled:opacity-50"
        >
          Sync Invoices
        </button>
        {stats && stats.failed > 0 && (
          <button
            onClick={handleRetryFailed}
            disabled={syncing}
            className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700 disabled:opacity-50 ml-auto"
          >
            Retry Failed ({stats.failed})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as SyncStatus | 'all');
            setCurrentPage(1);
          }}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="in_progress">In Progress</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={resourceFilter}
          onChange={(e) => {
            setResourceFilter(e.target.value as ResourceType);
            setCurrentPage(1);
          }}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Resources</option>
          <option value="customer">Customers</option>
          <option value="job">Jobs</option>
          <option value="invoice">Invoices</option>
        </select>
        <div className="ml-auto text-sm text-gray-600">
          {autoRefresh && (
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Auto-refreshing every {refreshInterval / 1000}s
            </span>
          )}
        </div>
      </div>

      {/* Sync Logs Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('timestamp')}
                >
                  <div className="flex items-center gap-1">
                    Timestamp
                    {sortField === 'timestamp' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('resourceType')}
                >
                  <div className="flex items-center gap-1">
                    Resource
                    {sortField === 'resourceType' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Operation
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortField === 'status' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('duration')}
                >
                  <div className="flex items-center gap-1">
                    Duration
                    {sortField === 'duration' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      Loading sync logs...
                    </div>
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No sync logs found
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span>{getResourceIcon(log.resourceType)}</span>
                        <span className="font-medium text-gray-900">
                          {log.resourceType.charAt(0).toUpperCase() + log.resourceType.slice(1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {log.operation || 'Sync'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {log.itemsProcessed || 0} / {log.totalItems || 0}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(log.status)}`}>
                        {log.status.charAt(0).toUpperCase() + log.status.slice(1).replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDuration(log.duration)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      <button
                        onClick={() => showLogDetails(log)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} logs
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log Details Modal */}
      {showDetailsModal && selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Sync Log Details</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Timestamp</div>
                  <div className="text-sm font-medium text-gray-900">{formatDate(selectedLog.timestamp)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Resource Type</div>
                  <div className="text-sm font-medium text-gray-900">
                    {getResourceIcon(selectedLog.resourceType)} {selectedLog.resourceType.charAt(0).toUpperCase() + selectedLog.resourceType.slice(1)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Operation</div>
                  <div className="text-sm font-medium text-gray-900">{selectedLog.operation || 'Sync'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Status</div>
                  <div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedLog.status)}`}>
                      {selectedLog.status.charAt(0).toUpperCase() + selectedLog.status.slice(1).replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Items Processed</div>
                  <div className="text-sm font-medium text-gray-900">
                    {selectedLog.itemsProcessed || 0} / {selectedLog.totalItems || 0}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Duration</div>
                  <div className="text-sm font-medium text-gray-900">{formatDuration(selectedLog.duration)}</div>
                </div>
              </div>

              {selectedLog.errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="text-sm font-medium text-red-900 mb-1">Error Message</div>
                  <div className="text-sm text-red-700">{selectedLog.errorMessage}</div>
                </div>
              )}

              {selectedLog.details && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <div className="text-sm font-medium text-gray-900 mb-2">Additional Details</div>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto">
                    {typeof selectedLog.details === 'string'
                      ? selectedLog.details
                      : JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedLog(null);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
