/**
 * AscoraConnect Component
 * Connection wizard for Ascora CRM integration
 *
 * Features:
 * - API URL, token, and company code inputs
 * - Connection testing
 * - Loading states
 * - Error handling
 * - Success notification
 *
 * @module AscoraConnect
 */

import React, { useState } from 'react';
import { useAscora } from '../../hooks/useAscora';
import {
  Cloud,
  CheckCircle,
  AlertCircle,
  Loader,
  Link as LinkIcon,
  Shield,
  Database,
  Zap
} from 'lucide-react';

interface AscoraConnectProps {
  organizationId: string;
  userId: string;
  onConnected?: () => void;
  onError?: (error: string) => void;
}

export const AscoraConnect: React.FC<AscoraConnectProps> = ({
  organizationId,
  userId,
  onConnected,
  onError
}) => {
  const { connect, testConnection, connecting, error: hookError, clearError } = useAscora(organizationId);

  const [formData, setFormData] = useState({
    apiUrl: '',
    apiToken: '',
    companyCode: ''
  });

  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setLocalError(null);
    setTestSuccess(false);
    clearError();
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!formData.apiUrl.trim()) {
      setLocalError('API URL is required');
      return false;
    }

    if (!formData.apiToken.trim()) {
      setLocalError('API Token is required');
      return false;
    }

    if (!formData.companyCode.trim()) {
      setLocalError('Company Code is required');
      return false;
    }

    // Validate URL format
    try {
      new URL(formData.apiUrl);
    } catch {
      setLocalError('Please enter a valid URL (e.g., https://demo.ascora.com/api/v1)');
      return false;
    }

    return true;
  };

  // Test connection
  const handleTestConnection = async () => {
    if (!validateForm()) return;

    setTesting(true);
    setTestSuccess(false);
    setLocalError(null);

    try {
      const success = await testConnection({
        apiUrl: formData.apiUrl,
        apiToken: formData.apiToken,
        companyCode: formData.companyCode
      });

      if (success) {
        setTestSuccess(true);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  // Handle connect
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      await connect({
        userId,
        apiUrl: formData.apiUrl,
        apiToken: formData.apiToken,
        companyCode: formData.companyCode
      });

      onConnected?.();
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to connect to Ascora';
      setLocalError(errorMessage);
      onError?.(errorMessage);
    }
  };

  const currentError = localError || hookError;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Connect to Ascora CRM</h2>
              <p className="text-blue-100 text-sm mt-1">
                Integrate your RestoreAssist workspace with Ascora
              </p>
            </div>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Benefits of Integration:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-700">Automatic job creation from damage reports</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-700">Bi-directional customer synchronisation</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-700">Real-time status updates</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-700">Invoice and payment tracking</span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleConnect} className="p-6 space-y-6">
          {/* API URL */}
          <div>
            <label htmlFor="apiUrl" className="block text-sm font-medium text-gray-700 mb-1">
              API URL <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                id="apiUrl"
                name="apiUrl"
                value={formData.apiUrl}
                onChange={handleChange}
                placeholder="https://demo.ascora.com/api/v1"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                disabled={connecting}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Your Ascora instance API endpoint
            </p>
          </div>

          {/* API Token */}
          <div>
            <label htmlFor="apiToken" className="block text-sm font-medium text-gray-700 mb-1">
              API Token <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showToken ? 'text' : 'password'}
                id="apiToken"
                name="apiToken"
                value={formData.apiToken}
                onChange={handleChange}
                placeholder="Enter your API token"
                className="w-full pl-10 pr-20 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                disabled={connecting}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-blue-600 hover:text-blue-700"
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Generate this token in your Ascora account settings
            </p>
          </div>

          {/* Company Code */}
          <div>
            <label htmlFor="companyCode" className="block text-sm font-medium text-gray-700 mb-1">
              Company Code <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                id="companyCode"
                name="companyCode"
                value={formData.companyCode}
                onChange={handleChange}
                placeholder="COMPANY"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow uppercase"
                disabled={connecting}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Your unique company identifier in Ascora
            </p>
          </div>

          {/* Error Display */}
          {currentError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Connection Error</p>
                <p className="text-sm text-red-700 mt-1">{currentError}</p>
              </div>
            </div>
          )}

          {/* Success Display */}
          {testSuccess && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900">Connection Test Successful</p>
                <p className="text-sm text-green-700 mt-1">
                  Your credentials are valid. Click "Connect" to complete the setup.
                </p>
              </div>
            </div>
          )}

          {/* Permissions Notice */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Required Permissions:</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                Read and write customer data
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                Create and manage jobs
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                Access invoices and payments
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                Receive webhook notifications
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={connecting || testing}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {testing ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Test Connection
                </>
              )}
            </button>

            <button
              type="submit"
              disabled={connecting || testing}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {connecting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4" />
                  Connect to Ascora
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            <strong>Note:</strong> Your API token will be encrypted and stored securely. You can
            disconnect at any time from the integration settings.
          </p>
        </div>
      </div>

      {/* Help Text */}
      <div className="mt-4 text-center">
        <p className="text-sm text-gray-600">
          Need help? Check out our{' '}
          <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
            integration guide
          </a>{' '}
          or{' '}
          <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
            contact support
          </a>
        </p>
      </div>
    </div>
  );
};

export default AscoraConnect;
