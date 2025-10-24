import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import {
  Droplet,
  Flame,
  CloudRain,
  Waves,
  Biohazard,
  Shield,
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  ArrowRight,
  Sparkles,
  BarChart3,
  Users,
  Star,
  Zap,
  Award,
  TrendingUp,
  X,
  Mail,
  Eye,
  EyeOff,
  AlertTriangle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Logo, LogoCompact } from '../components/ui/logo';
import { WaterDamageIcon } from '../components/icons/WaterDamageIcon';
import { FireDamageIcon } from '../components/icons/FireDamageIcon';
import { StormDamageIcon } from '../components/icons/StormDamageIcon';
import { FloodDamageIcon } from '../components/icons/FloodDamageIcon';
import { MouldDamageIcon } from '../components/icons/MouldDamageIcon';
import { MainNavigation } from '../components/navigation/MainNavigation';
import { PricingCard } from '../components/pricing/PricingCard';
import { getAllPlans, getPriceId } from '../config/stripe';
import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { useOAuthConfig } from '../contexts/OAuthConfigContext';

interface LandingPageProps {
  onGetStarted?: () => void;
  onLoginSuccess?: (googleCredential: string) => Promise<void>;
  onDevLogin?: () => Promise<void>;
  onShowGoogleOAuth?: () => void;
}

