'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface EmailStatus {
  connected: boolean;
  provider: string | null;
  email: string | null;
  rateLimit: {
    remaining: number;
    resetAt: string;
  };
}

export function ConnectEmailCard() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const response = await fetch('/api/email/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error fetching email status:', error);
    } finally {
      setLoading(false);
    }
  }

  async function connectGoogle() {
    try {
      setConnecting(true);
      const response = await fetch('/api/email/google');
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error('Failed to connect Google account');
      }
    } catch (error) {
      console.error('Error connecting Google:', error);
      toast.error('Failed to connect Google account');
    } finally {
      setConnecting(false);
    }
  }

  async function connectMicrosoft() {
    try {
      setConnecting(true);
      const response = await fetch('/api/email/microsoft');
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error('Failed to connect Microsoft account');
      }
    } catch (error) {
      console.error('Error connecting Microsoft:', error);
      toast.error('Failed to connect Microsoft account');
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!confirm('Are you sure you want to disconnect your email account?')) {
      return;
    }

    try {
      const response = await fetch('/api/email/disconnect', {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Email account disconnected');
        fetchStatus();
      } else {
        toast.error('Failed to disconnect email account');
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Failed to disconnect email account');
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Email Connection</h3>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Email Connection</h3>
            {status?.connected ? (
              <div className="mt-1 space-y-1">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Connected to {status.email} via {status.provider}
                </p>
                <p className="text-xs text-muted-foreground">
                  {status.rateLimit.remaining} emails remaining this hour
                </p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Connect your email to send reports directly
              </p>
            )}
          </div>
        </div>

        {status?.connected ? (
          <Button variant="outline" size="sm" onClick={disconnect}>
            Disconnect
          </Button>
        ) : null}
      </div>

      {!status?.connected && (
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            onClick={connectGoogle}
            disabled={connecting}
            className="flex-1"
          >
            Connect Google
          </Button>

          <Button
            variant="outline"
            onClick={connectMicrosoft}
            disabled={connecting}
            className="flex-1"
          >
            Connect Microsoft
          </Button>
        </div>
      )}

      {!status?.connected && (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-100">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Why connect email?</p>
            <p className="mt-1 text-xs">
              Send reports directly from your own email account. We use OAuth 2.0 for secure authentication.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
