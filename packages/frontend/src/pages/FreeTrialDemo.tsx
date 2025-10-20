import React, { useState } from 'react';
import { FreeTrialLanding } from './FreeTrialLanding';
import { Dashboard } from './Dashboard';

export function FreeTrialDemo() {
  const [userData, setUserData] = useState<any>(null);
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard'>('landing');

  const handleTrialActivated = (data: any) => {
    console.log('Trial activated successfully:', data);
    setUserData(data);
    setCurrentView('dashboard');
  };

  const handleBackToHome = () => {
    // Clear user data and return to landing
    setUserData(null);
    setCurrentView('landing');

    // Clear tokens
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('sessionToken');
  };

  if (currentView === 'landing') {
    return <FreeTrialLanding onTrialActivated={handleTrialActivated} />;
  }

  return (
    <div>
      {/* Trial Status Banner */}
      {userData?.trial && (
        <div className="sticky top-0 z-60 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div>
                <span className="font-semibold">Free Trial Active</span>
                <span className="ml-2 text-blue-100">
                  {userData.trial.reportsRemaining} reports remaining
                </span>
              </div>
              <div className="text-sm text-blue-100">
                Expires: {new Date(userData.trial.expiresAt).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={handleBackToHome}
              className="text-sm bg-white/20 hover:bg-white/30 px-4 py-1 rounded transition"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      <Dashboard onBackToHome={handleBackToHome} />
    </div>
  );
}
