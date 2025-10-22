import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3 } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';

export function AnalyticsFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />
      <section className="relative bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white py-24">
        <div className="container max-w-4xl mx-auto text-center space-y-6">
          <BarChart3 className="w-20 h-20 mx-auto" />
          <h1 className="text-5xl md:text-7xl font-bold">Analytics Dashboard<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-purple-200">Business Insights</span></h1>
          <p className="text-xl max-w-3xl mx-auto">Track costs, claim history, and business metrics. One uniformed method provides consistent data for powerful analytics and reporting.</p>
          <Button asChild size="lg"><Link to="/">Start Free Trial <ArrowRight className="ml-2 h-5 w-5" /></Link></Button>
        </div>
      </section>
    </div>
  );
}
