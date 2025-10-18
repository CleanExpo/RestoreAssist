import React, { useState } from 'react';
import { Shield, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ApiKeyManager } from '../components/ApiKeyManager';
import { ReportForm } from '../components/ReportForm';
import { GeneratedReports } from '../components/GeneratedReports';

interface DashboardProps {
  onBackToHome: () => void;
}

export function Dashboard({ onBackToHome }: DashboardProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleReportGenerated = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onBackToHome}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">RestoreAssist</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Dashboard
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {/* API Key Manager */}
        <div className="mb-8">
          <ApiKeyManager />
        </div>

        {/* Report Generation and List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <ReportForm onReportGenerated={handleReportGenerated} />
          </div>
          <div>
            <GeneratedReports key={refreshKey} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background mt-12">
        <div className="container py-6 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 RestoreAssist. Powered by Claude AI.</p>
        </div>
      </footer>
    </div>
  );
}
