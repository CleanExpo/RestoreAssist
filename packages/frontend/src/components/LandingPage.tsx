import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { VideoModal } from './VideoModal';
import { UserMenu } from './UserMenu';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import { signOutCompletely } from '../utils/signOut';
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
  Sparkles,
  Users,
  BarChart3,
  Award,
  Flame,
  Droplets,
  Wind,
  Home,
  ChevronRight,
  Layers,
  Bot,
  Globe,
} from 'lucide-react';

interface LandingPageProps {
  onLoginSuccess: (credential: string) => void;
  onDevLogin?: () => void;
  onShowGoogleOAuth?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginSuccess, onDevLogin, onShowGoogleOAuth }) => {
  const navigate = useNavigate();
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setIsAuthenticated(!!token);

    // CRITICAL: Disable Google One Tap completely
    // This prevents "Sign in as [Name]" from appearing
    const disableOneTap = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
    };

    // Disable immediately and on any script load
    disableOneTap();
    const interval = setInterval(disableOneTap, 100);

    return () => clearInterval(interval);
  }, []);

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
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Modern Minimal Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <img src="/assets/logo.png" alt="RestoreAssist Logo" className="w-12 h-12 rounded-xl object-cover shadow-sm" />
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                RestoreAssist
              </span>
            </div>

            {/* Navigation Links - Desktop */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition font-medium text-sm">
                Features
              </a>
              <a href="#how-it-works" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition font-medium text-sm">
                How It Works
              </a>
              <a href="#pricing" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition font-medium text-sm">
                Pricing
              </a>

              {/* Auth Buttons or UserMenu */}
              {isAuthenticated ? (
                <UserMenu />
              ) : (
                <div className="flex items-center space-x-4">
                  <Link
                    to="/signin"
                    className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition font-medium text-sm"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl text-sm"
                  >
                    Start Free Trial
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Modern & Clean */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800" />

        {/* Floating elements */}
        <div className="absolute top-20 right-20 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl" />

        <div className="relative container mx-auto px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center space-x-2 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-full text-sm font-semibold mb-8 shadow-sm">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="text-gray-700 dark:text-gray-300">Free 7-Day Trial • 3 Reports Included</span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl lg:text-7xl font-bold mb-6 leading-tight">
              <span className="text-gray-900 dark:text-white">Professional </span>
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Disaster Recovery
              </span>
              <br />
              <span className="text-gray-900 dark:text-white">Reports in Minutes</span>
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              AI-powered restoration reports with accurate cost estimates.
              Save hours on documentation and focus on what matters.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link
                to="/signup"
                className="group inline-flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-4 rounded-xl font-semibold transition-all duration-300 shadow-xl hover:shadow-2xl"
              >
                <span>Start Free Trial</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button
                onClick={() => setIsVideoModalOpen(true)}
                className="inline-flex items-center space-x-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-900 dark:text-white px-8 py-4 rounded-xl font-semibold transition-all duration-300"
              >
                <Play className="w-5 h-5" />
                <span>Watch Demo</span>
              </button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span>Cancel anytime</span>
              </div>
              <div className="flex items-center space-x-2">
                <Star className="w-5 h-5 text-yellow-500 fill-current" />
                <span>4.9/5 rating</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Minimal Cards */}
      <section id="features" className="py-20 lg:py-32 bg-white dark:bg-gray-950">
        <div className="container mx-auto px-6 lg:px-8">
          {/* Section Header */}
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Everything you need
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Powerful features that save time and improve accuracy
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Feature 1 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-100 dark:border-blue-800/30 hover:shadow-xl transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Lightning Fast</h3>
              <p className="text-gray-600 dark:text-gray-400">Generate comprehensive reports in under 2 minutes with AI assistance</p>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/10 dark:to-pink-900/10 border border-purple-100 dark:border-purple-800/30 hover:shadow-xl transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">AI-Powered</h3>
              <p className="text-gray-600 dark:text-gray-400">Accurate cost estimates using industry-standard pricing data</p>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border border-green-100 dark:border-green-800/30 hover:shadow-xl transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Download className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Export Anywhere</h3>
              <p className="text-gray-600 dark:text-gray-400">PDF & DOCX formats ready for clients and insurance companies</p>
            </div>

            {/* Feature 4 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/10 dark:to-red-900/10 border border-orange-100 dark:border-orange-800/30 hover:shadow-xl transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-orange-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Accurate Pricing</h3>
              <p className="text-gray-600 dark:text-gray-400">Local market rates and industry standards for reliable estimates</p>
            </div>

            {/* Feature 5 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/10 dark:to-blue-900/10 border border-cyan-100 dark:border-cyan-800/30 hover:shadow-xl transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-cyan-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Professional Templates</h3>
              <p className="text-gray-600 dark:text-gray-400">Industry-standard templates for all restoration scenarios</p>
            </div>

            {/* Feature 6 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/10 dark:to-purple-900/10 border border-indigo-100 dark:border-indigo-800/30 hover:shadow-xl transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Compliance Ready</h3>
              <p className="text-gray-600 dark:text-gray-400">Meet industry standards and regulatory requirements</p>
            </div>
          </div>
        </div>
      </section>

      {/* Damage Types - Modern Minimal */}
      <section className="py-20 lg:py-32 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Built for every scenario
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Specialized templates for all restoration types
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <div className="group relative overflow-hidden bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-300 hover:shadow-xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16" />
              <Droplets className="w-10 h-10 text-blue-600 mb-4 relative z-10" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 relative z-10">Water Damage</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm relative z-10">Floods, leaks & moisture</p>
            </div>

            <div className="group relative overflow-hidden bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-orange-500 dark:hover:border-orange-500 transition-all duration-300 hover:shadow-xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full -mr-16 -mt-16" />
              <Flame className="w-10 h-10 text-orange-600 mb-4 relative z-10" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 relative z-10">Fire Damage</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm relative z-10">Smoke, soot & structural</p>
            </div>

            <div className="group relative overflow-hidden bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-gray-500 dark:hover:border-gray-500 transition-all duration-300 hover:shadow-xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gray-500/10 rounded-full -mr-16 -mt-16" />
              <Wind className="w-10 h-10 text-gray-600 mb-4 relative z-10" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 relative z-10">Storm Damage</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm relative z-10">Wind, hail & weather</p>
            </div>

            <div className="group relative overflow-hidden bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-green-500 dark:hover:border-green-500 transition-all duration-300 hover:shadow-xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full -mr-16 -mt-16" />
              <Home className="w-10 h-10 text-green-600 mb-4 relative z-10" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 relative z-10">Mould & Biohazard</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm relative z-10">Remediation & cleanup</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Clean Steps */}
      <section id="how-it-works" className="py-20 lg:py-32 bg-white dark:bg-gray-950">
        <div className="container mx-auto px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Simple 3-step process
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Get professional reports in minutes
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-12 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="relative text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-xl">
                1
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Sign Up</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Create your free account in seconds. No credit card required for trial.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-xl">
                2
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Enter Details</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Fill out a simple form with property info, damage type, and affected areas.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-xl">
                3
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Download Report</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Get your professional report instantly. Export as PDF or DOCX.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Minimal */}
      <section id="pricing" className="py-20 lg:py-32 bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />

        <div className="relative container mx-auto px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4">
              Start free, upgrade when ready
            </h2>
            <p className="text-xl text-blue-100">
              No credit card required for trial
            </p>
          </div>

          <div className="max-w-lg mx-auto">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 shadow-2xl">
              <div className="text-center mb-8">
                <div className="inline-block bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full mb-6">
                  MOST POPULAR
                </div>
                <h3 className="text-3xl font-bold text-white mb-4">Free Trial</h3>
                <div className="flex items-baseline justify-center mb-2">
                  <span className="text-7xl font-bold text-white">$0</span>
                </div>
                <p className="text-blue-100">7 days • 3 professional reports</p>
              </div>

              <ul className="space-y-4 mb-10">
                {[
                  '3 professional reports included',
                  'PDF & DOCX export formats',
                  'AI-powered cost estimates',
                  'All professional templates',
                  'No credit card required',
                  'Cancel anytime'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center space-x-3 text-white">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/signup"
                className="block w-full bg-white hover:bg-gray-100 text-gray-900 font-bold py-4 rounded-xl text-center transition-all duration-300 shadow-xl"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer - Minimal */}
      <footer className="bg-gray-900 text-gray-400 py-16">
        <div className="container mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-3 mb-6">
                <img src="/assets/logo.png" alt="RestoreAssist Logo" className="w-12 h-12 rounded-xl object-cover" />
                <span className="text-2xl font-bold text-white">RestoreAssist</span>
              </div>
              <p className="text-gray-400 mb-6 max-w-md leading-relaxed">
                Professional disaster recovery reports powered by AI. Trusted by restoration professionals worldwide.
              </p>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition">How It Works</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-3">
                <li><Link to="/contact" className="hover:text-white transition">Contact Support</Link></li>
                <li><Link to="/privacy" className="hover:text-white transition">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-white transition">Terms of Service</Link></li>
                <li><Link to="/refunds" className="hover:text-white transition">Refund Policy</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <p className="text-sm text-gray-500">© 2025 RestoreAssist. All rights reserved.</p>
              <p className="text-sm text-gray-500 mt-4 md:mt-0">
                Built with AI • Powered by Innovation
              </p>
            </div>
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

      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        .animate-blob {
          animation: blob 7s infinite;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }

        .animation-delay-4000 {
          animation-delay: 4s;
        }

        .bg-grid-white {
          background-image: url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='white' fill-opacity='0.05'%3E%3Cpath d='M0 0h20v20H0z'/%3E%3C/g%3E%3C/svg%3E");
        }
      `}</style>
    </div>
  );
};
