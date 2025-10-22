import * as Sentry from '@sentry/react';
import { captureException, captureMessage, addBreadcrumb } from '../sentry';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  context?: Record<string, any>;
}

/**
 * Enhanced fetch wrapper with Sentry monitoring
 */
async function monitoredFetch(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const { skipAuth, context, ...fetchOptions } = options;

  // Add authentication header if needed
  if (!skipAuth) {
    const token = localStorage.getItem('access_token');
    if (token) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  }

  // Start performance transaction
  const transaction = Sentry.startTransaction({
    op: 'http.request',
    name: `${fetchOptions.method || 'GET'} ${url}`,
    data: {
      url,
      method: fetchOptions.method || 'GET',
      ...context,
    },
  });

  // Add breadcrumb for debugging
  addBreadcrumb({
    category: 'api',
    message: `API Request: ${fetchOptions.method || 'GET'} ${url}`,
    level: 'info',
    data: context,
  });

  try {
    const startTime = performance.now();
    const response = await fetch(url, fetchOptions);
    const duration = performance.now() - startTime;

    // Track performance metrics
    transaction.setData('response.status', response.status);
    transaction.setData('response.duration_ms', duration);

    // Log slow requests (> 3 seconds)
    if (duration > 3000) {
      captureMessage(`Slow API request detected: ${url}`, 'warning', {
        duration_ms: duration,
        status: response.status,
        ...context,
      });
    }

    // Handle errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));

      // Categorize errors
      if (response.status === 401) {
        // Don't report auth errors to Sentry (expected behavior)
        addBreadcrumb({
          category: 'auth',
          message: 'Authentication failed',
          level: 'warning',
        });
      } else if (response.status === 403) {
        // Don't report permission errors
        addBreadcrumb({
          category: 'auth',
          message: 'Permission denied',
          level: 'warning',
        });
      } else if (response.status >= 500) {
        // Report server errors
        captureException(new Error(`Server error: ${errorData.message || response.statusText}`), {
          url,
          status: response.status,
          method: fetchOptions.method || 'GET',
          errorData,
          ...context,
        });
      } else if (response.status === 429) {
        // Report rate limiting
        captureMessage('Rate limit exceeded', 'warning', {
          url,
          retryAfter: response.headers.get('Retry-After'),
          ...context,
        });
      }

      transaction.setStatus('http_error');
    } else {
      transaction.setStatus('ok');
    }

    return response;
  } catch (error) {
    // Network errors
    transaction.setStatus('network_error');

    if (error instanceof Error) {
      // Check if it's a network error
      if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
        captureMessage('Network error occurred', 'error', {
          url,
          error: error.message,
          ...context,
        });
      } else {
        // Other unexpected errors
        captureException(error, {
          url,
          method: fetchOptions.method || 'GET',
          ...context,
        });
      }
    }

    throw error;
  } finally {
    transaction.finish();
  }
}

/**
 * Stripe checkout monitoring
 */
