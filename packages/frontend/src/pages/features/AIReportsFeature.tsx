import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Clock, FileText, CheckCircle, Zap, Shield, Award, TrendingUp, Brain, Cpu, Database } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export function AIReportsFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-indigo-700 to-blue-800 text-white">
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
        </div>

        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 shadow-lg">
              <Sparkles className="mr-2 h-4 w-4" />
              Powered by Claude Opus 4
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              One Uniformed Method
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-purple-200">
                For All Reporting
              </span>
            </h1>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
              The Australian property restoration industry's first standardised system for reporting, scoping, and estimating.
              Generate comprehensive, compliant reports in 10-15 seconds—the same way, every time.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
                <Link to="/">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg bg-white/10 border-white/30 hover:bg-white/20 text-white">
                <Link to="/features/templates">
                  View Report Templates
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <Badge variant="secondary" className="shadow-sm">
              <Brain className="mr-2 h-4 w-4" />
              The Technology Behind RestoreAssist
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              How AI Generates
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Professional Reports
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <Card className="border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-4">
                  <Cpu className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">1. Data Input</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-3">
                <p>
                  You provide damage details through our intuitive form: property information,
                  damage type, affected areas, severity, and on-site observations.
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="font-semibold">~2 minutes input time</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-4">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">2. AI Processing</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-3">
                <p>
                  Claude Opus 4 analyzes your input against IICRC standards, Australian building codes,
                  state regulations, and 2024 market pricing data.
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="font-semibold">10-15 seconds processing</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">3. Report Output</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-3">
                <p>
                  Receive a comprehensive, professionally formatted report with itemised scope,
                  cost estimates, compliance notes, and Authority to Proceed.
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="font-semibold">Ready for insurance submission</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* What's Included in Reports */}
      <section className="container py-20 border-t">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <Badge variant="secondary" className="shadow-sm">
              <FileText className="mr-2 h-4 w-4" />
              Comprehensive Documentation
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              Every Report Includes
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: CheckCircle,
                title: 'Property & Claim Details',
                description: 'Complete property information, claim number, date of loss, insurance details, and contact information organised professionally.',
                color: 'from-blue-500/10 to-blue-600/10'
              },
              {
                icon: FileText,
                title: 'Detailed Scope of Work',
                description: 'Itemised breakdown of all restoration tasks, materials required, equipment needed, and estimated labour hours.',
                color: 'from-purple-500/10 to-purple-600/10'
              },
              {
                icon: DollarSign,
                title: 'Accurate Cost Estimates',
                description: '2024 Australian market pricing with materials, labour, equipment costs, GST calculations, and payment milestone structure.',
                color: 'from-green-500/10 to-green-600/10'
              },
              {
                icon: Shield,
                title: 'Compliance Documentation',
                description: 'IICRC standard references (S500, S520), NCC 2022 building codes, state-specific regulations, and safety protocols.',
                color: 'from-orange-500/10 to-orange-600/10'
              },
              {
                icon: Award,
                title: 'Professional Formatting',
                description: 'Industry-standard layout with company branding, executive summary, technical specifications, and terms & conditions.',
                color: 'from-indigo-500/10 to-indigo-600/10'
              },
              {
                icon: TrendingUp,
                title: 'Authority to Proceed',
                description: 'Ready-to-sign authorisation section with clear payment terms, project timeline, and approval signatures.',
                color: 'from-pink-500/10 to-pink-600/10'
              }
            ].map((item) => (
              <Card key={item.title} className={`border-2 hover:shadow-lg transition-all bg-gradient-to-br ${item.color}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  {item.description}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* AI Training & Data */}
      <section className="container py-20 border-t bg-secondary/10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <Badge variant="secondary" className="shadow-sm">
              <Database className="mr-2 h-4 w-4" />
              Specialized Knowledge Base
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              Built on Industry
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Expertise
              </span>
            </h2>
          </div>

          <Card className="border-2 shadow-xl">
            <CardContent className="p-8 space-y-6">
              <div className="space-y-4">
                <h3 className="text-2xl font-bold">Claude Opus 4 is trained on:</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">IICRC Standards</div>
                      <div className="text-sm text-muted-foreground">S500 (Water), S520 (Mould), S800 (Fire)</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Australian Standards</div>
                      <div className="text-sm text-muted-foreground">AS 1851, AS 3959, Building Code of Australia</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">State Regulations</div>
                      <div className="text-sm text-muted-foreground">NSW, VIC, QLD, WA, SA, TAS, ACT, NT codes</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">2024 Market Pricing</div>
                      <div className="text-sm text-muted-foreground">Current Australian labour, materials, equipment costs</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Insurance Requirements</div>
                      <div className="text-sm text-muted-foreground">Standard documentation formats and compliance needs</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">25+ Years Experience</div>
                      <div className="text-sm text-muted-foreground">Real-world restoration industry knowledge</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t">
                <p className="text-muted-foreground italic">
                  This specialised training ensures every generated report aligns with industry best practices,
                  regulatory requirements, and professional standards—providing a reliable foundation for your business.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20 border-t">
        <Card className="relative overflow-hidden border-2 border-primary/20 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10"></div>
          <CardContent className="relative p-12 text-center space-y-8">
            <div className="space-y-4">
              <Badge variant="secondary" className="text-sm shadow-md">
                <Sparkles className="mr-2 h-3 w-3" />
                Try AI-Powered Reports Today
              </Badge>
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                Ready to Generate Your First
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                  Professional Report?
                </span>
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Join Australian restoration professionals using AI to create comprehensive reports in seconds instead of hours.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
                <Link to="/">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg shadow-md hover:shadow-lg transition-all">
                <Link to="/features/water-damage">
                  View Sample Reports
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

const DollarSign = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="1" x2="12" y2="23"></line>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
  </svg>
);
