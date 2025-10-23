import React, { useState } from 'react';
import { CreditCard, Loader2, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { getPriceId } from '../config/stripe';

interface UpgradeToPaidButtonProps {
  userId: string;
  userEmail: string;
  planType?: 'monthly' | 'yearly';
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

export function UpgradeToPaidButton({
  userId,
  userEmail,
  planType = 'monthly',
  variant = 'default',
  size = 'default',
  fullWidth = false,
  className = '',
}: UpgradeToPaidButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleUpgrade = async () => {
    setIsLoading(true);

    try {
      const apiUrl = getApiBaseUrl();
      const priceId = getPriceId(planType);
      const planName = planType === 'monthly' ? 'Professional Monthly' : 'Professional Yearly';

      // Call backend to create Stripe checkout session
      const response = await fetch(`${apiUrl}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          priceId,
          planName,
          email: userEmail,
          userId: userId,
          successUrl: `${window.location.origin}/checkout/success?plan=${planType}`,
          cancelUrl: `${window.location.origin}/dashboard`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const data = await response.json();

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start checkout. Please try again.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleUpgrade}
      disabled={isLoading}
      className={`${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Redirecting...
        </>
      ) : (
        <>
          <Zap className="mr-2 h-4 w-4" />
          Upgrade to {planType === 'monthly' ? 'Monthly' : 'Yearly'}
        </>
      )}
    </Button>
  );
}
