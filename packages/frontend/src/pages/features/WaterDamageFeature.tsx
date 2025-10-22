import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Droplets, CheckCircle } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { WaterDamageIcon } from '../../components/icons/WaterDamageIcon';

export function WaterDamageFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />

      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-cyan-700 to-teal-800 text-white">
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
        </div>

        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <div className="flex justify-center mb-6">
              <WaterDamageIcon size={80} />
            </div>
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 shadow-lg">
              <Droplets className="mr-2 h-4 w-4" />
              Category 1, 2 & 3 Water Damage
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Water Damage Reports
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-cyan-200">
                IICRC S500 Compliant
              </span>
            </h1>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
              One uniformed method for all water damage claims—from clean water leaks to category 3 contamination.
              Consistent reporting, scoping, and estimating across every water damage restoration project.
            </p>
            <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
              <Link to="/">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              Automatic Water Classification
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { cat: 'Category 1', desc: 'Clean Water', examples: 'Burst pipes, rainwater, supply lines', range: '$2K-$8K', color: 'from-blue-500/10 to-cyan-500/10' },
              { cat: 'Category 2', desc: 'Grey Water', examples: 'Washing machines, dishwashers, aquariums', range: '$4K-$12K', color: 'from-indigo-500/10 to-blue-500/10' },
              { cat: 'Category 3', desc: 'Black Water', examples: 'Sewage, flooding, stagnant water', range: '$8K-$25K+', color: 'from-purple-500/10 to-indigo-500/10' }
            ].map((cat) => (
              <Card key={cat.cat} className={`border-2 hover:shadow-xl transition-all bg-gradient-to-br ${cat.color}`}>
                <CardHeader>
                  <CardTitle>{cat.cat}</CardTitle>
                  <p className="text-lg font-semibold text-primary">{cat.desc}</p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p><strong>Examples:</strong> {cat.examples}</p>
                  <p><strong>Typical Range:</strong> <span className="font-bold text-primary">{cat.range}</span></p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-20 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold mb-8 text-center">Every Water Damage Report Includes</h2>
          <div className="space-y-4">
            {[
              'IICRC S500 classification and protocols',
              'Moisture mapping and affected area documentation',
              'Extraction methods and equipment requirements',
              'Drying procedures and timeframes',
              'Psychrometric calculations for dehumidification',
              'Anti-microbial treatments when required',
              'Class 1-4 drying environment assessment',
              'Daily monitoring schedules and protocols',
              'Itemized costs: extraction, drying, reconstruction'
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-4 rounded-lg bg-secondary/20">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-20 border-t">
        <Card className="relative overflow-hidden border-2 border-primary/20 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10"></div>
          <CardContent className="relative p-12 text-center space-y-8">
            <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl">
              Standardized Water Damage
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Reports in 15 Seconds
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
