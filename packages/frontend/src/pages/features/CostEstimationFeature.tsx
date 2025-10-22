import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, DollarSign, TrendingUp, Calculator, Clock, CheckCircle } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export function CostEstimationFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-green-700 to-teal-800 text-white">
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
        </div>

        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 shadow-lg">
              <DollarSign className="mr-2 h-4 w-4" />
              2024 Australian Market Pricing
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Accurate Cost Estimation
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-200 to-teal-200">
                Every Single Time
              </span>
            </h1>
            <p className="text-xl text-green-100 max-w-3xl mx-auto leading-relaxed">
              One uniformed method applies consistent, market-accurate Australian pricing to every estimate—
              ensuring reliable costs across all damage types and claims.
            </p>
            <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
              <Link to="/">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Database */}
      <section className="container py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <Badge variant="secondary">
              <TrendingUp className="mr-2 h-4 w-4" />
              Comprehensive Pricing Database
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold">
              2024 Market Rates
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Built Into The System
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-4">
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
                <CardTitle>Labour Rates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex justify-between">
                    <span>Technician (Level 1)</span>
                    <span className="font-semibold">$65-$85/hr</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Technician (Level 2)</span>
                    <span className="font-semibold">$85-$105/hr</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Project Manager</span>
                    <span className="font-semibold">$105-$135/hr</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Specialist Trades</span>
                    <span className="font-semibold">$95-$150/hr</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-4">
                  <Calculator className="h-6 w-6 text-white" />
                </div>
                <CardTitle>Equipment Costs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex justify-between">
                    <span>Dehumidifier</span>
                    <span className="font-semibold">$35-$65/day</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Air Mover</span>
                    <span className="font-semibold">$15-$25/day</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Air Scrubber</span>
                    <span className="font-semibold">$45-$75/day</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Moisture Meter</span>
                    <span className="font-semibold">$5-$10/use</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-xl transition-all">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <CardTitle>Materials Pricing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex justify-between">
                    <span>Plasterboard</span>
                    <span className="font-semibold">$8-$15/m²</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Paint & Supplies</span>
                    <span className="font-semibold">$12-$20/m²</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Timber Framing</span>
                    <span className="font-semibold">$4.50-$8/LM</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Insulation</span>
                    <span className="font-semibold">$8-$18/m²</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* GST & Payment Terms */}
      <section className="container py-20 border-t">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Professional Pricing Structure</h2>
            <p className="text-xl text-muted-foreground">Every estimate includes proper Australian business requirements</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-2 border-green-500/20 bg-green-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  10% GST Calculation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-muted-foreground">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Subtotal (Labour + Materials)</span>
                    <span className="font-mono">$8,500.00</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>GST (10%)</span>
                    <span className="font-mono text-primary">$850.00</span>
                  </div>
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>Total (inc GST)</span>
                    <span className="font-mono text-lg">$9,350.00</span>
                  </div>
                </div>
                <p className="text-sm">
                  GST automatically calculated and clearly itemised for Australian tax compliance
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-500/20 bg-blue-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Clock className="h-6 w-6 text-blue-600" />
                  30/40/30 Payment Terms
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-muted-foreground">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Deposit (30%)</span>
                    <span className="font-mono">$2,805.00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Progress (40%)</span>
                    <span className="font-mono">$3,740.00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Completion (30%)</span>
                    <span className="font-mono">$2,805.00</span>
                  </div>
                </div>
                <p className="text-sm">
                  Professional milestone structure protects both business and client throughout the project
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20 border-t">
        <Card className="relative overflow-hidden border-2 border-primary/20 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10"></div>
          <CardContent className="relative p-12 text-center space-y-8">
            <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl">
              Accurate Estimates
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                In 15 Seconds
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
