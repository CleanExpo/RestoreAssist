import React, { useState, useEffect } from 'react';
import { Cookie, X, Shield, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const COOKIE_CONSENT_KEY = 'restoreassist-cookie-consent';

export const CookieConsent: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already consented
    const hasConsented = localStorage.getItem(COOKIE_CONSENT_KEY);

    if (!hasConsented) {
      // Show banner after a short delay for better UX
      setTimeout(() => {
        setShowBanner(true);
        setTimeout(() => setIsVisible(true), 100);
      }, 1000);
    }
  }, []);

  const handleAccept = () => {
    // Store consent
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      accepted: true,
      timestamp: new Date().toISOString(),
      version: '1.0',
    }));

    // Hide banner with animation
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  };

  const handleDecline = () => {
    // Store decline preference
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      accepted: false,
      timestamp: new Date().toISOString(),
      version: '1.0',
    }));

    // Hide banner with animation
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-300 z-40 ${
          isVisible ? 'opacity-20 pointer-events-none' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Cookie Banner */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-300 ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-white border-t-4 border-blue-600 shadow-2xl">
          <div className="container mx-auto px-6 py-6">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              {/* Left Side - Icon & Content */}
              <div className="flex items-start space-x-4 flex-1">
                <div className="bg-blue-100 p-3 rounded-xl flex-shrink-0">
                  <Cookie className="w-6 h-6 text-blue-600" />
                </div>

                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center">
                    <Shield className="w-5 h-5 mr-2 text-blue-600" />
                    We Value Your Privacy
                  </h3>

                  <p className="text-gray-700 leading-relaxed mb-3">
                    We use cookies and similar technologies to enhance your experience, analyze site usage,
                    and assist with our marketing efforts. This includes essential cookies for site functionality,
                    analytics cookies to understand how you use our service, and cookies from third-party services
                    like Google, Stripe, and Sentry.
                  </p>

                  <div className="flex flex-wrap gap-2 text-sm">
                    <Link
                      to="/privacy"
                      className="text-blue-600 hover:text-blue-800 underline font-medium"
                    >
                      Privacy Policy
                    </Link>
                    <span className="text-gray-400">•</span>
                    <Link
                      to="/terms"
                      className="text-blue-600 hover:text-blue-800 underline font-medium"
                    >
                      Terms of Service
                    </Link>
                  </div>
                </div>
              </div>

              {/* Right Side - Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <button
                  onClick={handleDecline}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 border border-gray-300"
                >
                  <X className="w-4 h-4" />
                  <span>Decline</span>
                </button>

                <button
                  onClick={handleAccept}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Accept All Cookies</span>
                </button>
              </div>
            </div>

            {/* Cookie Details */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <details className="group">
                <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900 font-medium flex items-center">
                  <span className="mr-2">View Cookie Details</span>
                  <svg
                    className="w-4 h-4 transform transition-transform group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>

                <div className="mt-3 text-sm text-gray-600 space-y-3">
                  <div>
                    <strong className="text-gray-900">Essential Cookies:</strong>
                    <p>Required for site functionality including authentication, session management, and security.</p>
                  </div>

                  <div>
                    <strong className="text-gray-900">Analytics Cookies:</strong>
                    <p>Help us understand how visitors interact with our service (Sentry for error tracking).</p>
                  </div>

                  <div>
                    <strong className="text-gray-900">Third-Party Cookies:</strong>
                    <p>
                      Google (OAuth authentication), Stripe (payment processing), Supabase (database),
                      SendGrid (email delivery), Vercel (hosting).
                    </p>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/**
 * Hook to check if user has accepted cookies
 */
export const useCookieConsent = (): {
  hasConsented: boolean;
  consentValue: boolean | null;
  consentTimestamp: string | null;
} => {
  const [consent, setConsent] = useState<{
    hasConsented: boolean;
    consentValue: boolean | null;
    consentTimestamp: string | null;
  }>({
    hasConsented: false,
    consentValue: null,
    consentTimestamp: null,
  });

  useEffect(() => {
    const consentData = localStorage.getItem(COOKIE_CONSENT_KEY);

    if (consentData) {
      try {
        const parsed = JSON.parse(consentData);
        setConsent({
          hasConsented: true,
          consentValue: parsed.accepted,
          consentTimestamp: parsed.timestamp,
        });
      } catch (error) {
        console.error('Error parsing cookie consent:', error);
      }
    }
  }, []);

  return consent;
};
