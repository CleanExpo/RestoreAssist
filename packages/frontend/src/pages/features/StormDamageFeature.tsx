import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CloudRain } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { StormDamageIcon } from '../../components/icons/StormDamageIcon';

export function StormDamageFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-600 via-slate-700 to-zinc-800 text-white">
        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <div className="flex justify-center mb-6"><StormDamageIcon size={80} /></div>
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              <CloudRain className="mr-2 h-4 w-4" />Wind, Hail & Weather Damage
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold">Storm Damage<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-slate-200">Comprehensive Assessment</span></h1>
            <p className="text-xl text-gray-100 max-w-3xl mx-auto">One uniformed method for all storm-related damage—wind, hail, debris impact, and weather events. Standardized documentation across all severity levels.</p>
            <Button asChild size="lg"><Link to="/">Start Free Trial <ArrowRight className="ml-2 h-5 w-5" /></Link></Button>
          </div>
        </div>
      </section>
      <section className="container py-20"><Card className="border-2 shadow-2xl"><CardContent className="p-12 text-center"><h2 className="text-3xl font-bold mb-8">Storm Damage Documentation</h2><div className="text-left max-w-2xl mx-auto space-y-2 text-muted-foreground">• Roof damage assessment and repairs<br/>• External wall and cladding damage<br/>• Window and door impact damage<br/>• Gutter and downpipe replacement<br/>• Debris removal and cleanup<br/>• Temporary weather protection<br/>• Structural integrity verification<br/>• Insurance-ready photo documentation</div></CardContent></Card></section>
    </div>
  );
}
