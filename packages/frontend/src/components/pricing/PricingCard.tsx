import React from 'react';
import { Check, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { StripePlanDetails } from '../../config/stripe';

interface PricingCardProps {
  plan: StripePlanDetails;
  priceId: string;
  onSelectPlan: (priceId: string, planName: string) => void;
  isLoading?: boolean;
}

export function PricingCard({ plan, priceId, onSelectPlan, isLoading = false }: PricingCardProps) {
  const formatPrice = (amount: number) => {
    return amount === 0 ? 'Free' : `$${amount.toFixed(2)}`;
  };

  const getIntervalText = (interval?: string) => {
    if (!interval) return '';
    return `/${interval}`;
  };

  return (
    <Card
      className={`relative flex flex-col ${
        plan.popular
          ? 'border-primary shadow-lg scale-105'
          : 'border-border'
      }`}
    >
      {/* Popular Badge */}
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-4 py-1">
            <Sparkles className="w-3 h-3 mr-1" />
            Most Popular
          </Badge>
        </div>
      )}

      {/* Best Value Badge */}
      {plan.badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <Badge variant="secondary" className="px-4 py-1">
            {plan.badge}
          </Badge>
        </div>
      )}

      <CardHeader className="pb-8 pt-6">
        <CardTitle className="text-xl font-semibold">{plan.displayName}</CardTitle>
        <CardDescription className="mt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-foreground">
              {formatPrice(plan.amount)}
            </span>
            {plan.interval && (
              <span className="text-muted-foreground text-lg">
                {getIntervalText(plan.interval)}
              </span>
            )}
          </div>
          {plan.monthlyEquivalent && (
            <p className="text-sm text-muted-foreground mt-1">
              ${plan.monthlyEquivalent}/month billed annually
            </p>
          )}
          {plan.savings && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-1">
              Save ${plan.savings}/year
            </p>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="space-y-3">
          {/* Report Limit */}
          <div className="flex items-start gap-2">
            <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <span className="text-sm">
              {typeof plan.reportLimit === 'number'
                ? `${plan.reportLimit} reports`
                : 'Unlimited reports'}
            </span>
          </div>

          {/* Features */}
          {plan.features.map((feature, index) => (
            <div key={index} className="flex items-start gap-2">
              <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </CardContent>

      <CardFooter className="pt-4">
        <Button
          className="w-full"
          size="lg"
          variant={plan.popular ? 'default' : 'outline'}
          onClick={() => onSelectPlan(priceId, plan.displayName)}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading checkout session" />
              <span>Processing...</span>
            </span>
          ) : (
            plan.amount === 0 ? 'Start Free Trial' : 'Get Started'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
