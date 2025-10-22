import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LandingPage } from './LandingPage';

/**
 * Preview wrapper for the enhanced landing page
 * Allows testing the new design before replacing the current one
 */
export function LandingPagePreview() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    console.log('Get Started clicked - would navigate to trial/signup');
    // Navigate to the actual trial page when clicked
    navigate('/');
  };

  return (
    <div>
      {/* Preview Banner */}
      <div className="fixed top-4 right-4 z-[100] bg-yellow-500 text-black px-6 py-3 rounded-lg shadow-2xl border-2 border-yellow-600">
        <div className="flex items-center gap-3">
          <span className="text-xl">👁️</span>
          <div>
            <div className="font-bold text-sm">PREVIEW MODE</div>
            <div className="text-xs opacity-90">Enhanced Landing Page Design</div>
          </div>
        </div>
      </div>

      {/* The Enhanced Landing Page */}
      <LandingPage onGetStarted={handleGetStarted} />
    </div>
  );
}
