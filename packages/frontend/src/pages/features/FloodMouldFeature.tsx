import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Waves } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { FloodDamageIcon } from '../../components/icons/FloodDamageIcon';

export function FloodMouldFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />
      <section className="relative overflow-hidden bg-gradient-to-br from-cyan-600 via-blue-700 to-indigo-800 text-white">
        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <div className="flex justify-center mb-6"><FloodDamageIcon size={80} /></div>
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              <Waves className="mr-2 h-4 w-4" />Category 3 Water & Mould Remediation
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold">Flood & Mould<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-blue-200">Specialized Protocols</span></h1>
            <p className="text-xl text-cyan-100 max-w-3xl mx-auto">One uniformed method combining IICRC S500 Category 3 water and S520 mould remediation standards. Comprehensive contamination and bio-hazard protocols.</p>
            <Button asChild size="lg"><Link to="/">Start Free Trial <ArrowRight className="ml-2 h-5 w-5" /></Link></Button>
          </div>
        </div>
      </section>
      <section className="container py-20"><Card className="border-2 shadow-2xl"><CardContent className="p-12 text-center"><h2 className="text-3xl font-bold mb-8">Flood & Mould Remediation</h2><div className="text-left max-w-2xl mx-auto space-y-2 text-muted-foreground">• Category 3 contaminated water protocols<br/>• Mould condition assessment (1-3)<br/>• Containment and isolation procedures<br/>• HEPA filtration and air scrubbing<br/>• Affected materials removal<br/>• Anti-microbial treatments<br/>• Post-remediation clearance testing<br/>• IICRC S500 & S520 compliance documentation</div></CardContent></Card></section>
    </div>
  );
}
