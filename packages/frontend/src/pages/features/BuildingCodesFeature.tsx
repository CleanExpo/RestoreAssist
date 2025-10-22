import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle, Map, FileText } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export function BuildingCodesFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-blue-700 to-cyan-800 text-white">
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
        </div>

        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 shadow-lg">
              <Building2 className="mr-2 h-4 w-4" />
              NCC 2022 Compliant
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Australian Building Codes
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-cyan-200">
                State-Specific Compliance
              </span>
            </h1>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
              One uniformed method automatically applies NCC 2022 building codes and state-specific regulations
              to every report—ensuring compliance across all Australian jurisdictions.
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

      {/* State Coverage */}
      <section className="container py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <Badge variant="secondary" className="shadow-sm">
              <Map className="mr-2 h-4 w-4" />
              Complete State Coverage
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              All Australian States
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                & Territories Covered
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { code: 'NSW', name: 'New South Wales', regulations: ['Environmental Planning', 'Building Sustainability', 'Heritage Considerations'] },
              { code: 'VIC', name: 'Victoria', regulations: ['Building Regulations 2018', 'Plumbing Regulations', 'Energy Efficiency'] },
              { code: 'QLD', name: 'Queensland', regulations: ['Building Act 1975', 'Sustainable Buildings', 'Development Codes'] },
              { code: 'WA', name: 'Western Australia', regulations: ['Building Code Variations', 'Bushfire Standards', 'Regional Requirements'] },
              { code: 'SA', name: 'South Australia', regulations: ['Development Regulations', 'Water Sensitive Design', 'Climate Zone 5'] },
              { code: 'TAS', name: 'Tasmania', regulations: ['Building Act 2016', 'Wind Loading', 'Thermal Performance'] },
              { code: 'ACT', name: 'Australian Capital Territory', regulations: ['Planning & Development Act', 'Energy Rating', 'Water Efficiency'] },
              { code: 'NT', name: 'Northern Territory', regulations: ['Building Act 1993', 'Cyclone Standards', 'Tropical Climate'] }
            ].map((state) => (
              <Card key={state.code} className="border-2 hover:shadow-lg transition-all">
                <CardHeader>
                  <CardTitle className="text-center">
                    <div className="text-3xl font-bold text-primary mb-2">{state.code}</div>
                    <div className="text-sm font-normal text-muted-foreground">{state.name}</div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {state.regulations.map((reg, idx) => (
                      <li key={idx} className="flex items-start gap-1">
                        <CheckCircle className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{reg}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* NCC 2022 Coverage */}
      <section className="container py-20 border-t">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              NCC 2022 Requirements
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Automatically Included
              </span>
            </h2>
          </div>

          <div className="space-y-6">
            {[
              {
                title: 'Building Classification',
                description: 'Automatic classification according to NCC Volume One (Class 1-10 buildings) and Volume Two (housing provisions)'
              },
              {
                title: 'Performance Requirements',
                description: 'Structural integrity, fire resistance, health & amenity, access, and energy efficiency requirements per NCC Section B-J'
              },
              {
                title: 'Deemed-to-Satisfy Provisions',
                description: 'Application of acceptable construction methods and materials that comply with NCC DtS provisions'
              },
              {
                title: 'Waterproofing Standards',
                description: 'AS 3740 compliance for wet areas, AS 4654 for roofing, and NCC Vol 1 Section C waterproofing requirements'
              },
              {
                title: 'Fire Safety Measures',
                description: 'Passive fire protection, active suppression systems, and egress requirements per NCC Section C & D'
              },
              {
                title: 'Accessibility Compliance',
                description: 'AS 1428 access requirements, Disability Discrimination Act considerations, and universal design principles'
              }
            ].map((item, index) => (
              <Card key={index} className="border-2 hover:shadow-lg transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <Badge className="mt-0.5">{index + 1}</Badge>
                    <div className="flex-1">
                      <h3 className="font-bold mb-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container py-20 border-t bg-secondary/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Smart Compliance Detection</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              The system automatically identifies and applies the correct building codes based on your inputs
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="text-4xl mb-4">📍</div>
                <CardTitle>Location Detection</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                State/territory automatically identified from property address, applying correct jurisdictional requirements
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="text-4xl mb-4">🏗️</div>
                <CardTitle>Building Type</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Residential vs commercial classification determines which NCC volumes and sections apply to the restoration
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="text-4xl mb-4">⚡</div>
                <CardTitle>Automatic Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Compliance notes section automatically populated with relevant NCC clauses and state-specific variations
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
              Stop Worrying About
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Building Code Compliance
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Let the system automatically apply NCC 2022 and state-specific regulations to every report
            </p>
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