export async function createCheckoutSessionWithMonitoring(
  priceId: string,
  email: string,
  context?: Record<string, any>
): Promise<{ sessionId: string; url: string }> {
  const transaction = Sentry.startTransaction({
    op: 'stripe.checkout',
    name: 'Create Checkout Session',
  });

  try {
    const response = await monitoredFetch(`${API_BASE_URL}/stripe/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId, email }),
      context: {
        operation: 'stripe_checkout',
        priceId,
        ...context,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create checkout session');
    }

    const data = await response.json();

    // Track successful checkout creation
    addBreadcrumb({
      category: 'stripe',
      message: 'Checkout session created',
      level: 'info',
      data: { sessionId: data.sessionId },
    });

    transaction.setStatus('ok');
    return data;
  } catch (error) {
    transaction.setStatus('error');

    // Track checkout errors
    captureException(error as Error, {
      operation: 'stripe_checkout_create',
      priceId,
      ...context,
    });

    throw error;
  } finally {
    transaction.finish();
  }
}

/**
 * Google OAuth monitoring
 */
export async function handleGoogleLoginWithMonitoring(
  credential: string,
  context?: Record<string, any>
): Promise<any> {
  const transaction = Sentry.startTransaction({
    op: 'auth.google',
    name: 'Google OAuth Login',
  });

  try {
    const response = await monitoredFetch(`${API_BASE_URL}/trial-auth/google-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
      skipAuth: true,
      context: {
        operation: 'google_oauth',
        ...context,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Google login failed');
    }

    const data = await response.json();

    // Track successful login
    addBreadcrumb({
      category: 'auth',
      message: 'Google OAuth login successful',
      level: 'info',
      data: { userId: data.user?.id },
    });

    // Set user context for Sentry
    if (data.user) {
      Sentry.setUser({
        id: data.user.id,
        email: data.user.email,
      });
    }

    transaction.setStatus('ok');
    return data;
  } catch (error) {
    transaction.setStatus('error');

    // Track OAuth errors
    captureException(error as Error, {
      operation: 'google_oauth_login',
      ...context,
    });

    throw error;
  } finally {
    transaction.finish();
  }
}

/**
 * Report generation monitoring
 */
export async function generateReportWithMonitoring(
  request: any,
  context?: Record<string, any>
): Promise<any> {
  const transaction = Sentry.startTransaction({
    op: 'report.generate',
    name: 'Generate Report',
    data: {
      damageType: request.damageType,
      state: request.state,
    },
  });

  try {
    const startTime = performance.now();

    const response = await monitoredFetch(`${API_BASE_URL}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      context: {
        operation: 'report_generation',
        damageType: request.damageType,
        ...context,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate report');
    }

    const data = await response.json();
    const duration = performance.now() - startTime;

    // Track generation time
    transaction.setMeasurement('generation_duration', duration, 'millisecond');

    // Log slow generations (> 30 seconds)
    if (duration > 30000) {
      captureMessage('Slow report generation', 'warning', {
        duration_ms: duration,
        reportId: data.id,
        damageType: request.damageType,
        ...context,
      });
    }

    addBreadcrumb({
      category: 'report',
      message: 'Report generated successfully',
      level: 'info',
      data: {
        reportId: data.id,
        duration_ms: duration,
      },
    });

    transaction.setStatus('ok');
    return data;
  } catch (error) {
    transaction.setStatus('error');

    captureException(error as Error, {
      operation: 'report_generation',
      request,
      ...context,
    });

    throw error;
  } finally {
    transaction.finish();
  }
}

/**
 * Trial activation monitoring
 */
export async function activateTrialWithMonitoring(
  paymentMethodId: string,
  context?: Record<string, any>
): Promise<any> {
  const transaction = Sentry.startTransaction({
    op: 'trial.activate',
    name: 'Activate Free Trial',
  });

  try {
    const response = await monitoredFetch(`${API_BASE_URL}/trial-auth/activate-trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethodId }),
      context: {
        operation: 'trial_activation',
        ...context,
      },
    });

    if (!response.ok) {
      const error = await response.json();

      // Track fraud detection
      if (error.fraudDetected) {
        captureMessage('Fraud detected during trial activation', 'warning', {
          fraudFlags: error.fraudFlags,
          ...context,
        });
      }

      throw new Error(error.message || 'Failed to activate trial');
    }

    const data = await response.json();

    addBreadcrumb({
      category: 'trial',
      message: 'Trial activated successfully',
      level: 'info',
      data: {
        trialEnd: data.trialEnd,
      },
    });

    transaction.setStatus('ok');
    return data;
  } catch (error) {
    transaction.setStatus('error');

    captureException(error as Error, {
      operation: 'trial_activation',
      ...context,
    });

    throw error;
  } finally {
    transaction.finish();
  }
}

export default {
  fetch: monitoredFetch,
  createCheckoutSession: createCheckoutSessionWithMonitoring,
  handleGoogleLogin: handleGoogleLoginWithMonitoring,
  generateReport: generateReportWithMonitoring,
  activateTrial: activateTrialWithMonitoring,
};