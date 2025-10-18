import React, { useState } from 'react';
import { LandingPage } from './pages/LandingPage';
import { Dashboard } from './pages/Dashboard';

function App() {
  const [currentPage, setCurrentPage] = useState<'landing' | 'dashboard'>('landing');

  const handleGetStarted = () => {
    setCurrentPage('dashboard');
  };

  const handleBackToHome = () => {
    setCurrentPage('landing');
  };

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
