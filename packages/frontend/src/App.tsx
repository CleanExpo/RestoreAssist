import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FreeTrialDemo } from './pages/FreeTrialDemo';
import { PricingPage } from './pages/PricingPage';
import { CheckoutSuccess } from './pages/CheckoutSuccess';
import { Dashboard } from './pages/Dashboard';
import { SubscriptionManagement } from './pages/SubscriptionManagement';

function App() {
  return (
    <Router>
      <Routes>
        {/* Main Routes */}
        <Route path="/" element={<FreeTrialDemo />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/dashboard" element={<Dashboard onBackToHome={() => window.location.href = '/'} />} />
        <Route path="/subscription" element={<SubscriptionManagement />} />

        {/* Checkout Routes */}
        <Route path="/checkout/success" element={<CheckoutSuccess />} />

        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
