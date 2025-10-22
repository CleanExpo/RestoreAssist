import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';

export function BatchProcessingFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />
      <section className="relative bg-gradient-to-br from-orange-600 via-red-700 to-pink-800 text-white py-24">
        <div className="container max-w-4xl mx-auto text-center space-y-6">
          <Zap className="w-20 h-20 mx-auto" />
          <h1 className="text-5xl md:text-7xl font-bold">Batch Processing<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-200 to-pink-200">Multiple Claims</span></h1>
          <p className="text-xl max-w-3xl mx-auto">Process multiple claims simultaneously. One uniformed method scales to handle any volume—from single claims to enterprise workflows.</p>
          <Button asChild size="lg"><Link to="/">Start Free Trial <ArrowRight className="ml-2 h-5 w-5" /></Link></Button>
        </div>
      </section>
    </div>
  );
}
