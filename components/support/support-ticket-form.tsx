"use client";

/**
 * RA-1355 — in-app support ticket form.
 *
 * Pre-fills user email + name from session so authenticated users never
 * re-type them. Posts to the existing /api/support/tickets endpoint
 * (which Claude-analyzes for category + priority if omitted). Plays with
 * the server-side Claude response-draft pipeline unchanged.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Category = "general" | "billing" | "technical" | "feature_request" | "bug";
type Priority = "low" | "normal" | "high" | "urgent";

export function SupportTicketForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const { data: session } = useSession();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [priority, setPriority] = useState<Priority>("normal");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: session?.user?.email || "anonymous@restoreassist.app",
          name: session?.user?.name || "Anonymous",
          subject: subject.trim(),
          body: body.trim(),
          category,
          priority,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success("Ticket submitted — we'll respond within one business day");
      setSubject("");
      setBody("");
      setCategory("general");
      setPriority("normal");
      onSubmitted?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit ticket";
      toast.error(msg);
      console.error("[support-ticket-form]", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="support-name">Your name</Label>
          <Input
            id="support-name"
            value={session?.user?.name ?? ""}
            disabled
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="support-email">Email</Label>
          <Input
            id="support-email"
            value={session?.user?.email ?? ""}
            disabled
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="support-subject">Subject</Label>
        <Input
          id="support-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Xero sync not working after reconnect"
          maxLength={200}
          className="mt-1"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="support-category">Category</Label>
          <select
            id="support-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          >
            <option value="general">General</option>
            <option value="technical">Technical</option>
            <option value="billing">Billing</option>
            <option value="bug">Bug</option>
            <option value="feature_request">Feature request</option>
          </select>
        </div>
        <div>
          <Label htmlFor="support-priority">Priority</Label>
          <select
            id="support-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="support-body">Message</Label>
        <Textarea
          id="support-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe what happened, what you expected, and what you see now."
          rows={6}
          maxLength={5000}
          className="mt-1"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {body.length} / 5000
        </p>
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
          </>
        ) : (
          "Submit ticket"
        )}
      </Button>
    </form>
  );
}
