import React, { useState, useEffect, memo, useCallback, useMemo, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CredentialResponse } from '@react-oauth/google';
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
} from 'lucide-react';

// Lazy load Google OAuth to prevent auto-login on page load
const GoogleLogin = lazy(() =>
  import('@react-oauth/google').then(module => ({ default: module.GoogleLogin }))
);

interface LandingPageProps {
  onLoginSuccess: (credential: string) => void;
  onDevLogin?: () => void;
  onShowGoogleOAuth?: () => void;
}

// Memoized Hero Section
const HeroSection = memo<{
  isVideoModalOpen: boolean;
  setIsVideoModalOpen: (value: boolean) => void;
  isAuthenticated: boolean;
  onLoginSuccess: (credential: string) => void;
  onDevLogin?: () => void;
  onShowGoogleOAuth?: () => void;
}>(({ isVideoModalOpen, setIsVideoModalOpen, isAuthenticated, onLoginSuccess, onDevLogin, onShowGoogleOAuth }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = useCallback(async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      console.error('No credential received from Google');
      return;
    }

    setIsLoading(true);

    try {
      const fingerprint = await generateDeviceFingerprint();
      onLoginSuccess(credentialResponse.credential);
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [onLoginSuccess]);

  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000" />
      </div>

      {/* Navigation */}
      <nav className="relative container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/assets/logo.png" alt="RestoreAssist Logo" className="w-[60px] h-[60px] rounded-full object-cover" />
            <span className="text-2xl font-bold text-white">RestoreAssist</span>
          </div>
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-white hover:text-blue-100 transition font-medium">
              Features
            </a>
            <a href="#how-it-works" className="text-white hover:text-blue-100 transition font-medium">
              How It Works
            </a>
            <a href="#pricing" className="text-white hover:text-blue-100 transition font-medium">
              Pricing
            </a>

            {/* Auth Buttons or UserMenu + ALWAYS VISIBLE SIGN OUT */}
            <div className="flex items-center space-x-4 ml-4">
              {/* EMERGENCY SIGN OUT BUTTON - ALWAYS VISIBLE */}
              <button
                onClick={signOutCompletely}
                className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                🔓 Sign Out
              </button>

              {isAuthenticated ? (
                <div>
                  <UserMenu />
                </div>
              ) : (
                <>
                  <Link
                    to="/trial"
                    className="text-white hover:text-blue-100 transition font-medium"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/trial"
                    className="bg-white text-blue-600 hover:bg-blue-50 px-6 py-2.5 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Content */}
      <div className="relative container mx-auto px-6 py-24 pb-32">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left Column */}
          <div className="space-y-8 text-white">
            <div className="inline-flex items-center space-x-2 bg-white bg-opacity-20 backdrop-blur-sm px-5 py-2.5 rounded-full text-sm font-semibold border border-white border-opacity-30">
              <Sparkles className="w-4 h-4" />
              <span>Free Trial - 3 Professional Reports Included</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight">
              Professional
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-purple-200">
                Disaster Recovery
              </span>
              <br />
              Reports in Minutes
            </h1>

            <p className="text-xl text-blue-100 leading-relaxed max-w-xl">
              Generate detailed, AI-powered restoration reports that save you hours of paperwork.
              Trusted by restoration professionals to deliver accurate cost estimates and comprehensive documentation.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <div className="bg-white p-1.5 rounded-xl shadow-2xl hover:shadow-blue-500/50 transition-all duration-300">
                {onShowGoogleOAuth ? (
                  <button
                    onClick={onShowGoogleOAuth}
                    className="flex items-center justify-center space-x-3 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-semibold transition-all duration-300"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Sign up with Google</span>
                  </button>
                ) : (
                  <Suspense fallback={
                    <button className="flex items-center justify-center space-x-3 px-6 py-3 bg-blue-500 text-white rounded-full font-semibold">
                      <span>Loading...</span>
                    </button>
                  }>
                    <GoogleLogin
                      onSuccess={handleGoogleLogin}
                      onError={() => console.error('Google Login Failed')}
                      theme="filled_blue"
                      size="large"
                      text="signup_with"
                      shape="pill"
                    />
                  </Suspense>
                )}
              </div>

              <button
                onClick={() => setIsVideoModalOpen(true)}
                className="group flex items-center justify-center space-x-3 px-8 py-4 bg-white bg-opacity-10 backdrop-blur-sm border-2 border-white border-opacity-30 rounded-xl text-white hover:bg-opacity-20 transition-all duration-300"
              >
                <div className="bg-white bg-opacity-20 p-2 rounded-full group-hover:bg-opacity-30 transition">
                  <Play className="w-5 h-5" />
                </div>
                <span className="font-semibold">Watch Demo</span>
              </button>
            </div>

            {/* Dev Login Button - Development Only */}
            {import.meta.env.DEV && onDevLogin && (
              <div className="pt-4">
                <button
                  onClick={onDevLogin}
                  className="flex items-center space-x-2 text-sm text-blue-200 hover:text-white transition-colors underline"
                >
                  <span>🔧</span>
                  <span>Dev Login (Skip OAuth - Screenshots Only)</span>
                </button>
                <p className="text-xs text-blue-200 opacity-75 mt-1">
                  Development mode only - bypasses Google OAuth for testing
                </p>
              </div>
            )}

            {/* Trust Indicators */}
            <div className="flex flex-wrap gap-6 text-sm text-blue-100 pt-6">
              <div className="flex items-center space-x-2">
                <div className="bg-green-400 bg-opacity-20 p-1 rounded-full">
                  <CheckCircle className="w-5 h-5 text-green-300" />
                </div>
                <span>7-day free trial</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="bg-green-400 bg-opacity-20 p-1 rounded-full">
                  <CheckCircle className="w-5 h-5 text-green-300" />
                </div>
                <span>No credit card needed</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="bg-green-400 bg-opacity-20 p-1 rounded-full">
                  <CheckCircle className="w-5 h-5 text-green-300" />
                </div>
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>

          {/* Right Column - Report Preview */}
          <HeroReportPreview />
        </div>
      </div>

      {/* Wave Divider */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 120" className="w-full h-auto">
          <path
            fill="#ffffff"
            d="M0,64L80,69.3C160,75,320,85,480,80C640,75,800,53,960,48C1120,43,1280,53,1360,58.7L1440,64L1440,120L1360,120C1280,120,1120,120,960,120C800,120,640,120,480,120C320,120,160,120,80,120L0,120Z"
          />
        </svg>
      </div>
    </header>
  );
});

HeroSection.displayName = 'HeroSection';

// Memoized Hero Report Preview
const HeroReportPreview = memo(() => (
  <div className="relative hidden md:block">
    <div className="relative">
      <div className="relative bg-white rounded-3xl shadow-2xl p-8 transform hover:scale-105 transition-all duration-500">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Water Damage Report</p>
                <p className="text-xs text-gray-500">Generated in 1.8 minutes</p>
              </div>
            </div>
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-3 py-1.5 rounded-full flex items-center space-x-1">
              <CheckCircle className="w-3 h-3" />
              <span>Complete</span>
            </span>
          </div>

          <div className="relative h-64 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-lg">
                  <FileText className="w-20 h-20 text-white mx-auto" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-blue-200 rounded-full w-48 mx-auto" />
                  <div className="h-3 bg-purple-200 rounded-full w-32 mx-auto" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">$8.5K</p>
              <p className="text-xs text-gray-500">Est. Cost</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">12</p>
              <p className="text-xs text-gray-500">Items</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">PDF</p>
              <p className="text-xs text-gray-500">Format</p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Elements */}
      <div className="absolute -top-6 -right-6 bg-white rounded-2xl shadow-xl p-4 transform rotate-6 hover:rotate-0 transition-all duration-300">
        <div className="flex items-center space-x-2">
          <Award className="w-5 h-5 text-yellow-500" />
          <span className="text-sm font-semibold text-gray-900">AI Verified</span>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-xl p-4 transform -rotate-6 hover:rotate-0 transition-all duration-300">
        <div className="flex items-center space-x-2">
          <Zap className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-semibold text-gray-900">Lightning Fast</span>
        </div>
      </div>
    </div>
  </div>
));

