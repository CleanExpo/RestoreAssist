import React from 'react';
import { Zap, Crown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { UpgradeToPaidButton } from './UpgradeToPaidButton';

interface DashboardUpgradeCardProps {
  userId: string;
  userEmail: string;
  reportsRemaining: number;
  className?: string;
}

export function DashboardUpgradeCard({
  userId,
  userEmail,
  reportsRemaining,
  className = '',
}: DashboardUpgradeCardProps) {
  const isUrgent = reportsRemaining <= 1;

  return (
    <Card className={`border-2 border-primary ${className}`}>
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Crown className="w-5 h-5 text-yellow-500" />
          <CardTitle className="text-xl">Unlock Unlimited Reports</CardTitle>
        </div>
        <CardDescription>
          {isUrgent
            ? "You're running out of trial reports! Upgrade now to continue generating reports."
            : "Upgrade to a paid plan for unlimited report generation and premium features."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Benefits */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Unlimited Reports</p>
              <p className="text-xs text-muted-foreground">Generate as many reports as you need</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Priority Support</p>
              <p className="text-xs text-muted-foreground">Get help when you need it</p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-muted p-3 rounded-lg">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold">$49.50</span>
            <span className="text-sm text-muted-foreground">AUD/month</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Or save 10% with yearly billing
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <UpgradeToPaidButton
            userId={userId}
            userEmail={userEmail}
            planType="monthly"
            variant="default"
            size="lg"
            fullWidth
          />
          <UpgradeToPaidButton
            userId={userId}
            userEmail={userEmail}
            planType="yearly"
            variant="outline"
            size="default"
            fullWidth
          />
        </div>
      </CardContent>
    </Card>
  );
}
