"use client";

/**
 * RA-1355 — authenticated support ticket + history.
 *
 * Sits under /dashboard/help/contact — /dashboard/help is the FAQ
 * page, /dashboard/support is admin triage. This is the missing
 * user-facing "submit + view your tickets" surface.
 *
 * Posts to /api/support/tickets (Claude-classifies if category left
 * default); loads user's own history from /api/support/tickets/mine.
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { SupportTicketForm } from "@/components/support/support-ticket-form";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "default",
  in_progress: "secondary",
  resolved: "outline",
  closed: "outline",
};

const PRIORITY_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
  urgent: "destructive",
  high: "destructive",
  normal: "default",
  low: "secondary",
};

export default function ContactSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/support/tickets/mine");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { tickets: Ticket[] };
      setTickets(json.tickets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Contact support</h1>
        <p className="text-sm text-muted-foreground">
          Send us a ticket — we respond within one business day, Mon–Fri AEST.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New ticket</CardTitle>
          <CardDescription>
            We&apos;ll use your signed-in name + email. Include what you expected vs what you see
            now — the more detail, the faster we can help.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupportTicketForm onSubmitted={fetchTickets} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your tickets</CardTitle>
          <CardDescription>
            {tickets.length === 0
              ? "No tickets yet."
              : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="text-destructive text-sm">Couldn&apos;t load tickets: {error}</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Your submitted tickets will appear here.
            </p>
          ) : (
            <ul className="divide-y">
              {tickets.map((t) => (
                <li key={t.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.category} · opened {new Date(t.createdAt).toLocaleDateString("en-AU")}
                      {t.resolvedAt && (
                        <> · resolved {new Date(t.resolvedAt).toLocaleDateString("en-AU")}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={PRIORITY_VARIANT[t.priority] ?? "default"}>
                      {t.priority}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "default"}>{t.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
