import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  CreditCard,
  Calendar,
  TrendingUp,
  Settings
} from 'lucide-react';

interface Subscription {
  subscription_id: string;
  plan_type: 'freeTrial' | 'monthly' | 'yearly';
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  reports_used: number;
  reports_limit: number | null;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
  cancelled_at?: string;
}

export function SubscriptionManagement() {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      setIsLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

      // TODO: Add authentication token
      const response = await fetch(`${apiUrl}/api/subscription/me`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription');
      }

      const data = await response.json();
      setSubscription(data.subscription);
    } catch (err) {
      console.error('Error fetching subscription:', err);
      setError('Failed to load subscription details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

      const response = await fetch(`${apiUrl}/api/subscription/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cancelAtPeriodEnd: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel subscription');
      }

      await fetchSubscription(); // Refresh subscription data
      alert('Subscription cancelled. You will retain access until the end of your billing period.');
    } catch (err) {
      console.error('Error cancelling subscription:', err);
      alert('Failed to cancel subscription. Please try again or contact support.');
    }
  };

  const handleUpgrade = () => {
    navigate('/pricing');
  };

  const getPlanName = (planType: string) => {
    switch (planType) {
      case 'freeTrial':
        return 'Free Trial';
      case 'monthly':
        return 'Monthly Plan';
      case 'yearly':
        return 'Yearly Plan';
      default:
        return planType;
    }
  };

  const getStatusBadge = (status: string, cancelAtPeriodEnd: boolean) => {
    if (cancelAtPeriodEnd) {
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700">Cancelling</Badge>;
    }

    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-50 text-green-700">Active</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelled</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      case 'past_due':
        return <Badge variant="destructive">Past Due</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getUsagePercentage = (used: number, limit: number | null) => {
    if (limit === null) return 0; // Unlimited
    return (used / limit) * 100;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading subscription details...</p>
        </div>
      </div>
    );
  }

  if (error || !subscription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              No Active Subscription
            </CardTitle>
            <CardDescription>
              {error || 'You don\'t have an active subscription yet.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Subscribe to a plan to start generating professional damage assessment reports.
            </p>
            <Button onClick={() => navigate('/pricing')} className="w-full">
              View Pricing Plans
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Subscription Management</h1>
            <p className="text-muted-foreground mt-1">Manage your RestoreAssist subscription</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>

        {/* Current Plan Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">{getPlanName(subscription.plan_type)}</CardTitle>
                <CardDescription>
                  {subscription.plan_type === 'freeTrial'
                    ? '3 reports included'
                    : 'Unlimited reports'}
                </CardDescription>
              </div>
              {getStatusBadge(subscription.status, subscription.cancel_at_period_end)}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Usage Progress */}
            {subscription.reports_limit !== null && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Report Usage</span>
                  <span className="text-muted-foreground">
                    {subscription.reports_used} / {subscription.reports_limit} reports
                  </span>
                </div>
                <Progress
                  value={getUsagePercentage(subscription.reports_used, subscription.reports_limit)}
                  className="h-2"
                />
                {subscription.reports_used >= subscription.reports_limit && (
                  <div className="flex items-center gap-2 text-sm text-yellow-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>You've reached your report limit. Upgrade for unlimited access.</span>
                  </div>
                )}
              </div>
            )}

            {/* Subscription Details */}
            <div className="grid md:grid-cols-2 gap-4">
              {subscription.current_period_start && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Billing Started</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(subscription.current_period_start).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {subscription.current_period_end && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">
                      {subscription.cancel_at_period_end ? 'Access Until' : 'Next Billing Date'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(subscription.current_period_end).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Payment Method</p>
                  <p className="text-sm text-muted-foreground">
                    {subscription.plan_type === 'freeTrial' ? 'Free Trial' : 'Credit Card'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                {subscription.status === 'active' ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                )}
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="text-sm text-muted-foreground capitalize">{subscription.status}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
              {subscription.plan_type === 'freeTrial' && (
                <Button onClick={handleUpgrade} size="lg" className="flex-1">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Upgrade Plan
                </Button>
              )}

              {subscription.status === 'active' && !subscription.cancel_at_period_end && (
                <>
                  <Button
                    onClick={() => navigate('/pricing')}
                    variant="outline"
                    size="lg"
                    className="flex-1"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Change Plan
                  </Button>

                  {subscription.plan_type !== 'freeTrial' && (
                    <Button
                      onClick={handleCancelSubscription}
                      variant="outline"
                      size="lg"
                      className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Cancel Subscription
                    </Button>
                  )}
                </>
              )}

              {subscription.cancel_at_period_end && (
                <div className="flex-1 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">Subscription Cancelling</p>
                      <p className="text-sm text-yellow-700 mt-1">
                        Your subscription will end on{' '}
                        {subscription.current_period_end &&
                          new Date(subscription.current_period_end).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upgrade Benefits (for free trial users) */}
        {subscription.plan_type === 'freeTrial' && (
          <Card>
            <CardHeader>
              <CardTitle>Upgrade Benefits</CardTitle>
              <CardDescription>Get more with a paid plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Unlimited Reports</p>
                    <p className="text-sm text-muted-foreground">Generate as many reports as you need</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Priority Support</p>
                    <p className="text-sm text-muted-foreground">Get help when you need it</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Advanced Features</p>
                    <p className="text-sm text-muted-foreground">Access to all premium features</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Cloud Storage</p>
                    <p className="text-sm text-muted-foreground">Save reports to Google Drive</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
