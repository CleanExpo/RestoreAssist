"use client";

/**
 * RA-8596 — cancellation feedback on the Business admin page.
 *
 * Reads /api/admin/cancellation-feedback (platform staff only). Shows a
 * count per reason over the last 90 days and the recent answers, newest
 * first, with "Load more" paging. The comment is rendered as a plain text
 * node; React escapes it, so customer text is never interpreted as HTML.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error-message";

// Labels match the options in components/billing/CancelSubscriptionDialog.tsx.
export const CANCEL_REASON_LABELS: Record<string, string> = {
  too_expensive: "Too expensive",
  not_using: "Not using it enough",
  missing_feature: "Missing a feature I need",
  switching: "Switching to another tool",
  other: "Other",
};

interface FeedbackItem {
  id: string;
  createdAt: string;
  reason: string;
  comment: string | null;
  subscriptionPlan: string | null;
  tenureDays: number | null;
}

interface FeedbackResponse {
  items: FeedbackItem[];
  nextCursor: string | null;
  reasonCounts90d: Record<string, number>;
}

function reasonLabel(reason: string) {
  return CANCEL_REASON_LABELS[reason] ?? reason;
}

export function CancellationFeedbackPanel() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor: string | null) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await fetch(`/api/admin/cancellation-feedback${qs}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(apiErrorMessage(body) || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as FeedbackResponse;
      setItems((prev) => (cursor ? [...prev, ...json.items] : json.items));
      if (!cursor) setCounts(json.reasonCounts90d);
      setNextCursor(json.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  const total90d = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <section
      aria-labelledby="cancellation-feedback-heading"
      className="space-y-3"
    >
      <h2 id="cancellation-feedback-heading" className="text-lg font-semibold">
        Why customers cancelled
      </h2>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cancel reasons
        </div>
      ) : error ? (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">
            Unable to load cancel reasons: {error}
          </p>
          <Button variant="outline" size="sm" onClick={() => load(null)}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Reasons (last 90 days)</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {total90d}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-5">
                {Object.keys(CANCEL_REASON_LABELS).map((reason) => (
                  <li key={reason} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {reasonLabel(reason)}
                    </span>
                    <span className="tabular-nums">{counts[reason] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cancellation feedback recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-2">
                      Date
                    </th>
                    <th scope="col" className="p-2">
                      Reason
                    </th>
                    <th scope="col" className="p-2">
                      Comment
                    </th>
                    <th scope="col" className="p-2">
                      Plan at cancel
                    </th>
                    <th scope="col" className="p-2 text-right">
                      Tenure (days)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t align-top">
                      <td className="whitespace-nowrap p-2">
                        {new Date(item.createdAt).toLocaleDateString("en-AU")}
                      </td>
                      <td className="p-2">{reasonLabel(item.reason)}</td>
                      <td className="max-w-md whitespace-pre-wrap break-words p-2">
                        {item.comment ?? (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="p-2">{item.subscriptionPlan ?? "Unknown"}</td>
                      <td className="p-2 text-right tabular-nums">
                        {item.tenureDays ?? "Unknown"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {nextCursor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(nextCursor)}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load more
            </Button>
          )}
        </>
      )}
    </section>
  );
}
