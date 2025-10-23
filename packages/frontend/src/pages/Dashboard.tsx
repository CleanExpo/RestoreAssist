import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { LogoCompact } from '../components/ui/logo';
import { ApiKeyManager } from '../components/ApiKeyManager';
import { ReportForm } from '../components/ReportForm';
import { GeneratedReports } from '../components/GeneratedReports';
import { UserMenu } from '../components/UserMenu';
import { TrialUpgradeBanner } from '../components/TrialUpgradeBanner';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

interface DashboardProps {
  onBackToHome: () => void;
}

interface UserSubscription {
  subscription_id: string;
  plan_type: 'freeTrial' | 'monthly' | 'yearly';
  status: string;
  reports_used: number;
  reports_limit: number | null;
  current_period_end?: string;
}

export function Dashboard({ onBackToHome }: DashboardProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  // Get user info from localStorage
  const userId = localStorage.getItem('userId') || '';
  const userEmail = localStorage.getItem('userEmail') || '';

  // Fetch user subscription on mount
  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const apiUrl = getApiBaseUrl();
        const accessToken = localStorage.getItem('accessToken');

        const response = await fetch(`${apiUrl}/subscription/me`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSubscription(data.subscription);
        }
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      } finally {
        setLoadingSubscription(false);
      }
    };

    fetchSubscription();
  }, []);

  const handleReportGenerated = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Button variant="ghost" size="sm" onClick={onBackToHome}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="h-8 w-px bg-border" />
            <LogoCompact />
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="text-xs">Dashboard</Badge>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {/* Trial Upgrade Banner - Show only for free trial users */}
        {!loadingSubscription && subscription?.plan_type === 'freeTrial' && subscription.current_period_end && (
          <div className="mb-8">
            <TrialUpgradeBanner
              userId={userId}
              userEmail={userEmail}
              reportsRemaining={
                subscription.reports_limit !== null
                  ? subscription.reports_limit - subscription.reports_used
                  : 0
              }
              reportsLimit={subscription.reports_limit || 3}
              expiresAt={subscription.current_period_end}
            />
          </div>
        )}

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
