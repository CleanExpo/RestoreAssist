import React from 'react';
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
  Star
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { Logo, LogoCompact } from '../components/ui/logo';
import { WaterDamageIcon } from '../components/icons/WaterDamageIcon';
import { FireDamageIcon } from '../components/icons/FireDamageIcon';
import { StormDamageIcon } from '../components/icons/StormDamageIcon';
import { FloodDamageIcon } from '../components/icons/FloodDamageIcon';
import { MouldDamageIcon } from '../components/icons/MouldDamageIcon';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <LogoCompact />
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm">Features</Button>
            <Button variant="ghost" size="sm">Pricing</Button>
            <Button variant="ghost" size="sm">About</Button>
            <ThemeToggle />
            <Button onClick={onGetStarted} size="sm">
              Get Started <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <Badge variant="secondary" className="text-sm">
              <Sparkles className="mr-2 h-3 w-3" />
              Powered by Claude AI
            </Badge>
            <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
              AI-Powered Damage Assessment for{' '}
              <span className="text-primary">Australian Properties</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-[600px]">
              Generate professional, compliant damage reports in seconds. Built specifically for the Australian restoration industry with NCC 2022 compliance.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={onGetStarted} size="lg" className="text-lg">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="text-lg">
                Watch Demo
              </Button>
            </div>
            <div className="flex items-center gap-8 pt-4">
              <div className="flex flex-col">
                <div className="text-2xl font-bold">10-15s</div>
                <div className="text-sm text-muted-foreground">Report Generation</div>
              </div>
              <div className="flex flex-col">
                <div className="text-2xl font-bold">100%</div>
                <div className="text-sm text-muted-foreground">NCC Compliant</div>
              </div>
              <div className="flex flex-col">
                <div className="text-2xl font-bold">8</div>
                <div className="text-sm text-muted-foreground">States Supported</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-3xl blur-3xl"></div>
            <Card className="relative">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Sample Report Preview
                </CardTitle>
                <CardDescription>Professional damage assessment in seconds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Property</span>
                    <span className="font-medium">123 Main St, Sydney NSW</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Damage Type</span>
                    <Badge variant="secondary">Water Damage</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Cost</span>
                    <span className="font-bold text-lg">$8,750 AUD</span>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>NCC 2022 Compliant</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>NSW Building Code</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>Insurance Ready</span>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={onGetStarted} className="w-full">
                  Generate Your Report <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* Damage Types */}
      <section className="container py-20 border-t">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">Damage Types</Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
            Comprehensive Coverage for All Damage Types
          </h2>
          <p className="text-muted-foreground mt-4 max-w-[600px] mx-auto">
            Expert assessment for water, fire, storm, flood, and mould damage across Australia
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {/* Water Damage - Custom Icon */}
          <Card className="text-center hover:shadow-lg transition-shadow border-2">
            <CardHeader>
              <div className="mx-auto flex justify-center">
                <WaterDamageIcon size={80} />
              </div>
              <CardTitle className="text-lg mt-3">Water Damage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Typical Range</p>
              <p className="text-lg font-bold">$2K - $15K+</p>
            </CardContent>
          </Card>

          {/* Fire Damage - Custom Icon */}
          <Card className="text-center hover:shadow-lg transition-shadow border-2">
            <CardHeader>
              <div className="mx-auto flex justify-center">
                <FireDamageIcon size={80} />
              </div>
              <CardTitle className="text-lg mt-3">Fire Damage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Typical Range</p>
              <p className="text-lg font-bold">$10K - $100K+</p>
            </CardContent>
          </Card>

          {/* Storm Damage - Custom Icon */}
          <Card className="text-center hover:shadow-lg transition-shadow border-2">
            <CardHeader>
              <div className="mx-auto flex justify-center">
                <StormDamageIcon size={80} />
              </div>
              <CardTitle className="text-lg mt-3">Storm Damage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Typical Range</p>
              <p className="text-lg font-bold">$5K - $50K+</p>
            </CardContent>
          </Card>

          {/* Flood Damage - Custom Icon */}
          <Card className="text-center hover:shadow-lg transition-shadow border-2">
            <CardHeader>
              <div className="mx-auto flex justify-center">
                <FloodDamageIcon size={80} />
              </div>
              <CardTitle className="text-lg mt-3">Flood Damage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Typical Range</p>
              <p className="text-lg font-bold">$15K - $150K+</p>
            </CardContent>
          </Card>

          {/* Mould Damage - Custom Icon */}
          <Card className="text-center hover:shadow-lg transition-shadow border-2">
            <CardHeader>
              <div className="mx-auto flex justify-center">
                <MouldDamageIcon size={80} />
              </div>
              <CardTitle className="text-lg mt-3">Mould Damage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Typical Range</p>
              <p className="text-lg font-bold">$3K - $30K+</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features */}
      <section className="container py-20 border-t bg-secondary/20">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">Features</Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
            Everything You Need in One Platform
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: Sparkles,
              title: 'AI-Powered Reports',
              description: 'Claude Opus 4 generates professional reports with detailed scope of work and cost estimates in 10-15 seconds.'
            },
            {
              icon: Shield,
              title: 'NCC 2022 Compliant',
              description: 'Every report automatically includes relevant NCC 2022 compliance notes and state-specific building regulations.'
            },
            {
              icon: DollarSign,
              title: 'Accurate Pricing',
              description: 'Market-accurate 2024 Australian pricing database with realistic labour rates and material costs.'
            },
            {
              icon: FileText,
              title: 'Professional Output',
              description: 'Industry-standard documentation with itemised estimates, scope of work, and Authority to Proceed.'
            },
            {
              icon: Clock,
              title: 'Lightning Fast',
              description: 'Generate comprehensive damage assessments in seconds instead of hours of manual work.'
            },
            {
              icon: BarChart3,
              title: 'Analytics & Tracking',
              description: 'Track all your reports, monitor statistics, and export data for insurance claims.'
            },
          ].map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <div className="p-2 rounded-lg bg-primary/10 w-fit">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* States Coverage */}
      <section className="container py-20 border-t">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">Australia-Wide</Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
            Complete Coverage Across Australia
          </h2>
          <p className="text-muted-foreground mt-4 max-w-[600px] mx-auto">
            State-specific compliance and regulations for all Australian territories
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map((state) => (
            <div key={state} className="p-6 border rounded-lg text-center hover:bg-secondary/50 transition-colors">
              <div className="text-2xl font-bold text-primary">{state}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {state === 'NSW' && 'New South Wales'}
                {state === 'VIC' && 'Victoria'}
                {state === 'QLD' && 'Queensland'}
                {state === 'WA' && 'Western Australia'}
                {state === 'SA' && 'South Australia'}
                {state === 'TAS' && 'Tasmania'}
                {state === 'ACT' && 'Australian Capital Territory'}
                {state === 'NT' && 'Northern Territory'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="container py-20 border-t bg-secondary/20">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">Testimonials</Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
            Trusted by Restoration Professionals
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              name: 'Sarah Mitchell',
              role: 'Restoration Manager, Sydney',
              content: 'RestoreAssist has cut our report generation time from hours to minutes. The NCC compliance checks are invaluable.',
              rating: 5
            },
            {
              name: 'James Chen',
              role: 'Insurance Assessor, Melbourne',
              content: 'The accuracy of cost estimates is impressive. Reports are professional and always accepted by insurers.',
              rating: 5
            },
            {
              name: 'Lisa Anderson',
              role: 'Property Manager, Brisbane',
              content: 'Finally, a tool that understands Australian building standards. The state-specific compliance notes save us so much time.',
              rating: 5
            },
          ].map((testimonial) => (
            <Card key={testimonial.name}>
              <CardHeader>
                <div className="flex gap-1 mb-2">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <CardDescription className="italic">"{testimonial.content}"</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20 border-t">
        <Card className="bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl mb-4">
              Ready to Transform Your Damage Assessments?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-[600px] mx-auto">
              Join Australian restoration professionals using AI to generate professional, compliant reports in seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={onGetStarted} size="lg" className="text-lg">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="text-lg">
                Schedule Demo
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="container py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="mb-4">
                <Logo size={60} variant="icon" />
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                AI-powered damage assessment platform for Australian restoration professionals.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Features</a></li>
                <li><a href="#" className="hover:text-foreground">Pricing</a></li>
                <li><a href="#" className="hover:text-foreground">API</a></li>
                <li><a href="#" className="hover:text-foreground">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">About</a></li>
                <li><a href="#" className="hover:text-foreground">Blog</a></li>
                <li><a href="#" className="hover:text-foreground">Careers</a></li>
                <li><a href="#" className="hover:text-foreground">Contact</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground">Terms</a></li>
                <li><a href="#" className="hover:text-foreground">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2025 RestoreAssist. All rights reserved. Powered by Claude AI.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
