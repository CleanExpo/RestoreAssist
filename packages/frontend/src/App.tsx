import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoadingFallback, PageLoadingFallback } from './components/LoadingFallback';
import { CookieConsent } from './components/CookieConsent';
import { OAuthConfigProvider } from './contexts/OAuthConfigContext';

// Lazy load all route components for code splitting
const FreeTrialDemo = lazy(() => import('./pages/FreeTrialDemo').then(m => ({ default: m.FreeTrialDemo })));
const PricingPage = lazy(() => import('./pages/PricingPage').then(m => ({ default: m.PricingPage })));
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess').then(m => ({ default: m.CheckoutSuccess })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const SubscriptionManagement = lazy(() => import('./pages/SubscriptionManagement').then(m => ({ default: m.SubscriptionManagement })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('./pages/TermsOfService').then(m => ({ default: m.TermsOfService })));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy').then(m => ({ default: m.RefundPolicy })));
const ContactSupport = lazy(() => import('./pages/ContactSupport').then(m => ({ default: m.ContactSupport })));
const AccountSettings = lazy(() => import('./pages/AccountSettings').then(m => ({ default: m.AccountSettings })));
const LandingPagePreview = lazy(() => import('./pages/LandingPagePreview').then(m => ({ default: m.LandingPagePreview })));
const AboutPage = lazy(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })));

// Feature Pages - Core Capabilities (lazy loaded)
const AIReportsFeature = lazy(() => import('./pages/features/AIReportsFeature').then(m => ({ default: m.AIReportsFeature })));
const IICRCComplianceFeature = lazy(() => import('./pages/features/IICRCComplianceFeature').then(m => ({ default: m.IICRCComplianceFeature })));
const BuildingCodesFeature = lazy(() => import('./pages/features/BuildingCodesFeature').then(m => ({ default: m.BuildingCodesFeature })));
const CostEstimationFeature = lazy(() => import('./pages/features/CostEstimationFeature').then(m => ({ default: m.CostEstimationFeature })));

// Feature Pages - Damage Assessment (lazy loaded)
const WaterDamageFeature = lazy(() => import('./pages/features/WaterDamageFeature').then(m => ({ default: m.WaterDamageFeature })));
const FireDamageFeature = lazy(() => import('./pages/features/FireDamageFeature').then(m => ({ default: m.FireDamageFeature })));
const StormDamageFeature = lazy(() => import('./pages/features/StormDamageFeature').then(m => ({ default: m.StormDamageFeature })));
const FloodMouldFeature = lazy(() => import('./pages/features/FloodMouldFeature').then(m => ({ default: m.FloodMouldFeature })));

// Feature Pages - Professional Tools (lazy loaded)
const ExportFormatsFeature = lazy(() => import('./pages/features/ExportFormatsFeature').then(m => ({ default: m.ExportFormatsFeature })));
const TemplatesFeature = lazy(() => import('./pages/features/TemplatesFeature').then(m => ({ default: m.TemplatesFeature })));
const BatchProcessingFeature = lazy(() => import('./pages/features/BatchProcessingFeature').then(m => ({ default: m.BatchProcessingFeature })));
const AnalyticsFeature = lazy(() => import('./pages/features/AnalyticsFeature').then(m => ({ default: m.AnalyticsFeature })));

// Resource Pages (lazy loaded)
const DocumentationPage = lazy(() => import('./pages/resources/DocumentationPage').then(m => ({ default: m.DocumentationPage })));
const TrainingPage = lazy(() => import('./pages/resources/TrainingPage').then(m => ({ default: m.TrainingPage })));
const APIIntegrationPage = lazy(() => import('./pages/resources/APIIntegrationPage').then(m => ({ default: m.APIIntegrationPage })));
const CompliancePage = lazy(() => import('./pages/resources/CompliancePage').then(m => ({ default: m.CompliancePage })));

