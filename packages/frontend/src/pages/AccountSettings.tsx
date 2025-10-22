import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Mail,
  Shield,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  LogOut,
} from 'lucide-react';
import { setUser as setSentryUser } from '../sentry';

export const AccountSettings: React.FC = () => {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Get user info from localStorage (set during login)
  const userEmail = localStorage.getItem('userEmail') || 'user@example.com';
  const userName = localStorage.getItem('userName') || 'User';

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const accessToken = localStorage.getItem('accessToken');

      const response = await fetch(`${apiUrl}/api/auth/delete-account`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include credentials for CORS
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete account');
      }

      // Clear all user data
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      localStorage.removeItem('userId');

      // Clear Sentry user context
      setSentryUser(null);

      // Show success message and redirect
      alert('Your account has been successfully deleted. We\'re sorry to see you go.');
      navigate('/');
    } catch (error) {
      console.error('Delete account error:', error);
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete account. Please try again or contact support.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = () => {
    // Clear all tokens
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');

    // Clear Sentry user context
    setSentryUser(null);

    // Redirect to home
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Back Button */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <div className="flex items-center space-x-4 mb-8">
          <div className="bg-blue-100 p-3 rounded-xl">
            <User className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
            <p className="text-gray-500">Manage your account and privacy</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Profile Information */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <User className="w-6 h-6 mr-2 text-blue-600" />
              Profile Information
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Mail className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Email</p>
                    <p className="text-gray-900 font-medium">{userEmail}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Verified</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <User className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Name</p>
                    <p className="text-gray-900 font-medium">{userName}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Shield className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Authentication</p>
                    <p className="text-gray-900 font-medium">Google OAuth</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Secure</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>

            <div className="space-y-3">
              <Link
                to="/subscription"
                className="flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group"
              >
                <div className="flex items-center space-x-3">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-900">Manage Subscription</p>
                    <p className="text-sm text-gray-600">View plan, billing, and usage</p>
                  </div>
                </div>
                <ArrowLeft className="w-5 h-5 text-blue-600 transform rotate-180 group-hover:translate-x-1 transition-transform" />
              </Link>

              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group"
              >
                <div className="flex items-center space-x-3">
                  <LogOut className="w-5 h-5 text-gray-600" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">Sign Out</p>
                    <p className="text-sm text-gray-600">Log out of your account</p>
                  </div>
                </div>
                <ArrowLeft className="w-5 h-5 text-gray-600 transform rotate-180 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Danger Zone - Account Deletion */}
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl shadow-lg p-8">
            <div className="flex items-center space-x-3 mb-6">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h2 className="text-2xl font-bold text-red-900">Danger Zone</h2>
            </div>

            <div className="bg-white rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Account</h3>
              <p className="text-gray-700 mb-4">
                Permanently delete your RestoreAssist account and all associated data. This action cannot be undone.
              </p>

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>Delete My Account</span>
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h4 className="font-bold text-red-900 mb-2 flex items-center">
                      <AlertTriangle className="w-5 h-5 mr-2" />
                      Warning: This is permanent!
                    </h4>
                    <ul className="text-sm text-red-800 space-y-1 ml-7">
                      <li>• All your reports will be permanently deleted</li>
                      <li>• Your subscription will be cancelled immediately</li>
                      <li>• You will lose access to all features</li>
                      <li>• This action cannot be reversed</li>
                    </ul>
                  </div>

                  <div>
                    <label htmlFor="deleteConfirm" className="block text-sm font-semibold text-gray-900 mb-2">
                      Type <span className="font-mono bg-gray-200 px-2 py-1 rounded">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      id="deleteConfirm"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Type DELETE here"
                    />
                  </div>

                  {deleteError && (
                    <div className="bg-red-100 border border-red-300 rounded-lg p-3 flex items-start space-x-2">
                      <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{deleteError}</p>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={isDeleting || deleteConfirmText !== 'DELETE'}
                      className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span>{isDeleting ? 'Deleting...' : 'Confirm Delete Account'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText('');
                        setDeleteError(null);
                      }}
                      disabled={isDeleting}
                      className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Privacy Links */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Your Privacy Matters</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <Link to="/privacy" className="text-blue-600 hover:text-blue-800 underline font-medium">
                Privacy Policy
              </Link>
              <Link to="/terms" className="text-blue-600 hover:text-blue-800 underline font-medium">
                Terms of Service
              </Link>
              <Link to="/contact" className="text-blue-600 hover:text-blue-800 underline font-medium">
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
