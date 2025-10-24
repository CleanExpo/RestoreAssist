/**
 * AscoraStatus Component
 * Display Ascora connection status and statistics dashboard
 *
 * Features:
 * - Connection status badge
 * - Sync statistics
 * - Last sync time display
 * - Job/customer/invoice counts
 * - Disconnect button
 * - Refresh functionality
 *
 * @module AscoraStatus
 */

import React, { useState } from 'react';
import { useAscora } from '../../hooks/useAscora';
import {
  CheckCircle,
  XCircle,
  Cloud,
  Users,
  Briefcase,
  FileText,
  RefreshCw,
  Settings,
  LogOut,
  AlertTriangle,
  Clock,
  TrendingUp,
  Activity,
  Loader
} from 'lucide-react';

interface AscoraStatusProps {
  organizationId: string;
  onDisconnect?: () => void;
  onRefresh?: () => void;
  onConfigure?: () => void;
}

export const AscoraStatus: React.FC<AscoraStatusProps> = ({
  organizationId,
  onDisconnect,
  onRefresh,
  onConfigure
}) => {
  const { status, loading, disconnect, refresh, disconnecting, getStatistics } = useAscora(organizationId);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Get statistics
  const stats = getStatistics();

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    try {
      await disconnect();
      setShowDisconnectConfirm(false);
      onDisconnect?.();
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  };

  // Format date
  const formatLastSync = (date?: Date | string): string => {
    if (!date) return 'Never';

    const syncDate = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - syncDate.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-12">
        <div className="flex flex-col items-center justify-center">
          <Loader className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-gray-600">Loading Ascora status...</p>
        </div>
      </div>
    );
  }

  // Not connected state
  if (!status?.connected) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Cloud className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Not Connected</h3>
          <p className="text-gray-600 mb-4">
            Connect to Ascora CRM to sync customers, jobs, and invoices
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Status Card */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Ascora CRM Connected</h3>
                <p className="text-sm text-gray-600">{status.apiUrl}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-gray-600 hover:bg-white rounded-lg transition-colors disabled:opacity-50"
                title="Refresh status"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              {onConfigure && (
                <button
                  onClick={onConfigure}
                  className="p-2 text-gray-600 hover:bg-white rounded-lg transition-colors"
                  title="Configure settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}

              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </div>
        </div>

        {/* Company Info */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Company Code</p>
              <p className="text-lg font-semibold text-gray-900">{status.companyCode}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Sync Status</p>
              <div className="flex items-center gap-2 justify-end mt-1">
                {status.syncStatus === 'syncing' ? (
                  <>
                    <Activity className="w-4 h-4 text-blue-600 animate-pulse" />
                    <span className="text-sm font-medium text-blue-600">Syncing...</span>
                  </>
                ) : status.syncStatus === 'success' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Up to date</span>
                  </>
                ) : status.syncStatus === 'error' ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-red-600">Error</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-600">Idle</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Last Sync Info */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Last Sync</p>
                <p className="text-sm font-medium text-gray-900">
                  {formatLastSync(status.lastSync)}
                </p>
              </div>
            </div>

            {status.lastSync && (
              <div className="text-right">
                <p className="text-xs text-gray-500">
                  {new Date(status.lastSync).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="p-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Integration Statistics</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Customers */}
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-6 h-6 text-blue-600" />
                <span className="text-xs font-medium text-blue-600 bg-blue-200 px-2 py-0.5 rounded-full">
                  Customers
                </span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats?.totalCustomers.toLocaleString() || 0}
              </p>
              <p className="text-xs text-gray-600 mt-1">Synced customers</p>
            </div>

            {/* Jobs */}
            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <Briefcase className="w-6 h-6 text-green-600" />
                <span className="text-xs font-medium text-green-600 bg-green-200 px-2 py-0.5 rounded-full">
                  Jobs
                </span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats?.totalJobs.toLocaleString() || 0}
              </p>
              <p className="text-xs text-gray-600 mt-1">Active jobs</p>
            </div>

            {/* Invoices */}
            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <FileText className="w-6 h-6 text-purple-600" />
                <span className="text-xs font-medium text-purple-600 bg-purple-200 px-2 py-0.5 rounded-full">
                  Invoices
                </span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats?.totalInvoices.toLocaleString() || 0}
              </p>
              <p className="text-xs text-gray-600 mt-1">Tracked invoices</p>
            </div>
          </div>
        </div>

        {/* Sync Settings */}
        {status.syncSettings && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Sync Settings</h4>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status.syncSettings.syncCustomers ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span className="text-sm text-gray-700">Customers</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status.syncSettings.syncJobs ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span className="text-sm text-gray-700">Jobs</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status.syncSettings.syncInvoices ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span className="text-sm text-gray-700">Invoices</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Disconnect Ascora?</h3>
                <p className="text-sm text-gray-600">This action cannot be undone</p>
              </div>
            </div>

            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Warning:</strong> Disconnecting will stop all automatic syncing. Your existing
                data will be preserved, but you'll need to reconnect to sync again.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                disabled={disconnecting}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {disconnecting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    Disconnect
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AscoraStatus;