function App() {
  return (
    <OAuthConfigProvider>
      <Router>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
          {/* Preview Routes - For Testing New Designs */}
          <Route path="/preview/landing" element={
            <Suspense fallback={<PageLoadingFallback pageName="Preview" />}>
              <LandingPagePreview />
            </Suspense>
          } />

          {/* Main Routes */}
          <Route path="/" element={
            <Suspense fallback={<LoadingFallback />}>
              <FreeTrialDemo />
            </Suspense>
          } />
          <Route path="/about" element={
            <Suspense fallback={<PageLoadingFallback pageName="About" />}>
              <AboutPage />
            </Suspense>
          } />
          <Route path="/pricing" element={
            <Suspense fallback={<PageLoadingFallback pageName="Pricing" />}>
              <PricingPage />
            </Suspense>
          } />

          {/* Feature Pages - Core Capabilities */}
          <Route path="/features/ai-reports" element={
            <Suspense fallback={<PageLoadingFallback pageName="AI Reports" />}>
              <AIReportsFeature />
            </Suspense>
          } />
          <Route path="/features/iicrc-compliance" element={
            <Suspense fallback={<PageLoadingFallback pageName="IICRC Compliance" />}>
              <IICRCComplianceFeature />
            </Suspense>
          } />
          <Route path="/features/building-codes" element={
            <Suspense fallback={<PageLoadingFallback pageName="Building Codes" />}>
              <BuildingCodesFeature />
            </Suspense>
          } />
          <Route path="/features/cost-estimation" element={
            <Suspense fallback={<PageLoadingFallback pageName="Cost Estimation" />}>
              <CostEstimationFeature />
            </Suspense>
          } />

          {/* Feature Pages - Damage Assessment */}
          <Route path="/features/water-damage" element={
            <Suspense fallback={<PageLoadingFallback pageName="Water Damage" />}>
              <WaterDamageFeature />
            </Suspense>
          } />
          <Route path="/features/fire-damage" element={
            <Suspense fallback={<PageLoadingFallback pageName="Fire Damage" />}>
              <FireDamageFeature />
            </Suspense>
          } />
          <Route path="/features/storm-damage" element={
            <Suspense fallback={<PageLoadingFallback pageName="Storm Damage" />}>
              <StormDamageFeature />
            </Suspense>
          } />
          <Route path="/features/flood-mould" element={
            <Suspense fallback={<PageLoadingFallback pageName="Flood & Mould" />}>
              <FloodMouldFeature />
            </Suspense>
          } />

          {/* Feature Pages - Professional Tools */}
          <Route path="/features/export-formats" element={
            <Suspense fallback={<PageLoadingFallback pageName="Export Formats" />}>
              <ExportFormatsFeature />
            </Suspense>
          } />
          <Route path="/features/templates" element={
            <Suspense fallback={<PageLoadingFallback pageName="Templates" />}>
              <TemplatesFeature />
            </Suspense>
          } />
          <Route path="/features/batch-processing" element={
            <Suspense fallback={<PageLoadingFallback pageName="Batch Processing" />}>
              <BatchProcessingFeature />
            </Suspense>
          } />
          <Route path="/features/analytics" element={
            <Suspense fallback={<PageLoadingFallback pageName="Analytics" />}>
              <AnalyticsFeature />
            </Suspense>
          } />

          {/* Resource Pages */}
          <Route path="/resources/documentation" element={
            <Suspense fallback={<PageLoadingFallback pageName="Documentation" />}>
              <DocumentationPage />
            </Suspense>
          } />
          <Route path="/resources/training" element={
            <Suspense fallback={<PageLoadingFallback pageName="Training" />}>
              <TrainingPage />
            </Suspense>
          } />
          <Route path="/resources/api" element={
            <Suspense fallback={<PageLoadingFallback pageName="API Integration" />}>
              <APIIntegrationPage />
            </Suspense>
          } />
          <Route path="/resources/compliance" element={
            <Suspense fallback={<PageLoadingFallback pageName="Compliance" />}>
              <CompliancePage />
            </Suspense>
          } />

          {/* Application Pages */}
          <Route path="/dashboard" element={
            <Suspense fallback={<PageLoadingFallback pageName="Dashboard" />}>
              <Dashboard onBackToHome={() => window.location.href = '/'} />
            </Suspense>
          } />
          <Route path="/subscription" element={
            <Suspense fallback={<PageLoadingFallback pageName="Subscription" />}>
              <SubscriptionManagement />
            </Suspense>
          } />

          {/* Checkout Routes */}
          <Route path="/checkout/success" element={
            <Suspense fallback={<PageLoadingFallback pageName="Checkout Success" />}>
              <CheckoutSuccess />
            </Suspense>
          } />

          {/* Legal Pages */}
          <Route path="/privacy" element={
            <Suspense fallback={<PageLoadingFallback pageName="Privacy Policy" />}>
              <PrivacyPolicy />
            </Suspense>
          } />
          <Route path="/terms" element={
            <Suspense fallback={<PageLoadingFallback pageName="Terms of Service" />}>
              <TermsOfService />
            </Suspense>
          } />
          <Route path="/refunds" element={
            <Suspense fallback={<PageLoadingFallback pageName="Refund Policy" />}>
              <RefundPolicy />
            </Suspense>
          } />

          {/* Support */}
          <Route path="/contact" element={
            <Suspense fallback={<PageLoadingFallback pageName="Contact Support" />}>
              <ContactSupport />
            </Suspense>
          } />

          {/* Account Settings */}
          <Route path="/settings" element={
            <Suspense fallback={<PageLoadingFallback pageName="Account Settings" />}>
              <AccountSettings />
            </Suspense>
          } />

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

        {/* Cookie Consent Banner - Shows on all pages */}
        <CookieConsent />
      </Router>
    </OAuthConfigProvider>
  );
}

export default App;