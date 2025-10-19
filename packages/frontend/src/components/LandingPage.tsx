import React, { useState } from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { VideoModal } from './VideoModal';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import {
  CheckCircle,
  Shield,
  Zap,
  TrendingUp,
  FileText,
  Download,
  Play,
  ArrowRight,
  Star,
  Clock,
} from 'lucide-react';

interface LandingPageProps {
  onLoginSuccess: (credential: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginSuccess }) => {
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      console.error('No credential received from Google');
      return;
    }

    setIsLoading(true);

    try {
      // Generate device fingerprint
      const fingerprint = await generateDeviceFingerprint();

      // Call parent callback with credential
      onLoginSuccess(credentialResponse.credential);
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        {/* Navigation */}
        <nav className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="w-8 h-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">RestoreAssist</span>
            </div>
            <div className="hidden md:flex items-center space-x-6">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition">
                Features
              </a>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition">
                How It Works
              </a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition">
                Pricing
              </a>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="container mx-auto px-6 py-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Column */}
            <div className="space-y-8">
              <div className="inline-flex items-center space-x-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium">
                <Star className="w-4 h-4" />
                <span>Free Trial - 5 Reports Included</span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
                Professional Disaster Recovery Reports in{' '}
                <span className="text-blue-600">Minutes</span>
              </h1>

              <p className="text-xl text-gray-600 leading-relaxed">
                Generate detailed, professional restoration reports with AI-powered automation. Save hours of
                paperwork and focus on what matters most - helping your clients recover.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex flex-col items-center space-y-3">
                  <GoogleLogin
                    onSuccess={handleGoogleLogin}
                    onError={() => console.error('Google Login Failed')}
                    useOneTap
                    theme="filled_blue"
                    size="large"
                    text="signup_with"
                    shape="rectangular"
                  />
                  <p className="text-sm text-gray-500">
                    <Clock className="w-4 h-4 inline mr-1" />
                    No credit card required
                  </p>
                </div>

                <button
                  onClick={() => setIsVideoModalOpen(true)}
                  className="flex items-center justify-center space-x-2 px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:border-blue-600 hover:text-blue-600 transition"
                >
                  <Play className="w-5 h-5" />
                  <span className="font-medium">Watch Demo</span>
                </button>
              </div>

              {/* Trust Indicators */}
              <div className="flex items-center space-x-6 text-sm text-gray-500">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span>7-day free trial</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span>5 free reports</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span>Cancel anytime</span>
                </div>
              </div>
            </div>

            {/* Right Column - Screenshot/Image */}
            <div className="relative">
              <div className="relative bg-white rounded-2xl shadow-2xl p-8 transform hover:scale-105 transition duration-300">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Generated Report</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                      Complete
                    </span>
                  </div>
                  <div className="h-48 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-24 h-24 text-blue-600 opacity-50" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
                  </div>
                </div>
              </div>
              {/* Decorative Elements */}
              <div className="absolute -z-10 -top-10 -right-10 w-72 h-72 bg-blue-200 rounded-full blur-3xl opacity-30" />
              <div className="absolute -z-10 -bottom-10 -left-10 w-72 h-72 bg-indigo-200 rounded-full blur-3xl opacity-30" />
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Streamline Your Workflow
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              RestoreAssist combines AI-powered automation with professional templates to deliver accurate,
              comprehensive reports in record time.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:border-blue-600 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Lightning Fast Generation</h3>
              <p className="text-gray-600">
                Create comprehensive disaster recovery reports in under 2 minutes. Our AI analyzes damage
                patterns and generates accurate cost estimates automatically.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:border-blue-600 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Fraud Detection Built-In</h3>
              <p className="text-gray-600">
                7-layer fraud detection system ensures trial integrity. Device fingerprinting, IP analysis, and
                smart rate limiting protect against abuse.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:border-blue-600 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Download className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Multiple Export Formats</h3>
              <p className="text-gray-600">
                Export your reports as PDF or DOCX with professional formatting. Ready to share with clients,
                insurance companies, and contractors.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:border-blue-600 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Accurate Cost Estimates</h3>
              <p className="text-gray-600">
                Our AI uses industry-standard pricing data and local market rates to provide accurate repair
                cost estimates you can trust.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:border-blue-600 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Professional Templates</h3>
              <p className="text-gray-600">
                Choose from industry-standard templates for water damage, fire damage, mold remediation, and
                more. All customizable to your needs.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:border-blue-600 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Compliance Ready</h3>
              <p className="text-gray-600">
                All reports meet industry standards and include required documentation for insurance claims and
                regulatory compliance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-xl text-gray-600">Get started in 3 simple steps</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative">
              <div className="bg-white p-8 rounded-xl shadow-lg">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mb-4">
                  1
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Sign Up with Google</h3>
                <p className="text-gray-600">
                  Click "Sign up with Google" and create your free account in seconds. No credit card required
                  for the trial.
                </p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                <ArrowRight className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="bg-white p-8 rounded-xl shadow-lg">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mb-4">
                  2
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Enter Damage Details</h3>
                <p className="text-gray-600">
                  Fill out a simple form with property information, damage type, affected areas, and any
                  special notes.
                </p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                <ArrowRight className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mb-4">
                3
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Download Your Report</h3>
              <p className="text-gray-600">
                Get your professional report instantly. Export as PDF or DOCX and share with clients or
                insurance companies.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-gray-600">Start free, upgrade when you're ready</p>
          </div>

          <div className="max-w-md mx-auto">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-8 rounded-2xl shadow-2xl transform hover:scale-105 transition">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">Free Trial</h3>
                <div className="text-5xl font-bold mb-2">$0</div>
                <p className="text-blue-100">7 days • 5 reports</p>
              </div>

              <ul className="space-y-3 mb-8">
                <li className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5" />
                  <span>5 professional reports</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5" />
                  <span>PDF & DOCX export</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5" />
                  <span>AI-powered cost estimates</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5" />
                  <span>Professional templates</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5" />
                  <span>No credit card required</span>
                </li>
              </ul>

              <div className="bg-white text-blue-600 rounded-lg p-4">
                <GoogleLogin
                  onSuccess={handleGoogleLogin}
                  onError={() => console.error('Google Login Failed')}
                  theme="outline"
                  size="large"
                  text="signup_with"
                  width="100%"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Shield className="w-6 h-6 text-blue-500" />
              <span className="text-xl font-bold text-white">RestoreAssist</span>
            </div>
            <p className="mb-4">Professional disaster recovery reports powered by AI</p>
            <p className="text-sm">© 2025 RestoreAssist. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Video Modal */}
      <VideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        videoId="dQw4w9WgXcQ"
        title="RestoreAssist Demo - See How It Works"
      />
    </div>
  );
};
