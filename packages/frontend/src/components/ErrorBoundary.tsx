import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component that catches React errors and sends them to Sentry
 * Provides a user-friendly error UI instead of crashing the entire app
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to Sentry
    console.error('Error caught by ErrorBoundary:', error, errorInfo);

    // Capture error in Sentry if in production
    if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(error, {
        extra: {
          componentStack: errorInfo.componentStack,
        },
      });
    }

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 md:p-12">
            {/* Error Icon */}
            <div className="flex justify-center mb-6">
              <div className="bg-red-100 p-6 rounded-full">
                <AlertCircle className="w-16 h-16 text-red-600" />
              </div>
            </div>

            {/* Error Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-4">
              Oops! Something went wrong
            </h1>

            {/* Error Description */}
            <p className="text-lg text-gray-600 text-center mb-8">
              We're sorry for the inconvenience. An unexpected error occurred while processing your request.
              Our team has been notified and is working to fix the issue.
            </p>

            {/* Error Details (Development Only) */}
            {!import.meta.env.PROD && this.state.error && (
              <div className="bg-gray-100 rounded-lg p-4 mb-8 max-h-64 overflow-auto">
                <p className="text-sm font-mono text-red-600 mb-2">
                  <strong>Error:</strong> {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Reload Page</span>
              </button>

              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-white hover:bg-gray-50 text-gray-900 font-semibold rounded-xl border-2 border-gray-200 hover:border-gray-300 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <Home className="w-5 h-5" />
                <span>Go Home</span>
              </button>
            </div>

            {/* Support Information */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 text-center">
                If this problem persists, please contact our support team at{' '}
                <a
                  href="mailto:support@restoreassist.com"
                  className="text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  support@restoreassist.com
                </a>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Sentry Error Boundary - Alternative using Sentry's built-in boundary
 * This can be used as a drop-in replacement for the ErrorBoundary above
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;
