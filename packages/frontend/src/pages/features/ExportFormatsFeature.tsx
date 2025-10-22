import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';

export function ExportFormatsFeature() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />
      <section className="relative bg-gradient-to-br from-purple-600 via-indigo-700 to-blue-800 text-white py-24">
        <div className="container max-w-4xl mx-auto text-center space-y-6">
          <FileText className="w-20 h-20 mx-auto" />
          <h1 className="text-5xl md:text-7xl font-bold">Multi-Format Export<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-blue-200">PDF, Word, Excel</span></h1>
          <p className="text-xl max-w-3xl mx-auto">Export your reports in PDF, Word, or Excel formats. One uniformed method—multiple output options for insurance claims and client submissions.</p>
          <Button asChild size="lg"><Link to="/">Start Free Trial <ArrowRight className="ml-2 h-5 w-5" /></Link></Button>
        </div>
      </section>
    </div>
  );
}