HeroReportPreview.displayName = 'HeroReportPreview';

// Memoized Features Section
const FeaturesSection = memo(() => {
  const features = useMemo(() => [
    {
      icon: Zap,
      title: "Lightning Fast Generation",
      description: "Create comprehensive disaster recovery reports in under 2 minutes. Our AI analyzes damage patterns and generates accurate cost estimates automatically.",
      gradient: "from-blue-500 to-indigo-600",
      bgGradient: "from-blue-50 to-indigo-50",
      borderColor: "border-blue-500"
    },
    {
      icon: Shield,
      title: "Advanced Fraud Detection",
      description: "7-layer fraud detection system ensures trial integrity. Device fingerprinting, IP analysis, and smart rate limiting protect against abuse.",
      gradient: "from-purple-500 to-pink-600",
      bgGradient: "from-purple-50 to-pink-50",
      borderColor: "border-purple-500"
    },
    {
      icon: Download,
      title: "Multiple Export Formats",
      description: "Export your reports as PDF or DOCX with professional formatting. Ready to share with clients, insurance companies, and contractors.",
      gradient: "from-green-500 to-emerald-600",
      bgGradient: "from-green-50 to-emerald-50",
      borderColor: "border-green-500"
    },
    {
      icon: TrendingUp,
      title: "Accurate Cost Estimates",
      description: "Our AI uses industry-standard pricing data and local market rates to provide accurate repair cost estimates you can trust.",
      gradient: "from-orange-500 to-red-600",
      bgGradient: "from-orange-50 to-red-50",
      borderColor: "border-orange-500"
    },
    {
      icon: FileText,
      title: "Professional Templates",
      description: "Choose from industry-standard templates for water damage, fire damage, mold remediation, and more. All customizable to your needs.",
      gradient: "from-cyan-500 to-blue-600",
      bgGradient: "from-cyan-50 to-blue-50",
      borderColor: "border-cyan-500"
    },
    {
      icon: Award,
      title: "Compliance Ready",
      description: "All reports meet industry standards and include required documentation for insurance claims and regulatory compliance.",
      gradient: "from-indigo-500 to-purple-600",
      bgGradient: "from-indigo-50 to-purple-50",
      borderColor: "border-indigo-500"
    }
  ], []);

  return (
    <section id="features" className="py-24 bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-6">
        <div className="text-center mb-20">
          <div className="inline-flex items-center space-x-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <Sparkles className="w-4 h-4" />
            <span>Powerful Features</span>
          </div>
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Everything You Need to
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              Streamline Your Workflow
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            RestoreAssist combines cutting-edge AI technology with professional templates to deliver
            accurate, comprehensive reports that meet industry standards.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
});

FeaturesSection.displayName = 'FeaturesSection';

// Memoized Feature Card
const FeatureCard = memo<{
  icon: any;
  title: string;
  description: string;
  gradient: string;
  bgGradient: string;
  borderColor: string;
}>(({ icon: Icon, title, description, gradient, bgGradient, borderColor }) => (
  <div className={`group relative bg-white p-8 rounded-2xl border-2 border-gray-100 hover:${borderColor} hover:shadow-2xl transition-all duration-300`}>
    <div className={`absolute inset-0 bg-gradient-to-br ${bgGradient} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
    <div className="relative">
      <div className={`w-14 h-14 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-4">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  </div>
));

FeatureCard.displayName = 'FeatureCard';

// Other memoized sections can be created similarly...

export const LandingPageOptimized: React.FC<LandingPageProps> = ({ onLoginSuccess, onDevLogin, onShowGoogleOAuth }) => {
  const navigate = useNavigate();
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setIsAuthenticated(!!token);

    // Disable Google One Tap
    const disableOneTap = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
    };

    disableOneTap();
    const interval = setInterval(disableOneTap, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <HeroSection
        isVideoModalOpen={isVideoModalOpen}
        setIsVideoModalOpen={setIsVideoModalOpen}
        isAuthenticated={isAuthenticated}
        onLoginSuccess={onLoginSuccess}
        onDevLogin={onDevLogin}
        onShowGoogleOAuth={onShowGoogleOAuth}
      />

      <FeaturesSection />

      {/* Other sections would be added here with similar memoization */}

      {/* Video Modal */}
      <VideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        videoId="dQw4w9WgXcQ"
        title="RestoreAssist Demo - See How It Works"
      />

      <style>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
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
      `}</style>
    </div>
  );
};