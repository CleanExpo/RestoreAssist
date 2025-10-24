/**
 * Security Warning Component
 *
 * Displays security warnings for development and staging environments
 */

import React from 'react';
import { AlertTriangle, Shield, Lock } from 'lucide-react';

interface SecurityWarningProps {
  type: 'token-storage' | 'oauth-config' | 'development';
  className?: string;
}

export function SecurityWarning({ type, className = '' }: SecurityWarningProps) {
  // Only show in development or staging
  if (import.meta.env.PROD && !window.location.hostname.includes('staging')) {
    return null;
  }

  const warnings = {
    'token-storage': {
      title: 'Security Warning: Token Storage',
      message: 'Authentication tokens are currently stored in localStorage which is vulnerable to XSS attacks. In production, tokens should be stored in httpOnly cookies.',
      icon: AlertTriangle,
      color: 'amber'
    },
    'oauth-config': {
      title: 'OAuth Configuration',
      message: 'OAuth is configured with enhanced security including CSRF state validation and secure redirect URI verification.',
      icon: Shield,
      color: 'green'
    },
    'development': {
      title: 'Development Mode',
      message: 'This application is running in development mode with relaxed security settings. Do not use with production data.',
      icon: Lock,
      color: 'blue'
    }
  };

  const warning = warnings[type];
  if (!warning) return null;

  const Icon = warning.icon;
  const colorClasses = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  return (
    <div className={`${colorClasses[warning.color]} border rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="font-semibold text-sm mb-1">{warning.title}</h4>
          <p className="text-xs opacity-90">{warning.message}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Security Status Badge
 */
export function SecurityStatusBadge() {
  const isProduction = import.meta.env.PROD;
  const isSecure = window.location.protocol === 'https:';

  if (!isProduction) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 shadow-lg">
          <AlertTriangle className="h-3 w-3" />
          DEV MODE
        </div>
      </div>
    );
  }

  if (!isSecure) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 shadow-lg">
          <AlertTriangle className="h-3 w-3" />
          INSECURE
        </div>
      </div>
    );
  }

  return null;
}

export default SecurityWarning;