export function LandingPage({ onGetStarted, onLoginSuccess, onDevLogin, onShowGoogleOAuth }: LandingPageProps) {
  const navigate = useNavigate();
  const [isLoadingPricing, setIsLoadingPricing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailSignup, setIsEmailSignup] = useState(true);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthState, setOauthState] = useState<string | null>(null);
  const [oauthNonce, setOauthNonce] = useState<string | null>(null);
  const oauthStateRef = useRef<string | null>(null);
  const plans = getAllPlans();
  const { config } = useOAuthConfig();

  // Generate secure OAuth state for CSRF protection
  useEffect(() => {
    // Generate state parameter using crypto.randomUUID() for CSRF protection
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      const state = window.crypto.randomUUID();
      const nonce = window.crypto.randomUUID();
      setOauthState(state);
      setOauthNonce(nonce);
      oauthStateRef.current = state;

      // Store state in sessionStorage for validation on callback
      sessionStorage.setItem('oauth_state', state);
      sessionStorage.setItem('oauth_nonce', nonce);

      // Clear state after 10 minutes for security
      const timer = setTimeout(() => {
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('oauth_nonce');
      }, 600000); // 10 minutes

      return () => clearTimeout(timer);
    }
  }, []);

  // Handle get started - show email auth modal
  const handleGetStarted = (): void => {
    setShowAuthModal(true);
    setShowEmailForm(true); // Always show email form now
    if (onGetStarted) {
      onGetStarted();
    }
  };

  const handleSelectPlan = async (priceId: string, planName: string) => {
    setIsLoadingPricing(true);
    setCheckoutError(null);

    try {
      const apiUrl = getApiBaseUrl();

      const response = await fetch(`${apiUrl}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          planName,
          successUrl: `${window.location.origin}/checkout/success`,
          cancelUrl: `${window.location.origin}`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      setCheckoutError(
        error instanceof Error
          ? error.message
          : 'Failed to start checkout. Please try again or contact support.'
      );
      setIsLoadingPricing(false);
    }
  };

  const handleWatchDemo = () => {
    // Scroll to the YouTube video section
    const videoSection = document.querySelector('#video-demo-section');
    if (videoSection) {
      videoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleScheduleDemo = () => {
    // Navigate to contact page
    navigate('/contact');
  };

  // Secure Google OAuth handler with CSRF protection
  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    // Security check: Verify OAuth state for CSRF protection
    const storedState = sessionStorage.getItem('oauth_state');
    if (!storedState || storedState !== oauthStateRef.current) {
      console.error('OAuth state mismatch - potential CSRF attack');
      setFormError('Authentication failed: Security validation error. Please refresh and try again.');
      return;
    }

    if (!credentialResponse.credential) {
      console.error('No credential received from Google');
      setFormError('Authentication failed: No credentials received from Google.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      // Clear sensitive OAuth state immediately after use
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('oauth_nonce');

      // Pass credential to parent handler with enhanced security context
      if (onLoginSuccess) {
        await onLoginSuccess(credentialResponse.credential);
      }

      // Success - modal will be closed by parent component
      setShowAuthModal(false);
    } catch (error) {
      console.error('Google authentication error:', error);

      // Enhanced error handling
      let errorMessage = 'Authentication failed. Please try again.';
      if (error instanceof Error) {
        // Sanitize error messages to prevent information leakage
        if (error.message.includes('network')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('token')) {
          errorMessage = 'Authentication token invalid. Please try again.';
        } else if (error.message.includes('expired')) {
          errorMessage = 'Authentication session expired. Please try again.';
        }
      }

      setFormError(errorMessage);

      // Regenerate OAuth state for retry
      const newState = window.crypto.randomUUID();
      setOauthState(newState);
      oauthStateRef.current = newState;
      sessionStorage.setItem('oauth_state', newState);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle OAuth errors (user cancellation, popup blocked, etc.)
  const handleGoogleError = () => {
    console.error('Google Login Failed');
    setFormError('Google authentication was cancelled or failed. Please try again.');

    // Regenerate OAuth state for retry
    if (window.crypto && window.crypto.randomUUID) {
      const newState = window.crypto.randomUUID();
      setOauthState(newState);
      oauthStateRef.current = newState;
      sessionStorage.setItem('oauth_state', newState);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      {/* Navigation */}
      <MainNavigation onGetStarted={handleGetStarted} />

      {/* Critical Value Propositions Banner */}
      <section className="border-b bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 backdrop-blur-sm">
        <div className="container py-12">
          <div className="grid md:grid-cols-3 gap-8 items-center">
            {/* 3 Free Trial Reports */}
            <div className="flex flex-col items-center text-center space-y-3 p-6 rounded-xl bg-background/50 border-2 border-primary/30 hover:border-primary/50 transition-all hover:scale-105 shadow-lg hover:shadow-xl">
              <div className="p-4 rounded-full bg-gradient-to-br from-primary to-primary/70 shadow-lg">
                <FileText className="h-10 w-10 text-primary-foreground" />
              </div>
              <div>
                <h3 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  3 FREE Reports
                </h3>
                <p className="text-sm text-muted-foreground mt-2 font-medium">
                  No credit card required
                </p>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                Experience the power of AI-driven damage assessment with your complimentary trial reports
              </p>
            </div>

            {/* Australian First Uniformed System */}
            <div className="flex flex-col items-center text-center space-y-3 p-6 rounded-xl bg-background/50 border-2 border-green-500/30 hover:border-green-500/50 transition-all hover:scale-105 shadow-lg hover:shadow-xl">
              <div className="p-4 rounded-full bg-gradient-to-br from-green-600 to-green-500 shadow-lg">
                <Award className="h-10 w-10 text-white" />
              </div>
              <div>
                <h3 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">
                  Australian First
                </h3>
                <p className="text-sm text-muted-foreground mt-2 font-medium">
                  Uniformed Reporting System
                </p>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                Standardised, compliant reports across all Australian states and damage types
              </p>
            </div>

            {/* Massive Cost Savings */}
            <div className="flex flex-col items-center text-center space-y-3 p-6 rounded-xl bg-background/50 border-2 border-blue-500/30 hover:border-blue-500/50 transition-all hover:scale-105 shadow-lg hover:shadow-xl">
              <div className="p-4 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg">
                <DollarSign className="h-10 w-10 text-white" />
              </div>
              <div>
                <h3 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
                  Massive Savings
                </h3>
                <p className="text-sm text-muted-foreground mt-2 font-medium">
                  Up to 95% time reduction
                </p>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                Slash report writing time from hours to seconds while maintaining professional quality
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Hero Section - Enhanced */}
      <section className="relative container py-24 lg:py-32 overflow-hidden">
        {/* Animated Background Gradient */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8 animate-fade-in">
            <Badge variant="secondary" className="text-sm shadow-sm">
              <Sparkles className="mr-2 h-3 w-3" />
              Powered by Claude Opus 4
            </Badge>
            <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text">
              AI-Powered Damage Assessment for{' '}
              <span className="text-primary bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Australian Properties
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-[600px] leading-relaxed">
              Generate professional, compliant damage reports in <span className="font-bold text-primary">10-15 seconds</span>. Built specifically for the Australian restoration industry with NCC 2022 compliance.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={handleGetStarted}
                size="lg"
                className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 bg-gradient-to-r from-primary to-primary/80"
              >
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                onClick={handleWatchDemo}
                variant="outline"
                size="lg"
                className="text-lg shadow-md hover:shadow-lg transition-all hover:scale-105"
              >
                Watch Demo <Zap className="ml-2 h-5 w-5" />
              </Button>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-border/50">
              <div className="flex flex-col space-y-1">
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">10-15s</div>
                <div className="text-sm text-muted-foreground">Report Generation</div>
              </div>
              <div className="flex flex-col space-y-1">
                <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">100%</div>
                <div className="text-sm text-muted-foreground">NCC Compliant</div>
              </div>
              <div className="flex flex-col space-y-1">
                <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">8</div>
                <div className="text-sm text-muted-foreground">States Covered</div>
              </div>
            </div>
          </div>

          {/* Enhanced Preview Card */}
          <div className="relative animate-slide-in-right">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 rounded-3xl blur-3xl animate-pulse"></div>
            <Card className="relative backdrop-blur-sm bg-card/95 border-2 border-primary/20 shadow-2xl hover:shadow-primary/20 transition-all duration-300 hover:scale-[1.02]">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    Sample Report Preview
                  </CardTitle>
                  <Badge variant="secondary" className="shadow-sm">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    Live Demo
                  </Badge>
                </div>
                <CardDescription className="text-base">Professional damage assessment in seconds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3 p-4 rounded-lg bg-secondary/30 backdrop-blur-sm">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground font-medium">Property</span>
                    <span className="font-semibold">123 Main St, Sydney NSW</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground font-medium">Damage Type</span>
                    <Badge variant="secondary" className="shadow-sm bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      <Droplet className="mr-1 h-3 w-3" />
                      Water Damage
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border/50">
                    <span className="text-muted-foreground font-medium">Estimated Cost</span>
                    <span className="font-bold text-2xl bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                      $8,750 AUD
                    </span>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
                    <Award className="h-4 w-4" />
                    <span>Compliance & Standards</span>
                  </div>
                  <div className="space-y-2 pl-6">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>NCC 2022 Compliant</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>NSW Building Code Verified</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>Insurance Ready Format</span>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleGetStarted}
                  className="w-full shadow-md hover:shadow-lg transition-all hover:scale-105"
                  size="lg"
                >
                  Generate Your Report <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* Damage Types - Enhanced */}
      <section className="container py-20 border-t">
        <div className="text-center mb-16 space-y-4">
          <Badge variant="secondary" className="text-sm shadow-sm">
            <Shield className="mr-2 h-3 w-3" />
            Damage Types Coverage
          </Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Comprehensive Coverage for{' '}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              All Damage Types
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-[700px] mx-auto leading-relaxed">
            Expert AI-powered assessment for water, fire, storm, flood, and mould damage across Australia
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {[
            { icon: WaterDamageIcon, title: 'Water Damage', range: '$2K - $15K+', color: 'from-blue-500/20 to-blue-600/20', link: '/features/water-damage' },
            { icon: FireDamageIcon, title: 'Fire Damage', range: '$10K - $100K+', color: 'from-orange-500/20 to-red-600/20', link: '/features/fire-damage' },
            { icon: StormDamageIcon, title: 'Storm Damage', range: '$5K - $50K+', color: 'from-gray-500/20 to-slate-600/20', link: '/features/storm-damage' },
            { icon: FloodDamageIcon, title: 'Flood Damage', range: '$15K - $150K+', color: 'from-cyan-500/20 to-blue-700/20', link: '/features/flood-mould' },
            { icon: MouldDamageIcon, title: 'Mould Damage', range: '$3K - $30K+', color: 'from-green-500/20 to-emerald-600/20', link: '/features/flood-mould' },
          ].map((damage) => (
            <Link
              key={damage.title}
              to={damage.link}
              className="block"
            >
              <Card
                className="text-center hover:shadow-xl transition-all duration-300 hover:scale-105 hover:-translate-y-1 border-2 backdrop-blur-sm group cursor-pointer"
              >
              <CardHeader className="space-y-4">
                <div className={`mx-auto flex justify-center p-4 rounded-2xl bg-gradient-to-br ${damage.color} group-hover:scale-110 transition-transform duration-300`}>
                  <damage.icon size={64} />
                </div>
                <CardTitle className="text-lg font-bold">{damage.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground font-medium">Typical Range</p>
                <p className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  {damage.range}
                </p>
              </CardContent>
            </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Features - Enhanced Grid */}
      <section className="container py-20 border-t">
        <div className="text-center mb-16 space-y-4">
          <Badge variant="secondary" className="text-sm shadow-sm">
            <Sparkles className="mr-2 h-3 w-3" />
            Platform Features
          </Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Everything You Need in{' '}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              One Platform
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-[700px] mx-auto leading-relaxed">
            Powerful features designed for restoration professionals
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Sparkles,
              title: 'AI-Powered Reports',
              description: 'Claude Opus 4 generates professional reports with detailed scope of work and cost estimates in 10-15 seconds.',
              gradient: 'from-purple-500/10 to-pink-500/10',
              link: '/features/ai-reports'
            },
            {
              icon: Shield,
              title: 'NCC 2022 Compliant',
              description: 'Every report automatically includes relevant NCC 2022 compliance notes and state-specific building regulations.',
              gradient: 'from-green-500/10 to-emerald-500/10',
              link: '/features/building-codes'
            },
            {
              icon: DollarSign,
              title: 'Accurate Pricing',
              description: 'Market-accurate 2024 Australian pricing database with realistic labour rates and material costs.',
              gradient: 'from-yellow-500/10 to-orange-500/10',
              link: '/features/cost-estimation'
            },
            {
              icon: FileText,
              title: 'Professional Output',
              description: 'Industry-standard documentation with itemised estimates, scope of work, and Authority to Proceed.',
              gradient: 'from-blue-500/10 to-cyan-500/10',
              link: '/features/templates'
            },
            {
              icon: Clock,
              title: 'Lightning Fast',
              description: 'Generate comprehensive damage assessments in seconds instead of hours of manual work.',
              gradient: 'from-red-500/10 to-pink-500/10',
              link: '/features/batch-processing'
            },
            {
              icon: BarChart3,
              title: 'Analytics & Tracking',
              description: 'Track all your reports, monitor statistics, and export data for insurance claims.',
              gradient: 'from-indigo-500/10 to-purple-500/10',
              link: '/features/analytics'
            },
          ].map((feature) => (
            <Link
              key={feature.title}
              to={feature.link}
              className="block"
            >
              <Card
                className="hover:shadow-xl transition-all duration-300 hover:scale-105 hover:-translate-y-1 border backdrop-blur-sm group cursor-pointer h-full"
              >
              <CardHeader className="space-y-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${feature.gradient} w-fit group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl font-bold">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* YouTube Video Demo */}
      <section id="video-demo-section" className="container py-20 border-t">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <Badge variant="secondary" className="text-sm shadow-sm">
              <Zap className="mr-2 h-3 w-3" />
              Watch RestoreAssist in Action
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              See How It Works
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                In Under 60 Seconds
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Watch a complete demonstration of generating professional damage reports with AI
            </p>
          </div>

          {/* YouTube Video Embed */}
          {/* RestoreAssist Official Demo Video */}
          <Card className="border-2 shadow-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute top-0 left-0 w-full h-full"
                  src="https://www.youtube.com/embed/SOr_k8D2C0I"
                  title="RestoreAssist Demo - See how to generate professional damage reports with AI"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  aria-label="RestoreAssist demonstration video showing the complete workflow"
                ></iframe>
              </div>
            </CardContent>
          </Card>

          {/* Optional: Video Description */}
          <div className="mt-8 text-center">
            <p className="text-muted-foreground">
              Learn how RestoreAssist generates IICRC-compliant reports with accurate cost estimates in seconds
            </p>
          </div>
        </div>
      </section>

      {/* States Coverage - Modern Grid */}
      <section className="container py-20 border-t bg-secondary/10">
        <div className="text-center mb-16 space-y-4">
          <Badge variant="secondary" className="text-sm shadow-sm">
            Australia-Wide
          </Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Complete Coverage Across{' '}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Australia
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-[700px] mx-auto leading-relaxed">
            State-specific compliance and regulations for all Australian territories
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { code: 'NSW', name: 'New South Wales', gradient: 'from-blue-500/10 to-blue-600/10' },
            { code: 'VIC', name: 'Victoria', gradient: 'from-purple-500/10 to-purple-600/10' },
            { code: 'QLD', name: 'Queensland', gradient: 'from-orange-500/10 to-red-600/10' },
            { code: 'WA', name: 'Western Australia', gradient: 'from-yellow-500/10 to-orange-600/10' },
            { code: 'SA', name: 'South Australia', gradient: 'from-red-500/10 to-pink-600/10' },
            { code: 'TAS', name: 'Tasmania', gradient: 'from-green-500/10 to-emerald-600/10' },
            { code: 'ACT', name: 'Australian Capital Territory', gradient: 'from-cyan-500/10 to-blue-600/10' },
            { code: 'NT', name: 'Northern Territory', gradient: 'from-amber-500/10 to-orange-600/10' },
          ].map((state) => (
            <div
              key={state.code}
              className={`p-6 border-2 rounded-xl text-center hover:shadow-lg transition-all duration-300 hover:scale-105 bg-gradient-to-br ${state.gradient} backdrop-blur-sm group cursor-pointer`}
            >
              <div className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent group-hover:scale-110 transition-transform">
                {state.code}
              </div>
              <div className="text-sm text-muted-foreground mt-2 font-medium">
                {state.name}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container py-20 border-t">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <Badge variant="secondary" className="text-sm shadow-sm">
              <DollarSign className="mr-2 h-3 w-3" />
              Simple, Transparent Pricing
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              Choose Your Plan
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Start Free, Scale As You Grow
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              No hidden fees. Cancel anytime. All plans include NCC 2022 compliance.
            </p>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid md:grid-cols-3 gap-8 mt-16">
            {plans.map((plan, index) => (
              <PricingCard
                key={index}
                plan={plan}
                priceId={
                  index === 0
                    ? getPriceId('freeTrial')
                    : index === 1
                    ? getPriceId('monthly')
                    : getPriceId('yearly')
                }
                onSelectPlan={handleSelectPlan}
                isLoading={isLoadingPricing}
              />
            ))}
          </div>

          {/* Checkout Error Message */}
          {checkoutError && (
            <div
              className="mt-8 p-4 rounded-lg border-2 border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Checkout Error</h3>
                  <p className="text-sm">{checkoutError}</p>
                </div>
                <button
                  onClick={() => setCheckoutError(null)}
                  className="flex-shrink-0 ml-auto hover:opacity-70 transition-opacity"
                  aria-label="Dismiss error message"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Money-Back Guarantee */}
          <div className="mt-16 text-center">
            <Card className="max-w-2xl mx-auto border-2 border-green-500/20 bg-green-500/5">
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Shield className="h-8 w-8 text-green-600" />
                  <h3 className="text-2xl font-bold">30-Day Money-Back Guarantee</h3>
                </div>
                <p className="text-muted-foreground">
                  Try RestoreAssist risk-free. If you're not completely satisfied within 30 days,
                  we'll refund your payment—no questions asked.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials - Enhanced Cards */}
      <section className="container py-20 border-t">
        <div className="text-center mb-16 space-y-4">
          <Badge variant="secondary" className="text-sm shadow-sm">
            <Users className="mr-2 h-3 w-3" />
            Testimonials
          </Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Trusted by{' '}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Restoration Professionals
            </span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              name: 'Sarah Mitchell',
              role: 'Restoration Manager, Sydney',
              content: 'RestoreAssist has cut our report generation time from hours to minutes. The NCC compliance checks are invaluable.',
              rating: 5,
              gradient: 'from-blue-500/5 to-cyan-500/5'
            },
            {
              name: 'James Chen',
              role: 'Insurance Assessor, Melbourne',
              content: 'The accuracy of cost estimates is impressive. Reports are professional and always accepted by insurers.',
              rating: 5,
              gradient: 'from-purple-500/5 to-pink-500/5'
            },
            {
              name: 'Lisa Anderson',
              role: 'Property Manager, Brisbane',
              content: 'Finally, a tool that understands Australian building standards. The state-specific compliance notes save us so much time.',
              rating: 5,
              gradient: 'from-green-500/5 to-emerald-500/5'
            },
          ].map((testimonial) => (
            <Card
              key={testimonial.name}
              className={`hover:shadow-xl transition-all duration-300 hover:scale-105 hover:-translate-y-1 bg-gradient-to-br ${testimonial.gradient} backdrop-blur-sm border-2`}
            >
              <CardHeader className="space-y-4">
                <div className="flex gap-1">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-yellow-500 text-yellow-500" />
                  ))}
                </div>
                <CardDescription className="italic text-base leading-relaxed">
                  "{testimonial.content}"
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA - Enhanced */}
      <section className="container py-20 border-t">
        <Card className="relative overflow-hidden border-2 border-primary/20 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background"></div>
          <CardContent className="relative p-12 text-center space-y-8">
            <div className="space-y-4">
              <Badge variant="secondary" className="text-sm shadow-md">
                <Sparkles className="mr-2 h-3 w-3" />
                Start Your Free Trial Today
              </Badge>
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                Ready to Transform Your{' '}
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Damage Assessments?
                </span>
              </h2>
              <p className="text-xl text-muted-foreground max-w-[700px] mx-auto leading-relaxed">
                Join Australian restoration professionals using AI to generate professional, compliant reports in seconds.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={handleGetStarted}
                size="lg"
                className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 bg-gradient-to-r from-primary to-primary/80"
              >
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                onClick={handleScheduleDemo}
                variant="outline"
                size="lg"
                className="text-lg shadow-md hover:shadow-lg transition-all hover:scale-105"
              >
                Schedule Demo <Zap className="ml-2 h-5 w-5" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-8">
              <div className="space-y-2">
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">3 Free</div>
                <div className="text-sm text-muted-foreground">Trial Reports</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">No Card</div>
                <div className="text-sm text-muted-foreground">Required</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">24/7</div>
                <div className="text-sm text-muted-foreground">Support</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer - Enhanced */}
      <footer className="border-t bg-secondary/20 backdrop-blur-sm">
        <div className="container py-16">
          <div className="grid md:grid-cols-4 gap-12">
            <div className="space-y-4">
              <Logo size={60} variant="icon" />
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                AI-powered damage assessment platform for Australian restoration professionals. Built with Claude Opus 4.
              </p>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-lg">Product</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/features/ai-reports" className="hover:text-primary transition-colors">Features</Link></li>
                <li><Link to="/pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
                <li><Link to="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link></li>
                <li><Link to="/features/analytics" className="hover:text-primary transition-colors">Analytics</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-lg">Company</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/about" className="hover:text-primary transition-colors">About</Link></li>
                <li><Link to="/features/ai-reports" className="hover:text-primary transition-colors">How It Works</Link></li>
                <li><Link to="/features/iicrc-compliance" className="hover:text-primary transition-colors">Compliance</Link></li>
                <li><Link to="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-lg">Legal</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy</Link></li>
                <li><Link to="/terms" className="hover:text-primary transition-colors">Terms</Link></li>
                <li><Link to="/refunds" className="hover:text-primary transition-colors">Refunds</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-12 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2025 RestoreAssist. All rights reserved. Powered by Claude Opus 4.</p>
          </div>
        </div>
      </footer>

      {/* Google OAuth Modal */}
      {showAuthModal && onLoginSuccess && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            // Close modal when clicking backdrop
            if (e.target === e.currentTarget) {
              setShowAuthModal(false);
            }
          }}
        >
          <div className="bg-background rounded-2xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in zoom-in duration-300">
            {/* Close button */}
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-accent transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Content */}
            <div className="text-center space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Welcome to RestoreAssist</h2>
                <p className="text-muted-foreground">
                  Sign in with your Google account to start your free trial
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-3 text-left bg-secondary/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">3 free trial reports - no credit card required</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Generate professional reports in 10-15 seconds</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">NCC 2022 compliant reports for all Australian states</span>
                </div>
              </div>

              {/* Google Login Button - Only show if OAuth is fully configured */}
              {config.isValid && !showEmailForm && (
                <>
                  <div className="flex justify-center">
                    <GoogleLogin
                      onSuccess={handleGoogleLogin}
                      onError={handleGoogleError}
                      theme="filled_blue"
                      size="large"
                      text="signup_with"
                      shape="pill"
                      useOneTap={false}
                      auto_select={false}
                      context="signin"
                      ux_mode="popup"
                      itp_support={false}
                      state_cookie_domain={window.location.hostname}
                      hosted_domain={undefined}
                      login_hint={undefined}
                      prompt_parent_id={undefined}
                      nonce={oauthNonce || undefined}
                      state={oauthState || undefined}
                    />
                  </div>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>

                  {/* Email/Password Option */}
                  <Button
                    onClick={() => setShowEmailForm(true)}
                    variant="outline"
                    className="w-full"
                    size="lg"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Continue with Email
                  </Button>
                </>
              )}

              {/* Email/Password Form - Show by default if Google OAuth not configured */}
              {(!config.isValid || showEmailForm) && (
                <div className="space-y-4">
                  {showEmailForm && (
                    <button
                      onClick={() => setShowEmailForm(false)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Back to Google Sign In
                    </button>
                  )}

                  <div className="space-y-3">
                    {/* Form-level error */}
                    {formError && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-sm">
                        {formError}
                      </div>
                    )}

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium mb-1">
                        Email Address
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setEmailError('');
                        }}
                        placeholder="you@example.com"
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground ${
                          emailError ? 'border-red-500' : 'border-border'
                        }`}
                      />
                      {emailError && (
                        <p className="text-xs text-red-500 mt-1">{emailError}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="password" className="block text-sm font-medium mb-1">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setPasswordError('');
                          }}
                          placeholder="••••••••"
                          className={`w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground ${
                            passwordError ? 'border-red-500' : 'border-border'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {passwordError && (
                        <p className="text-xs text-red-500 mt-1">{passwordError}</p>
                      )}
                      {isEmailSignup && !passwordError && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Min 8 characters, one uppercase, one lowercase, one number
                        </p>
                      )}
                    </div>

                    <Button
                      onClick={async () => {
                        // Clear previous errors
                        setEmailError('');
                        setPasswordError('');
                        setFormError('');

                        // Validate email
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!email || !emailRegex.test(email)) {
                          setEmailError('Please enter a valid email address');
                          return;
                        }

                        // Validate password
                        const passwordErrors: string[] = [];
                        if (!password || password.length < 8) {
                          passwordErrors.push('at least 8 characters');
                        }
                        if (!/[A-Z]/.test(password)) {
                          passwordErrors.push('one uppercase letter');
                        }
                        if (!/[a-z]/.test(password)) {
                          passwordErrors.push('one lowercase letter');
                        }
                        if (!/[0-9]/.test(password)) {
                          passwordErrors.push('one number');
                        }

                        if (passwordErrors.length > 0) {
                          setPasswordError(`Password must contain ${passwordErrors.join(', ')}`);
                          return;
                        }

                        // Submit form
                        setIsSubmitting(true);

                        try {
                          const apiUrl = getApiBaseUrl();
                          const endpoint = isEmailSignup ? '/trial-auth/email-signup' : '/trial-auth/email-login';

                          const response = await fetch(`${apiUrl}${endpoint}`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              email,
                              password,
                              ipAddress: undefined, // Let backend detect
                              userAgent: navigator.userAgent,
                            }),
                          });

                          const data = await response.json();

                          if (!response.ok) {
                            setFormError(data.error || 'Authentication failed. Please try again.');
                            setIsSubmitting(false);
                            return;
                          }

                          // Store tokens in localStorage
                          if (data.tokens?.accessToken) {
                            localStorage.setItem('accessToken', data.tokens.accessToken);
                          }
                          if (data.tokens?.refreshToken) {
                            localStorage.setItem('refreshToken', data.tokens.refreshToken);
                          }
                          if (data.sessionToken) {
                            localStorage.setItem('sessionToken', data.sessionToken);
                          }

                          // Store user info
                          if (data.user) {
                            localStorage.setItem('user', JSON.stringify(data.user));
                          }

                          // Close modal
                          setShowAuthModal(false);

                          // Redirect to dashboard
                          navigate('/dashboard');
                        } catch (error) {
                          console.error('Email auth error:', error);
                          setFormError('An error occurred. Please try again.');
                          setIsSubmitting(false);
                        }
                      }}
                      className="w-full"
                      size="lg"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Please wait...' : (isEmailSignup ? 'Sign Up with Email' : 'Sign In with Email')}
                    </Button>

                    <button
                      onClick={() => setIsEmailSignup(!isEmailSignup)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center"
                    >
                      {isEmailSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                    </button>
                  </div>

                  {!config.isValid && (
                    <div className="text-xs text-muted-foreground bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                      <strong>Note:</strong> Google Sign In is currently unavailable. Email/password authentication is coming soon.
                    </div>
                  )}
                </div>
              )}

              {/* Dev Login (Development Only) */}
              {!import.meta.env.PROD && onDevLogin && (
                <button
                  onClick={async () => {
                    console.log('🔵 Dev Login button clicked - closing modal and triggering authentication');
                    setShowAuthModal(false);

                    // Small delay to ensure modal closes before navigation
                    await new Promise(resolve => setTimeout(resolve, 50));

                    console.log('🔵 Calling onDevLogin...');
                    await onDevLogin();
                    console.log('🔵 onDevLogin completed');
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  🔧 Dev Login (Skip OAuth - Development Only)
                </button>
              )}

              {/* Privacy Notice */}
              <p className="text-xs text-muted-foreground">
                By signing in, you agree to our{' '}
                <Link to="/terms" className="underline hover:text-foreground">Terms of Service</Link>
                {' '}and{' '}
                <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
