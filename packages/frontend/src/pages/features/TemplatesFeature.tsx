import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';

export function TemplatesFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />
      <section className="relative bg-gradient-to-br from-green-600 via-emerald-700 to-teal-800 text-white py-24">
        <div className="container max-w-4xl mx-auto text-center space-y-6">
          <BookOpen className="w-20 h-20 mx-auto" />
          <h1 className="text-5xl md:text-7xl font-bold">Template Library<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-green-200 to-teal-200">Industry Standards</span></h1>
          <p className="text-xl max-w-3xl mx-auto">Professional report templates designed for the Australian restoration industry. One uniformed method across all damage types.</p>
          <Button asChild size="lg"><Link to="/">Start Free Trial <ArrowRight className="ml-2 h-5 w-5" /></Link></Button>
        </div>
      </section>
    </div>
  );
}
