'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ScheduledEmail {
  id: string;
  recipient: string;
  scheduledAt: string;
  status: string;
  report: {
    id: string;
    title: string;
    clientName: string;
    propertyAddress: string;
  };
}

export function ScheduledEmailsList() {
  const [emails, setEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmails();
  }, []);

  async function fetchEmails() {
    try {
      const response = await fetch('/api/email/schedule?status=pending');
      if (response.ok) {
        const data = await response.json();
        setEmails(data);
      }
    } catch (error) {
      console.error('Error fetching scheduled emails:', error);
    } finally {
      setLoading(false);
    }
  }

  async function cancelEmail(id: string) {
    if (!confirm('Are you sure you want to cancel this scheduled email?')) {
      return;
    }

    try {
      const response = await fetch(`/api/email/scheduled/${id}/cancel`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Email cancelled');
        fetchEmails();
      } else {
        toast.error('Failed to cancel email');
      }
    } catch (error) {
      console.error('Error cancelling email:', error);
      toast.error('Failed to cancel email');
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Scheduled Emails</h3>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Scheduled Emails</h3>
            <p className="text-sm text-muted-foreground">No scheduled emails</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="font-semibold">Scheduled Emails</h3>
          <p className="text-sm text-muted-foreground">
            {emails.length} email{emails.length === 1 ? '' : 's'} scheduled
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {emails.map((email) => (
          <div
            key={email.id}
            className="flex items-start justify-between rounded-md border p-3"
          >
            <div className="flex-1">
              <p className="text-sm font-medium">{email.report.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                To: {email.recipient}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Scheduled: {format(new Date(email.scheduledAt), 'PPp')}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => cancelEmail(email.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
