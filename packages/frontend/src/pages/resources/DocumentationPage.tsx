import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, FileText, Video, Code, Search, Download, ExternalLink } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export function DocumentationPage() {
  const documentationSections = [
    {
      title: 'Getting Started',
      icon: <BookOpen className="h-6 w-6" />,
      items: [
        { name: 'Quick Start Guide', description: 'Get up and running in 5 minutes', link: '#quickstart' },
        { name: 'Account Setup', description: 'Configure your RestoreAssist account', link: '#setup' },
        { name: 'First Report', description: 'Create your first damage assessment', link: '#first-report' },
        { name: 'Best Practices', description: 'Industry best practices for reporting', link: '#best-practices' }
      ]
    },
    {
      title: 'Feature Guides',
      icon: <FileText className="h-6 w-6" />,
      items: [
        { name: 'AI Report Generation', description: 'Master AI-powered reporting', link: '/features/ai-reports' },
        { name: 'IICRC Compliance', description: 'Understanding compliance checks', link: '/features/iicrc-compliance' },
        { name: 'Cost Estimation', description: 'Accurate pricing and quotes', link: '/features/cost-estimation' },
        { name: 'Template Library', description: 'Using and customizing templates', link: '/features/templates' }
      ]
    },
    {
      title: 'Technical Documentation',
      icon: <Code className="h-6 w-6" />,
      items: [
        { name: 'API Reference', description: 'Complete API documentation', link: '/resources/api' },
        { name: 'Integration Guides', description: 'Connect to your systems', link: '#integrations' },
        { name: 'Data Export', description: 'Export formats and specifications', link: '/features/export-formats' },
        { name: 'Webhooks', description: 'Real-time event notifications', link: '#webhooks' }
      ]
    }
  ];

  const resources = [
    {
      title: 'PDF Reports Guide',
      description: 'Complete guide to generating professional PDF reports',
      badge: 'Popular',
      icon: <Download className="h-5 w-5" />
    },
    {
      title: 'IICRC Standards',
      description: 'Understanding S500, S520, and Australian compliance',
      badge: 'Compliance',
      icon: <FileText className="h-5 w-5" />
    },
    {
      title: 'Video Tutorials',
      description: 'Step-by-step video walkthroughs',
      badge: 'Learning',
      icon: <Video className="h-5 w-5" />
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
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
              <BookOpen className="mr-2 h-4 w-4" />
              Documentation & Guides
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Everything You Need
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-purple-200">
                To Master RestoreAssist
              </span>
            </h1>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
              Comprehensive documentation, tutorials, and guides to help you leverage the full power of
              AI-driven damage assessment and reporting.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
                <Link to="/">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg bg-white/10 border-white/30 hover:bg-white/20 text-white">
                <Link to="/resources/training">
                  View Training Videos
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Documentation Sections */}
      <section className="container py-20">
        <div className="grid md:grid-cols-3 gap-8">
          {documentationSections.map((section) => (
            <Card key={section.title} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {section.icon}
                  </div>
                  <CardTitle>{section.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {section.items.map((item) => (
                    <Link
                      key={item.name}
                      to={item.link}
                      className="block p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
                    >
                      <div className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                        {item.name}
                        <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {item.description}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Popular Resources */}
      <section className="container py-20 bg-secondary/20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Popular Resources</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Most accessed documentation and guides
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {resources.map((resource) => (
            <Card key={resource.title} className="hover:shadow-lg transition-all hover:scale-105">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {resource.icon}
                  </div>
                  <Badge variant="secondary">{resource.badge}</Badge>
                </div>
                <CardTitle className="mt-4">{resource.title}</CardTitle>
                <CardDescription>{resource.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg">
                <Link to="/contact">
                  Contact Support <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/resources/training">
                  Watch Training Videos
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
