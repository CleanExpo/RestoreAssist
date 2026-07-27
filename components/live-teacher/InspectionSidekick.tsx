"use client";

/**
 * Inspection Sidekick v1 (P0 #2) — text-first assistant in a bottom sheet on
 * inspection detail. Drives the same backend as VoiceAssistant (session +
 * SSE turn routes) but sends readOnlyTools: true, so the model can only run
 * check_report_gaps / lookup_iicrc / recommend_method — nothing writes
 * mid-turn, and every suggestion stays editable before the tech commits it.
 *
 * Gap results render as a cited, editable checklist (tick, edit, copy) —
 * never auto-applied. The /turn route is the real gate: 402 upgradeRequired
 * → subscription, 402 PAYMENT_REQUIRED → BYOK, 401 → session.
 *
 * UI pattern per the Mobbin brief (Cleo AI / Genie / Instacart): sheet (not
 * full-screen) so the inspection stays glanceable behind the assistant;
 * pinned input; quick-prompt chips seed the first turn. No lucide imports
 * (design-md-lint bans net-new icons).
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import BillingGate from "@/components/capacitor/BillingGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  streamTurn,
  type LiveTeacherToolCall,
  type TranscriptTurn,
} from "@/lib/live-teacher/turn-stream";
import type { ReportGap } from "@/lib/live-teacher/tools/check-report-gaps";

import { TranscriptStream } from "./TranscriptStream";

type Jurisdiction = "AU" | "NZ";
type Gate = "subscription" | "byok" | "session";

interface InspectionSidekickProps {
  inspectionId: string;
  jurisdiction?: Jurisdiction;
}

export interface ChecklistRow {
  key: string;
  included: boolean;
  text: string;
  clauseRef: string | null;
  severity: "warn" | "block";
}

const QUICK_PROMPTS = [
  "What's missing on this inspection?",
  "Recommend a drying method for this job",
  "Look up S500 §10.4.1",
];

function deviceOsFromUserAgent(): "ios" | "android" | "web" {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

/**
 * Build editable checklist rows from a check_report_gaps tool result.
 * Returns null when NO successful gaps call happened this stream (leave any
 * existing checklist alone), and [] when a successful call found zero gaps
 * (the stale checklist must clear — the report is complete).
 */
export function checklistFromToolCalls(
  toolCalls: LiveTeacherToolCall[],
): ChecklistRow[] | null {
  const gapsCall = toolCalls.find(
    (c) => c.toolName === "check_report_gaps" && c.ok,
  );
  if (!gapsCall) return null;
  const gaps = (gapsCall.result as { gaps?: ReportGap[] } | undefined)?.gaps;
  if (!Array.isArray(gaps)) return null;
  return gaps.map((g) => ({
    key: g.field,
    included: true,
    text: g.description,
    clauseRef: g.clauseRef ?? null,
    severity: g.severity,
  }));
}

/**
 * Fresh gap rows replace the checklist, but the technician's edits are
 * sacrosanct: for keys that persist, their edited text and tick state win
 * over the regenerated defaults ("editable before commit").
 */
export function mergeChecklist(
  prev: ChecklistRow[] | null,
  fresh: ChecklistRow[],
): ChecklistRow[] | null {
  if (fresh.length === 0) return null;
  if (!prev) return fresh;
  return fresh.map((row) => {
    const existing = prev.find((p) => p.key === row.key);
    return existing
      ? { ...row, included: existing.included, text: existing.text }
      : row;
  });
}

