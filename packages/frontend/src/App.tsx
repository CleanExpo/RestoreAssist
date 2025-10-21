import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FreeTrialDemo } from './pages/FreeTrialDemo';
import { PricingPage } from './pages/PricingPage';
import { CheckoutSuccess } from './pages/CheckoutSuccess';
import { Dashboard } from './pages/Dashboard';
import { SubscriptionManagement } from './pages/SubscriptionManagement';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { RefundPolicy } from './pages/RefundPolicy';
import { ContactSupport } from './pages/ContactSupport';

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

        {/* Legal Pages */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/refunds" element={<RefundPolicy />} />

        {/* Support */}
        <Route path="/contact" element={<ContactSupport />} />

        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
