import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, CheckCircle, AlertCircle, FileText, BookOpen, Award, Bell } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export function CompliancePage() {
  const standards = [
    {
      title: 'IICRC S500',
      description: 'Water Damage Standard',
      version: '4th Edition',
      status: 'Current',
      icon: '💧',
      coverage: 'Category 1-3 water damage, extraction, drying protocols'
    },
    {
      title: 'IICRC S520',
      description: 'Mold Remediation Standard',
      version: '2nd Edition',
      status: 'Current',
      icon: '🌿',
      coverage: 'Mold assessment, containment, removal, and prevention'
    },
    {
      title: 'NCC 2022',
      description: 'National Construction Code',
      version: '2022',
      status: 'Current',
      icon: '🏗️',
      coverage: 'Australian building codes and state-specific regulations'
    },
    {
      title: 'AS 3959',
      description: 'Bushfire Construction',
      version: '2018',
      status: 'Current',
      icon: '🔥',
      coverage: 'Fire damage assessment and reconstruction standards'
    },
    {
      title: 'AS/NZS 3000',
      description: 'Electrical Wiring Rules',
      version: '2018',
      status: 'Current',
      icon: '⚡',
      coverage: 'Electrical safety in water and fire damage scenarios'
    },
    {
      title: 'Insurance Council',
      description: 'General Insurance Code',
      version: '2020',
      status: 'Current',
      icon: '🛡️',
      coverage: 'Claims handling and professional standards'
    }
  ];

  const updates = [
    {
      date: '2025-01-15',
      title: 'IICRC S500 Update',
      description: 'New moisture mapping requirements for Category 2 water damage',
      type: 'Standard Update',
      priority: 'Medium'
    },
    {
      date: '2024-12-10',
      title: 'NCC 2022 Amendment 1',
      description: 'Updated fire resistance requirements for residential construction',
      type: 'Code Change',
      priority: 'High'
    },
    {
      date: '2024-11-20',
      title: 'AS 3959 Clarification',
      description: 'Bushfire Attack Level (BAL) assessment guidelines revised',
      type: 'Clarification',
      priority: 'Low'
    }
  ];

  const complianceFeatures = [
    {
      title: 'Automatic Compliance Checks',
      description: 'Every report is automatically validated against current standards',
      icon: <CheckCircle className="h-6 w-6" />
    },
    {
      title: 'Real-time Updates',
      description: 'Receive notifications when standards or codes change',
      icon: <Bell className="h-6 w-6" />
    },
    {
      title: 'Citation Library',
      description: 'Built-in references to all relevant standards and codes',
      icon: <BookOpen className="h-6 w-6" />
    },
    {
      title: 'Compliance Reports',
      description: 'Generate compliance documentation for insurance and regulators',
      icon: <FileText className="h-6 w-6" />
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-blue-700 to-cyan-800 text-white">
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
        </div>

        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 shadow-lg">
              <Shield className="mr-2 h-4 w-4" />
              Industry Compliance
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Stay Current with
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-cyan-200">
                Industry Standards
              </span>
            </h1>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
              Automatic compliance checking against IICRC standards, Australian building codes, and
              insurance requirements. Never miss an update with real-time notifications.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
                <Link to="/">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg bg-white/10 border-white/30 hover:bg-white/20 text-white">
                <Link to="/features/iicrc-compliance">
                  View Compliance Features
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Supported Standards */}
      <section className="container py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Supported Standards & Codes</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            RestoreAssist tracks and validates against all major industry standards
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {standards.map((standard) => (
            <Card key={standard.title} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <div className="text-4xl">{standard.icon}</div>
                  <Badge variant="default">{standard.status}</Badge>
                </div>
                <CardTitle className="text-xl mb-1">{standard.title}</CardTitle>
                <CardDescription className="font-medium text-foreground/80">
                  {standard.description}
                </CardDescription>
                <div className="text-sm text-muted-foreground mt-2">
                  Version: {standard.version}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {standard.coverage}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Compliance Features */}
      <section className="container py-20 bg-secondary/20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Built-in Compliance Tools</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Automated compliance checking and documentation
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {complianceFeatures.map((feature) => (
            <Card key={feature.title} className="hover:shadow-lg transition-all hover:scale-105">
              <CardHeader>
                <div className="p-3 rounded-lg bg-primary/10 text-primary mb-3 w-fit">
                  {feature.icon}
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Recent Updates */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Recent Updates</h2>
            <p className="text-muted-foreground text-lg">
              Latest changes to standards and regulations
            </p>
          </div>

          <div className="space-y-4">
            {updates.map((update) => (
              <Card key={update.title} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant={update.priority === 'High' ? 'destructive' : 'secondary'}>
                          {update.priority} Priority
                        </Badge>
                        <Badge variant="outline">{update.type}</Badge>
                        <span className="text-sm text-muted-foreground">{update.date}</span>
                      </div>
                      <h3 className="text-xl font-bold mb-2">{update.title}</h3>
                      <p className="text-muted-foreground">{update.description}</p>
                    </div>
                    <AlertCircle className="h-5 w-5 text-muted-foreground ml-4 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <Button variant="outline" size="lg">
              <Bell className="mr-2 h-5 w-5" />
              Subscribe to Updates
            </Button>
          </div>
        </div>
      </section>

      {/* Certification */}
      <section className="container py-20 bg-secondary/20">
        <Card className="max-w-4xl mx-auto border-primary/20">
          <CardContent className="p-12">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="p-6 rounded-full bg-primary/10 text-primary">
                  <Award className="h-12 w-12" />
                </div>
              </div>
              <h2 className="text-3xl font-bold">Compliance Certification</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Generate official compliance certificates for insurance claims and regulatory submissions.
                Every report includes full citations and standard references.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Button asChild size="lg">
                  <Link to="/features/iicrc-compliance">
                    Learn More <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Never Fall Behind</h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              RestoreAssist automatically updates when standards change. Focus on your work,
              we'll handle compliance.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg">
                <Link to="/">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/contact">
                  Talk to Compliance Expert
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
