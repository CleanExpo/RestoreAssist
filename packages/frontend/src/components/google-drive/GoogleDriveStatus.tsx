import React, { useState } from 'react';
import { useGoogleDrive } from '../../hooks/useGoogleDrive';
import {
  CheckCircle,
  AlertCircle,
  Loader,
  RefreshCw,
  Unlink,
  Settings as SettingsIcon,
  HardDrive,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface GoogleDriveStatusProps {
  organizationId: string;
  onDisconnect?: () => void;
  onRefresh?: () => void;
}

export const GoogleDriveStatus: React.FC<GoogleDriveStatusProps> = ({
  organizationId,
  onDisconnect,
  onRefresh
}) => {
  const { status, loading, error, disconnect, getStorageQuota, refetch } = useGoogleDrive(organizationId);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Calculate quota styling and warnings
  const getQuotaStatus = (percentageUsed: number) => {
    if (percentageUsed >= 95) return { color: 'red', level: 'critical' };
    if (percentageUsed >= 80) return { color: 'yellow', level: 'warning' };
    return { color: 'green', level: 'normal' };
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatRelativeTime = (date: Date | null): string => {
    if (!date) return 'Never';

    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const handleRefreshQuota = async () => {
    try {
      setRefreshing(true);
      await getStorageQuota();
      await refetch();
      onRefresh?.();
    } catch (err) {
      console.error('Failed to refresh quota:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      await disconnect();
      setShowDisconnectConfirm(false);
      onDisconnect?.();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  // Show skeleton loader
  if (loading && !status) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
          <div className="flex-1">
            <div className="h-6 bg-gray-200 rounded w-48 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  // If not connected, don't show this component
  if (!status?.isConnected) {
    return null;
  }

  const quotaStatus = status.storageQuota
    ? getQuotaStatus(status.storageQuota.percentageUsed)
    : { color: 'gray', level: 'unknown' };

  const expiresInDays = status.expiresIn ? Math.floor(status.expiresIn / (24 * 60 * 60)) : null;
  const showExpiryWarning = expiresInDays !== null && expiresInDays < 7;

  return (
    <>
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  Google Drive Connected
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </h3>
                <p className="text-sm text-gray-600">{status.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshQuota}
                disabled={refreshing}
                className="p-2 text-gray-600 hover:bg-white hover:text-blue-600 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh storage quota"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => window.location.href = `/organizations/${organizationId}/settings/integrations`}
                className="p-2 text-gray-600 hover:bg-white hover:text-blue-600 rounded-lg transition-colors"
                title="Settings"
              >
                <SettingsIcon className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </button>
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

        {/* Expiry Warning */}
        {showExpiryWarning && (
          <div className="px-6 py-4 bg-yellow-50 border-b border-yellow-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <p className="text-sm text-yellow-800">
                  Your authorisation will expire in {expiresInDays} {expiresInDays === 1 ? 'day' : 'days'}
                </p>
              </div>
              <button
                onClick={() => window.location.href = `/api/organizations/${organizationId}/google-drive/auth`}
                className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Reconnect
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Storage Quota Section */}
          {status.storageQuota && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-gray-600" />
                  <h4 className="text-sm font-semibold text-gray-900">Storage Quota</h4>
                </div>
                <span className="text-sm text-gray-600">
                  {formatBytes(status.storageQuota.usedBytes)} of {formatBytes(status.storageQuota.quotaBytes)}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="relative w-full h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    quotaStatus.color === 'red'
                      ? 'bg-gradient-to-r from-red-500 to-red-600'
                      : quotaStatus.color === 'yellow'
                      ? 'bg-gradient-to-r from-yellow-400 to-yellow-500'
                      : 'bg-gradient-to-r from-green-500 to-green-600'
                  }`}
                  style={{ width: `${Math.min(status.storageQuota.percentageUsed, 100)}%` }}
                ></div>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={`font-medium ${
                  quotaStatus.color === 'red'
                    ? 'text-red-600'
                    : quotaStatus.color === 'yellow'
                    ? 'text-yellow-600'
                    : 'text-green-600'
                }`}>
                  {status.storageQuota.percentageUsed.toFixed(1)}% used
                </span>
                <span className="text-gray-500">
                  {formatBytes(status.storageQuota.availableBytes)} available
                </span>
              </div>

              {/* Quota Warnings */}
              {quotaStatus.level === 'critical' && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-800">
                    ⚠️ Storage critically low. Please free up space or upgrade your Google Drive plan.
                  </p>
                </div>
              )}

              {quotaStatus.level === 'warning' && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-800">
                    ⚠️ Storage running low. Consider freeing up space soon.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Sync Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-600">Last Sync</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {formatRelativeTime(status.lastSync)}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-600">Permissions</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {status.scopes?.length || 0} scopes granted
              </p>
            </div>
          </div>

          {/* Scopes List (Expandable) */}
          {status.scopes && status.scopes.length > 0 && (
            <details className="pt-4 border-t border-gray-200">
              <summary className="text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-900">
                View granted permissions
              </summary>
              <ul className="mt-2 space-y-1">
                {status.scopes.map((scope, index) => (
                  <li key={index} className="text-xs text-gray-600 flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">✓</span>
                    <span>{scope.replace('https://www.googleapis.com/auth/', '')}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
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
                <h3 className="text-lg font-semibold text-gray-900">Disconnect Google Drive?</h3>
                <p className="text-sm text-gray-600">This action will revoke access</p>
              </div>
            </div>

            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700">
                RestoreAssist will no longer have access to your Google Drive. Your files will remain in Google Drive, but:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-red-600 mt-0.5">•</span>
                  <span>Automated backups will stop</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-600 mt-0.5">•</span>
                  <span>You won't be able to upload new files</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-600 mt-0.5">•</span>
                  <span>Scheduled syncs will be cancelled</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                disabled={disconnecting}
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
                    <Unlink className="w-4 h-4" />
                    Disconnect
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
