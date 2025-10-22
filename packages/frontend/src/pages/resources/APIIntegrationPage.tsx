import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Code, Zap, Lock, Database, Webhook, Terminal, CloudUpload, Server } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export function APIIntegrationPage() {
  const apiFeatures = [
    {
      title: 'RESTful API',
      description: 'Modern REST API with JSON responses and comprehensive endpoints',
      icon: <Server className="h-6 w-6" />,
      badge: 'v1.0'
    },
    {
      title: 'Real-time Webhooks',
      description: 'Receive instant notifications when reports are generated or updated',
      icon: <Webhook className="h-6 w-6" />,
      badge: 'Live'
    },
    {
      title: 'Secure Authentication',
      description: 'OAuth 2.0 and API key authentication with role-based access',
      icon: <Lock className="h-6 w-6" />,
      badge: 'Secure'
    },
    {
      title: 'Bulk Operations',
      description: 'Process multiple reports, estimates, and exports in batch',
      icon: <Zap className="h-6 w-6" />,
      badge: 'Fast'
    },
    {
      title: 'Data Export',
      description: 'Export reports in multiple formats: PDF, Word, Excel, JSON',
      icon: <CloudUpload className="h-6 w-6" />,
      badge: 'Multi-format'
    },
    {
      title: 'Database Access',
      description: 'Query historical data, analytics, and claim history',
      icon: <Database className="h-6 w-6" />,
      badge: 'SQL Ready'
    }
  ];

  const integrations = [
    {
      name: 'Ascora',
      description: 'Job management and scheduling platform',
      logo: '🔧',
      status: 'Available'
    },
    {
      name: 'Xero',
      description: 'Accounting and invoicing integration',
      logo: '💼',
      status: 'Available'
    },
    {
      name: 'QuickBooks',
      description: 'Financial management system',
      logo: '📊',
      status: 'Coming Soon'
    },
    {
      name: 'ServiceM8',
      description: 'Field service management',
      logo: '📱',
      status: 'Available'
    },
    {
      name: 'Custom',
      description: 'Build your own integration',
      logo: '🔌',
      status: 'API Ready'
    },
    {
      name: 'Zapier',
      description: 'Connect to 5000+ apps',
      logo: '⚡',
      status: 'Coming Soon'
    }
  ];

  const codeExample = `// Example: Generate a report via API
const response = await fetch('https://api.restoreassist.com.au/v1/reports', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    damageType: 'water',
    category: 2,
    affectedArea: 'Living Room',
    sqMeters: 45.5,
    iicrcCompliance: true
  })
});

const report = await response.json();
console.log(\`Report generated: \${report.id}\`);
`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green-600 via-teal-700 to-cyan-800 text-white">
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-teal-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
        </div>

        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 shadow-lg">
              <Code className="mr-2 h-4 w-4" />
              API Integration
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Connect RestoreAssist
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-200 to-cyan-200">
                To Your Workflow
              </span>
            </h1>
            <p className="text-xl text-teal-100 max-w-3xl mx-auto leading-relaxed">
              Seamlessly integrate AI-powered damage assessment into your existing systems.
              RESTful API, webhooks, and pre-built connectors for popular platforms.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
                <Link to="/">
                  Get API Access <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg bg-white/10 border-white/30 hover:bg-white/20 text-white">
                <Link to="/resources/documentation">
                  View API Docs
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* API Features */}
      <section className="container py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Powerful API Features</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Everything you need to integrate RestoreAssist into your existing workflow
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {apiFeatures.map((feature) => (
            <Card key={feature.title} className="hover:shadow-lg transition-all hover:scale-105">
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 rounded-lg bg-primary/10 text-primary">
                    {feature.icon}
                  </div>
                  <Badge variant="secondary">{feature.badge}</Badge>
                </div>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Code Example */}
      <section className="container py-20 bg-secondary/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple Integration</h2>
            <p className="text-muted-foreground text-lg">
              Get started with our API in minutes
            </p>
          </div>

          <Card className="bg-gray-900 text-gray-100 border-gray-800">
            <CardHeader className="border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-green-400" />
                <CardTitle className="text-white">JavaScript Example</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <pre className="text-sm overflow-x-auto">
                <code className="language-javascript">{codeExample}</code>
              </pre>
            </CardContent>
          </Card>

          <div className="text-center mt-8">
            <Button asChild size="lg">
              <Link to="/resources/documentation">
                View Full API Documentation <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Pre-built Integrations */}
      <section className="container py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Pre-Built Integrations</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Connect to popular platforms with one-click integrations
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {integrations.map((integration) => (
            <Card key={integration.name} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">{integration.logo}</div>
                  <Badge variant={integration.status === 'Available' ? 'default' : 'secondary'}>
                    {integration.status}
                  </Badge>
                </div>
                <h3 className="text-xl font-bold mb-2">{integration.name}</h3>
                <p className="text-sm text-muted-foreground">{integration.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Technical Specs */}
      <section className="container py-20 bg-secondary/20">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Technical Specifications</CardTitle>
              <CardDescription>API capabilities and limits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <div className="font-semibold mb-1">Rate Limits</div>
                    <div className="text-sm text-muted-foreground">1000 requests/hour (Standard)</div>
                    <div className="text-sm text-muted-foreground">10,000 requests/hour (Enterprise)</div>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Authentication</div>
                    <div className="text-sm text-muted-foreground">OAuth 2.0, API Keys, JWT</div>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Response Format</div>
                    <div className="text-sm text-muted-foreground">JSON (UTF-8)</div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="font-semibold mb-1">Endpoints</div>
                    <div className="text-sm text-muted-foreground">40+ REST endpoints</div>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Webhooks</div>
                    <div className="text-sm text-muted-foreground">Real-time event notifications</div>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">SLA</div>
                    <div className="text-sm text-muted-foreground">99.9% uptime guarantee</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Integrate?</h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              Get your API key today and start building powerful integrations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg">
                <Link to="/">
                  Get API Access <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/contact">
                  Talk to Integration Team
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
