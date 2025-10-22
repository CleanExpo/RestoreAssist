import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, CheckCircle, Award, FileText, BookOpen, AlertCircle } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export function IICRCComplianceFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green-600 via-emerald-700 to-teal-800 text-white">
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-green-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
        </div>

        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 shadow-lg">
              <Shield className="mr-2 h-4 w-4" />
              Industry Standard Compliance
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              IICRC Compliance
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-200 to-teal-200">
                Built Into Every Report
              </span>
            </h1>
            <p className="text-xl text-green-100 max-w-3xl mx-auto leading-relaxed">
              One uniformed method ensures every report automatically includes relevant IICRC standards (S500, S520, S800)
              with proper compliance documentation—the same way, every time.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
                <Link to="/">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* IICRC Standards Covered */}
      <section className="container py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <Badge variant="secondary" className="shadow-sm">
              <BookOpen className="mr-2 h-4 w-4" />
              Comprehensive Standard Coverage
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              IICRC Standards
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Automatically Applied
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-2 border-blue-500/20 bg-blue-500/5 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">IICRC S500</CardTitle>
                <p className="text-sm text-muted-foreground">Water Damage Restoration</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Category 1, 2, 3 water classification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Extraction and drying protocols</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Moisture mapping procedures</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Equipment placement standards</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 border-purple-500/20 bg-purple-500/5 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">IICRC S520</CardTitle>
                <p className="text-sm text-muted-foreground">Mould Remediation</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Condition 1, 2, 3 assessment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Containment and isolation methods</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Remediation work plans</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Post-remediation verification</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 border-orange-500/20 bg-orange-500/5 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">IICRC S800</CardTitle>
                <p className="text-sm text-muted-foreground">Fire & Smoke Damage</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Smoke and soot residue classification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Deodorisation protocols</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Structural cleaning methods</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Content restoration procedures</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How Compliance Works */}
      <section className="container py-20 border-t">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              Automatic Compliance
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                In Every Report
              </span>
            </h2>
          </div>

          <Card className="border-2 shadow-xl">
            <CardContent className="p-8 space-y-6">
              <div className="space-y-4">
                {[
                  {
                    title: 'Damage Type Detection',
                    description: 'System automatically identifies which IICRC standards apply based on your damage type selection'
                  },
                  {
                    title: 'Relevant Standard References',
                    description: 'Only applicable IICRC protocols are included—no unnecessary information cluttering your report'
                  },
                  {
                    title: 'Proper Classification',
                    description: 'Water categories, mould conditions, and fire damage severity are classified according to IICRC definitions'
                  },
                  {
                    title: 'Protocol Documentation',
                    description: 'Extraction methods, drying procedures, containment requirements documented per IICRC guidelines'
                  },
                  {
                    title: 'Compliance Notes Section',
                    description: 'Dedicated section highlighting which IICRC standards were followed and why'
                  }
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-4 p-4 rounded-lg bg-secondary/20">
                    <Badge className="mt-0.5">{index + 1}</Badge>
                    <div>
                      <h3 className="font-semibold mb-1">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Benefits */}
      <section className="container py-20 border-t bg-secondary/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <Badge variant="secondary" className="shadow-sm">
              <Award className="mr-2 h-4 w-4" />
              Industry Benefits
            </Badge>
            <h2 className="text-4xl font-bold">
              Why IICRC Compliance Matters
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-2 hover:shadow-lg transition-all">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  Insurance Acceptance
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Insurance providers recognize IICRC-compliant reports as industry standard, reducing claim disputes and expediting approvals.
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-all">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  Professional Credibility
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Demonstrates your business follows internationally recognised best practices and maintains professional standards.
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-all">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  Legal Protection
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Following IICRC standards provides documentation that work was performed according to established industry protocols.
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-all">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  Consistent Quality
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                One uniformed method ensures every technician, every claim, follows the same certified restoration procedures.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20 border-t">
        <Card className="relative overflow-hidden border-2 border-primary/20 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10"></div>
          <CardContent className="relative p-12 text-center space-y-8">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Ready for IICRC-Compliant
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Reports Every Time?
              </span>
            </h2>
            <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
              <Link to="/">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
