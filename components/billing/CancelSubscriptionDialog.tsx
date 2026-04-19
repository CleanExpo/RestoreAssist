"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}

type Reason =
  | "too_expensive"
  | "not_using"
  | "missing_feature"
  | "switching"
  | "other";

const REASONS: { value: Reason; label: string }[] = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using", label: "Not using it enough" },
  { value: "missing_feature", label: "Missing a feature I need" },
  { value: "switching", label: "Switching to another tool" },
  { value: "other", label: "Other" },
];

/**
 * Cancellation dialog — replaces the confirm() that used to live in
 * app/dashboard/subscription/page.tsx:109.
 *
 * Captures reason + optional comment before calling /api/cancel-subscription
 * so we have churn signal for product prioritisation. Shows a "Contact us
 * before you go" escape hatch so we can rescue high-signal cancels that
 * have a quick fix (bug, missing integration, misunderstood pricing).
 *
 * RA-1243.
 */
export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  onCancelled,
}: Props) {
  const [reason, setReason] = useState<Reason | "">("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      toast.error("Please select a reason");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, comment: comment.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Cancel failed (${res.status})`);
      }
      toast.success(
        "Subscription cancelled. You'll keep access until the end of your billing period.",
      );
      onCancelled();
      onOpenChange(false);
      setReason("");
      setComment("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel subscription",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Before you go…</DialogTitle>
          <DialogDescription>
            You'll keep access until the end of your current billing period.
            Help us understand why — it takes 10 seconds and directly shapes
            what we build next.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Why are you cancelling?
            </Label>
            <RadioGroup
              value={reason}
              onValueChange={(v) => setReason(v as Reason)}
              className="space-y-2"
            >
              {REASONS.map((r) => (
                <div key={r.value} className="flex items-center gap-2">
                  <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
                  <Label
                    htmlFor={`reason-${r.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment" className="text-sm font-medium">
              Anything else? (optional)
            </Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={
                reason === "missing_feature"
                  ? "Which feature would have kept you?"
                  : reason === "too_expensive"
                    ? "What price would have worked?"
                    : "We read every response."
              }
            />
          </div>

          {(reason === "missing_feature" || reason === "other") && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              If there's a quick fix we can make, we'd rather hear about it than
              lose you. Reply to your welcome email or contact support before
              cancelling — we respond within a business day.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Never mind — keep my subscription
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || !reason}
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin mr-2" />
                Cancelling…
              </>
            ) : (
              "Cancel Subscription"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
