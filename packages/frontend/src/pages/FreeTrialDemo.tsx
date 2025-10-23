import React, { useState, useEffect } from 'react';
import { FreeTrialLanding } from './FreeTrialLanding';
import { Dashboard } from './Dashboard';
import { UpgradeToPaidButton } from '../components/UpgradeToPaidButton';

export function FreeTrialDemo() {
  const [userData, setUserData] = useState<any>(null);
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard'>('landing');

  // Debug log on every render to track state changes
  useEffect(() => {
    console.log('🔄 FreeTrialDemo: Rendered with currentView =', currentView, 'userData =', userData ? 'present' : 'null');
  }, [currentView, userData]);

  const handleTrialActivated = (data: any) => {
    console.log('🎯 FreeTrialDemo: Trial activated successfully:', data);
    console.log('🎯 FreeTrialDemo: Setting user data and switching to dashboard view...');
    setUserData(data);
    setCurrentView('dashboard');
    console.log('🎯 FreeTrialDemo: State updated - currentView should now be "dashboard"');
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

  console.log('🔍 FreeTrialDemo: Current view =', currentView);

  if (currentView === 'landing') {
    console.log('🔍 FreeTrialDemo: Rendering landing page');
    return <FreeTrialLanding onTrialActivated={handleTrialActivated} />;
  }

  console.log('🔍 FreeTrialDemo: Rendering dashboard');
  return (
    <div>
      {/* Trial Status Banner */}
      {userData?.trial && (
        <div className="sticky top-0 z-60 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 shadow-lg">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <div>
                <span className="font-semibold text-lg">Free Trial Active</span>
                <span className="ml-3 text-blue-100">
                  {userData.trial.reportsRemaining} reports remaining
                </span>
              </div>
              <div className="text-sm text-blue-100">
                Expires: {new Date(userData.trial.expiresAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Upgrade Button */}
              {userData.user?.userId && userData.user?.email && (
                <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                  <UpgradeToPaidButton
                    userId={userData.user.userId}
                    userEmail={userData.user.email}
                    planType="monthly"
                    variant="secondary"
                    size="sm"
                    className="bg-white text-blue-600 hover:bg-blue-50"
                  />
                </div>
              )}
              <button
                onClick={handleBackToHome}
                className="text-sm bg-white/20 hover:bg-white/30 px-4 py-2 rounded transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <Dashboard onBackToHome={handleBackToHome} />
    </div>
  );
}
