import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  TrendingUp,
  Users,
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  Award,
  Target,
  Zap
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { MainNavigation } from '../components/navigation/MainNavigation';

export function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      {/* Navigation */}
      <MainNavigation />
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white">
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
        </div>

        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 shadow-lg">
              <Award className="mr-2 h-4 w-4" />
              25+ Years of Industry Experience
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Transforming Australian
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-purple-200">
                Property Restoration
              </span>
            </h1>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
              Built by restoration professionals, for restoration professionals.
              RestoreAssist addresses the critical gap in standardised reporting that has plagued our industry for decades.
            </p>
          </div>
        </div>
      </section>

      {/* The Industry Problem Section */}
      <section className="container py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <Badge variant="secondary" className="shadow-sm">
              <AlertTriangle className="mr-2 h-4 w-4" />
              The Industry Challenge
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              The Administrative Burden
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Holding Back Australian Restorers
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-2 border-destructive/20 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <XCircle className="h-6 w-6 text-destructive" />
                  </div>
                  No Standardized Protocols
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-muted-foreground">
                <p>
                  Over 25 years, the Australian property restoration industry has evolved significantly—yet administrative complexities have intensified without corresponding support systems.
                </p>
                <p>
                  Insurance providers expect detailed, compliant reports, but offer no standardised training or protocols for restoration professionals. Each business develops its own methodology, leading to inconsistent documentation across the industry.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-destructive/20 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <DollarSign className="h-6 w-6 text-destructive" />
                  </div>
                  Escalating Administrative Costs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-muted-foreground">
                <p>
                  The burden of report writing and administrative documentation has shifted entirely to restoration businesses—without adequate tools or resources.
                </p>
                <p>
                  This creates substantial overhead: high wages for specialised administrative staff, extended back-and-forth between technicians and office personnel, and missed opportunities due to inefficient data capture on-site.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-destructive/20 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <Clock className="h-6 w-6 text-destructive" />
                  </div>
                  Time-Intensive Manual Processes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-muted-foreground">
                <p>
                  Traditional report generation consumes 1–2 hours per claim on average—time that could be spent on restoration work or business growth.
                </p>
                <p>
                  Technicians must remember critical details, communicate them accurately to administrators, and wait for documentation to be manually compiled—a process rife with inefficiency and potential errors.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-destructive/20 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <FileText className="h-6 w-6 text-destructive" />
                  </div>
                  Compliance Complexity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-muted-foreground">
                <p>
                  Restoration professionals must navigate IICRC standards, Australian Standards, state-specific building codes, and government policies—without centralized reference systems.
                </p>
                <p>
                  Ensuring compliance across multiple jurisdictions requires extensive knowledge and constant vigilance, adding further complexity to an already demanding workflow.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* The Solution Section */}
      <section className="container py-20 border-t">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <Badge variant="secondary" className="shadow-sm bg-green-500/10 text-green-700 border-green-500/20">
              <Target className="mr-2 h-4 w-4" />
              The RestoreAssist Solution
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              One Industry Reporting System
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                For All Australian Restoration Claims
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              A standardised, AI-powered platform designed specifically for the Australian property restoration industry—
              providing a solid foundation that reduces administrative burden and ensures compliance.
            </p>
          </div>

          {/* Advantages */}
          <div className="mb-12">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              Key Advantages
            </h3>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border-2 border-green-500/20 bg-green-500/5 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-start gap-3">
                    <Badge className="bg-green-600">1</Badge>
                    Unified Australian Standard
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  A uniformed system designed specifically for the Australian property restoration industry,
                  eliminating inconsistencies and establishing industry-wide best practices.
                </CardContent>
              </Card>

              <Card className="border-2 border-green-500/20 bg-green-500/5 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-start gap-3">
                    <Badge className="bg-green-600">2</Badge>
                    Professional Foundation
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  Captures input from experienced restorers and automatically aligns it against IICRC standards,
                  Australian Standards, and state-specific building regulations—providing a reliable starting point.
                </CardContent>
              </Card>

              <Card className="border-2 border-green-500/20 bg-green-500/5 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-start gap-3">
                    <Badge className="bg-green-600">3</Badge>
                    Lightning-Fast Processing
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  Each claim is unique and treated individually. The system delivers a consistent, compliant foundation
                  in under 15 seconds—ensuring information is captured and presented uniformly every time.
                </CardContent>
              </Card>

              <Card className="border-2 border-green-500/20 bg-green-500/5 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-start gap-3">
                    <Badge className="bg-green-600">4</Badge>
                    Substantial Cost Savings
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  Reduces administrative time chasing data. The integrated database includes IICRC standards,
                  Australian Standards, state building codes, and government policies—all accessible in under a second.
                </CardContent>
              </Card>

              <Card className="border-2 border-green-500/20 bg-green-500/5 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-start gap-3">
                    <Badge className="bg-green-600">5</Badge>
                    Scalable & Customizable
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  Process multiple claims simultaneously without bottlenecks. Every generated report can be edited
                  and customised with your business-specific data and workflows.
                </CardContent>
              </Card>

              <Card className="border-2 border-green-500/20 bg-green-500/5 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-start gap-3">
                    <Badge className="bg-green-600">6</Badge>
                    Dramatic Time Reduction
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  Transform a task that traditionally requires 1–2 hours of administrative time into a process
                  completed in under 15 seconds—freeing resources for higher-value activities.
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Transparent Limitations */}
          <div className="mt-16">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
              Honest Limitations
            </h3>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="border-2 border-orange-500/20 bg-orange-500/5">
                <CardHeader>
                  <CardTitle className="text-base">Quality Depends on Input</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  The system generates reports based on the data provided. Incomplete or inaccurate input
                  will produce correspondingly incomplete results. Comprehensive, detailed input ensures optimal output quality.
                </CardContent>
              </Card>

              <Card className="border-2 border-orange-500/20 bg-orange-500/5">
                <CardHeader>
                  <CardTitle className="text-base">Not a Final Product</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  RestoreAssist provides a professional foundation, not a turnkey solution. Administrative time
                  is still required to add business-specific details, customize sections, and transfer data to your existing systems.
                </CardContent>
              </Card>

              <Card className="border-2 border-orange-500/20 bg-orange-500/5">
                <CardHeader>
                  <CardTitle className="text-base">Subscription Investment</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  The service requires a monthly subscription under $50. While this represents substantial savings
                  compared to administrative wages, it is an upfront operational expense to consider.
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Founder Story Section */}
      <section className="container py-20 border-t bg-secondary/10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <Badge variant="secondary" className="shadow-sm">
              <Users className="mr-2 h-4 w-4" />
              Founder's Story
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              Built From
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Real Industry Experience
              </span>
            </h2>
          </div>

          <Card className="border-2 shadow-xl">
            <CardContent className="p-8 md:p-12 space-y-6 text-lg leading-relaxed text-muted-foreground">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                    PM
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground mb-1">Phill McGurk</h3>
                  <p className="text-sm text-muted-foreground">Founder & Industry Veteran</p>
                </div>
              </div>

              <p>
                Phill McGurk's journey in the Australian property restoration industry began in 1997 as a casual helper,
                transitioning to full-time employment in 1998 with a carpet cleaning and restoration company on Queensland's Sunshine Coast.
                Over the subsequent decades, he witnessed firsthand the industry's evolution—and its persistent administrative challenges.
              </p>

              <p>
                By 2017, escalating administrative costs prompted Phill to develop an internal system aimed at streamlining report generation
                and reducing inefficiencies. The core objective was clear: capture critical data on-site, minimize back-and-forth communication
                between technicians and administrative staff, and create a scalable, repeatable process suitable for training new hires.
              </p>

              <p>
                The initial system employed a linear workflow—technicians progressed sequentially through structured steps,
                building a comprehensive image of each claim for the administrative team. This methodology proved effective not only
                for efficiency but also as a standardised training framework, ensuring consistency across both field and office personnel.
              </p>

              <p>
                As technology advanced, photo documentation became integral to the process. Marrying visual evidence with textual data
                provided a more complete assessment—yet a critical gap remained: <strong className="text-foreground">the absence of an industry-wide
                standardised format for presenting captured information.</strong>
              </p>

              <p>
                Recognizing this systemic deficiency, Phill invested five years learning software development and system architecture,
                culminating in RestoreAssist—a purpose-built platform designed specifically for the Australian property restoration industry.
                The result is a solution born from real operational pain points, refined through decades of hands-on experience.
              </p>

              <div className="pt-6 border-t">
                <p className="text-base italic text-foreground/70">
                  "We welcome feedback and ideas from restoration professionals. RestoreAssist is built for the industry,
                  and your insights will help shape its ongoing development. Please share your thoughts on features that would benefit your team."
                </p>
                <p className="text-sm font-semibold text-foreground mt-4">— Phill McGurk, Founder</p>
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
                <Zap className="mr-2 h-3 w-3" />
                Join Australian Restoration Professionals
              </Badge>
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                Ready to Transform Your
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                  Administrative Workflow?
                </span>
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Start your free trial today. Experience how RestoreAssist reduces reporting time from hours to seconds.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
                <Link to="/">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg shadow-md hover:shadow-lg transition-all">
                <Link to="/contact">
                  Contact Us
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
