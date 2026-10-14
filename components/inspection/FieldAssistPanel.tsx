"use client";

import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";

export function FieldAssistPanel({ inspectionId }: { inspectionId: string }) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/field-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? "Assist unavailable");
      }
      setReply(json.data?.reply ?? json.data?.context?.completenessHint ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex h-full min-h-[120px] flex-col rounded-xl border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 p-4 shadow-sm space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Field assist
      </h3>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What should I capture next on site?"
        className="w-full min-h-[88px] rounded-lg border border-slate-200 dark:border-slate-600 bg-transparent px-3 py-2 text-sm"
        aria-label="Question for field assist"
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => void ask()}
        className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get guidance"}
      </button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {reply && (
        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {reply}
        </p>
      )}
    </section>
  );
}
