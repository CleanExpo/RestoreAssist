import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  TrendingUp
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

interface LandingPageProps {
  onGetStarted?: () => void;
  onLoginSuccess?: (googleCredential: string) => void;
  onDevLogin?: () => void;
  onShowGoogleOAuth?: () => void;
}

export function LandingPage({ onGetStarted, onLoginSuccess, onDevLogin, onShowGoogleOAuth }: LandingPageProps) {
  // Use the appropriate handler - onShowGoogleOAuth if provided, otherwise onGetStarted
  const handleGetStarted = (): void => {
    if (onShowGoogleOAuth) {
      onShowGoogleOAuth();
    } else if (onGetStarted) {
      onGetStarted();
    }
    // If neither is provided, this is a no-op (intentional for pages that don't need auth)
  };

  const navigate = useNavigate();
  const [isLoadingPricing, setIsLoadingPricing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const plans = getAllPlans();

  const handleSelectPlan = async (priceId: string, planName: string) => {
    setIsLoadingPricing(true);
    setCheckoutError(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

      const response = await fetch(`${apiUrl}/api/stripe/create-checkout-session`, {
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
                  onClick={onGetStarted}
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
          {/* TODO: Replace with actual RestoreAssist demo video ID */}
          <Card className="border-2 shadow-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute top-0 left-0 w-full h-full"
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ"
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
    </div>
  );
}
