import React, { useState } from 'react';
import { LandingPage } from './pages/LandingPage';
import { Dashboard } from './pages/Dashboard';
import { FreeTrialDemo } from './pages/FreeTrialDemo';

function App() {
  // Set to 'demo' to use Free Trial flow with Google OAuth
  // Set to 'classic' to use original flow
  const [mode] = useState<'demo' | 'classic'>('demo');
  const [currentPage, setCurrentPage] = useState<'landing' | 'dashboard'>('landing');

  const handleGetStarted = () => {
    setCurrentPage('dashboard');
  };

  const handleBackToHome = () => {
    setCurrentPage('landing');
  };

  // Free Trial Demo Mode (with Google OAuth)
  if (mode === 'demo') {
    return <FreeTrialDemo />;
  }

  // Classic Mode (original landing page)
  return (
    <>
      {currentPage === 'landing' ? (
        <LandingPage onGetStarted={handleGetStarted} />
      ) : (
        <Dashboard onBackToHome={handleBackToHome} />
      )}
    </>
  );
}

export default App;