export function InspectionSidekick({
  inspectionId,
  jurisdiction = "AU",
}: InspectionSidekickProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<Gate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistRow[] | null>(null);
  const [copied, setCopied] = useState(false);

  const sessionRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const nextId = () => `sk${(idRef.current += 1)}`;

  const patchTurn = useCallback(
    (id: string, patch: Partial<TranscriptTurn>) => {
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    const res = await fetch("/api/live-teacher/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspectionId,
        jurisdiction,
        deviceOs: deviceOsFromUserAgent(),
        hadLidar: false,
      }),
    });
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "This inspection could not be found."
          : "Could not start a Sidekick session.",
      );
    }
    const body = await res.json();
    const sid = body?.data?.sessionId as string | undefined;
    if (!sid) throw new Error("Could not start a Sidekick session.");
    sessionRef.current = sid;
    return sid;
  }, [inspectionId, jurisdiction]);

  const send = useCallback(
    async (promptText?: string) => {
      const utterance = (promptText ?? input).trim();
      if (!utterance || busy) return;
      setError(null);
      setGate(null);
      setCopied(false);

      const userId = nextId();
      const assistantId = nextId();
      setTurns((prev) => [
        ...prev,
        { id: userId, role: "user", content: utterance },
        { id: assistantId, role: "assistant", content: "", pending: true },
      ]);
      setInput("");
      setBusy(true);

      try {
        const sid = await ensureSession();
        const res = await fetch("/api/live-teacher/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            utterance,
            readOnlyTools: true,
          }),
        });

        if (!res.ok) {
          if (res.status === 402) {
            const body = await res.json().catch(() => ({}));
            setGate(body?.upgradeRequired ? "subscription" : "byok");
            setInput(utterance);
          } else if (res.status === 401) {
            setGate("session");
            setInput(utterance);
          } else {
            throw new Error("The Sidekick could not answer. Please try again.");
          }
          setTurns((prev) =>
            prev.filter((t) => t.id !== assistantId && t.id !== userId),
          );
          return;
        }

        const toolCalls: LiveTeacherToolCall[] = [];
        await streamTurn(res, (event) => {
          if (event.type === "token") {
            patchTurn(assistantId, { content: event.content });
          } else if (event.type === "tool_call") {
            toolCalls.push({
              id: event.id,
              toolName: event.toolName,
              ok: event.ok,
              result: event.result,
              error: event.error,
            });
            patchTurn(assistantId, { toolCalls: [...toolCalls] });
            const rows = checklistFromToolCalls(toolCalls);
            if (rows !== null) {
              setChecklist((prev) => mergeChecklist(prev, rows));
            }
          } else if (event.type === "done") {
            patchTurn(assistantId, {
              clauseRefs: event.clauseRefs,
              confidence: event.confidence,
              utteranceId: event.utteranceId,
              pending: false,
            });
          } else if (event.type === "error") {
            patchTurn(assistantId, {
              content: "Sorry — something went wrong mid-answer.",
              pending: false,
            });
          }
        });
      } catch (e) {
        setTurns((prev) =>
          prev.filter((t) => t.id !== assistantId && t.id !== userId),
        );
        setInput(utterance);
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setError(
            "You're offline — your question wasn't sent. Try again when you're back online.",
          );
        } else {
          setError(
            e instanceof Error ? e.message : "Something went wrong. Try again.",
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureSession, input, patchTurn],
  );

  const handleOverride = useCallback(
    async (turnId: string, utteranceId: string, reason: string) => {
      setError(null);
      try {
        const res = await fetch("/api/live-teacher/utterance/override", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ utteranceId, reason }),
        });
        if (!res.ok) {
          throw new Error("Could not record the override. Please try again.");
        }
        patchTurn(turnId, { overridden: true, overrideReason: reason });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    },
    [patchTurn],
  );

  const updateRow = (key: string, patch: Partial<ChecklistRow>) => {
    setChecklist((prev) =>
      prev
        ? prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
        : prev,
    );
    setCopied(false);
  };

  const copyChecklist = async () => {
    if (!checklist) return;
    const lines = checklist
      .filter((r) => r.included)
      .map((r) => `- [ ] ${r.text}${r.clauseRef ? ` [${r.clauseRef}]` : ""}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
    } catch {
      setError("Could not copy the checklist to the clipboard.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" data-testid="sidekick-trigger">
          Ask Sidekick
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="flex h-[85vh] flex-col gap-3">
        <SheetHeader className="text-left">
          <SheetTitle>Inspection Sidekick</SheetTitle>
          <SheetDescription>
            Text assistant for this inspection. Read-only — suggestions stay
            editable until you commit them yourself.
          </SheetDescription>
        </SheetHeader>

        {gate === "subscription" && (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            {/* App Review 3.1.1: in the iOS shell there is no upgrade CTA at
                all — not even one leading to an explanatory placeholder, which
                is itself the upgrade UI Apple rejected (see TrialBanner). */}
            <BillingGate
              fallback={
                <p>
                  The Sidekick needs an active subscription. Subscriptions are
                  managed by your workspace administrator.
                </p>
              }
            >
              <p className="mb-2">
                The Sidekick needs an active subscription.
              </p>
              <Button
                size="sm"
                onClick={() => router.push("/dashboard/pricing")}
              >
                View plans
              </Button>
            </BillingGate>
          </div>
        )}
        {gate === "byok" && (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            <p className="mb-2">
              Your workspace has no Anthropic API key connected.
            </p>
            <Button
              size="sm"
              onClick={() => router.push("/dashboard/settings/ai-providers")}
            >
              Connect a key
            </Button>
          </div>
        )}
        {gate === "session" && (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            <p className="mb-2">Your sign-in expired. Sign in and ask again.</p>
            <Button size="sm" onClick={() => router.push("/login")}>
              Sign in
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {turns.length === 0 ? (
            <div className="flex h-full flex-col items-start justify-center gap-2 px-1">
              <p className="text-sm text-muted-foreground">
                Ask about this inspection, or start from a prompt:
              </p>
              {QUICK_PROMPTS.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void send(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          ) : (
            <TranscriptStream turns={turns} onOverride={handleOverride} />
          )}

          {checklist && (
            <section
              aria-label="Report gap checklist"
              className="mt-3 rounded-md border p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Report gaps — edit before committing
                </h3>
                <Button size="sm" variant="outline" onClick={copyChecklist}>
                  {copied ? "Copied" : "Copy checklist"}
                </Button>
              </div>
              <ul className="space-y-2">
                {checklist.map((row) => (
                  <li key={row.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Include ${row.key}`}
                      checked={row.included}
                      onChange={(e) =>
                        updateRow(row.key, { included: e.target.checked })
                      }
                    />
                    <Input
                      aria-label={`Edit ${row.key}`}
                      value={row.text}
                      onChange={(e) =>
                        updateRow(row.key, { text: e.target.value })
                      }
                      className="h-8 flex-1 text-sm"
                    />
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.clauseRef ?? ""}
                      {row.severity === "block" ? " · blocking" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            aria-label="Ask the Sidekick"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. What's missing before I can submit this report?"
            rows={2}
            className="flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button type="submit" disabled={busy || input.trim().length === 0}>
            {busy ? "Thinking…" : "Ask"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
