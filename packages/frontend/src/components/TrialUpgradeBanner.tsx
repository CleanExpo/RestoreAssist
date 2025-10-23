import React from 'react';
import { AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { UpgradeToPaidButton } from './UpgradeToPaidButton';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface TrialUpgradeBannerProps {
  userId: string;
  userEmail: string;
  reportsRemaining: number;
  reportsLimit: number;
  expiresAt: string;
}

export function TrialUpgradeBanner({
  userId,
  userEmail,
  reportsRemaining,
  reportsLimit,
  expiresAt,
}: TrialUpgradeBannerProps) {
  const expiryDate = new Date(expiresAt);
  const daysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const isLowReports = reportsRemaining <= 1;
  const isExpiringSoon = daysRemaining <= 3;

  return (
    <Card className={`border-2 ${isLowReports || isExpiringSoon ? 'border-orange-300 bg-orange-50' : 'border-blue-300 bg-blue-50'}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-6">
          {/* Left: Trial Status */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary" className="bg-blue-600 text-white">
                Free Trial
              </Badge>
              {(isLowReports || isExpiringSoon) && (
                <Badge variant="outline" className="border-orange-400 text-orange-700">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Action Required
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Reports Remaining:</span>
                <span className={`text-lg font-bold ${isLowReports ? 'text-orange-600' : 'text-blue-600'}`}>
                  {reportsRemaining} / {reportsLimit}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Expires:</span>
                <span className={`text-sm font-semibold ${isExpiringSoon ? 'text-orange-600' : 'text-gray-900'}`}>
                  {expiryDate.toLocaleDateString()} ({daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining)
                </span>
              </div>
            </div>

            {/* Upgrade Benefits */}
            <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200">
              <div className="flex items-start gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-gray-900 mb-1">
                    Upgrade to unlock unlimited reports
                  </p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>• Unlimited report generation</li>
                    <li>• PDF & Excel export</li>
                    <li>• Priority email support</li>
                    <li>• No usage limits</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Upgrade Buttons */}
          <div className="flex flex-col gap-3 min-w-[200px]">
            <div className="text-right mb-1">
              <p className="text-xs text-gray-500 mb-1">Choose your plan:</p>
            </div>

            <UpgradeToPaidButton
              userId={userId}
              userEmail={userEmail}
              planType="monthly"
              variant="default"
              size="default"
              fullWidth
            />

            <UpgradeToPaidButton
              userId={userId}
              userEmail={userEmail}
              planType="yearly"
              variant="outline"
              size="default"
              fullWidth
              className="border-blue-600 text-blue-600 hover:bg-blue-50"
            />

            <div className="text-center">
              <a
                href="/pricing"
                className="text-xs text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
              >
                Compare plans
                <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
