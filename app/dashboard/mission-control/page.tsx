"use client";
/**
 * Unite-Group Mission Control — deep link from RestoreAssist (product UI).
 * Tier 2: Hermes health + Nexus context bundle preview.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";

const HERMES_OPS =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_HERMES_OPS_URL) ||
  "http://127.0.0.1:9119/ops";

interface HealthData {
  online: boolean;
  stale: boolean;
  reason?: string;
}

type NexusContext = {
  fetchedAt: string;
  source?: string;
  voice: string;
  icp: string;
  memorySummary: string;
  wikiIndexExcerpt: string;
};

function excerpt(text: string, max = 280): string {
  const t = text.trim();
  if (!t) return "(empty)";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default function MissionControlPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [context, setContext] = useState<NexusContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/margot/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.data as HealthData))
      .catch(() =>
        setHealth({ online: false, stale: true, reason: "Health API error" }),
      );
  }, []);

  useEffect(() => {
    fetch("/api/mission-control/context")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        setContext((j.data ?? j) as NexusContext);
        setContextError(null);
      })
      .catch((e) =>
        setContextError(
          e instanceof Error ? e.message : "Failed to load context",
        ),
      );
  }, []);

  const online = health?.online === true;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Unite-Group · Nexus Hub</p>
        <h1 className="text-2xl font-semibold mt-1">Mission Control</h1>
        <p className="text-muted-foreground mt-2">
          Group operator surface — not RestoreAssist field CRM. Your primary
          home UI is the Nexus Hub{" "}
          <strong>Command Center</strong> on disk (large type + read-aloud), not
          this page or the Hermes admin sidebar.
        </p>
      </header>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
        <p className="font-medium">CEO Command Center (on your PC)</p>
        <p className="text-sm text-muted-foreground">
          Run on the Nexus Hub machine:{" "}
          <code className="text-xs">D:\Hermes\scripts\Open-Mission-Control.ps1</code>
          — opens <code className="text-xs">mission-control\index.html</code> and
          the TTS proxy on port 9120.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium">Hermes</span>
          <span
            className={
              online
                ? "text-success text-sm font-medium"
                : "text-amber-600 text-sm font-medium"
            }
          >
            {health === null
              ? "Checking…"
              : online
                ? "Online"
                : "Offline / not configured"}
          </span>
        </div>
        {health?.reason && (
          <p className="text-sm text-muted-foreground">{health.reason}</p>
        )}
        <a
          href={HERMES_OPS}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          Open Hermes Command Center
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
        <p className="text-xs text-muted-foreground">
          Wiki: <code>{HERMES_OPS.replace(/\/ops\/?$/, "")}/wiki</code> · Memory:{" "}
          <code>{HERMES_OPS.replace(/\/ops\/?$/, "")}/memory</code>
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="font-medium">Nexus context bundle</h2>
        {contextError && (
          <p className="text-sm text-amber-600">{contextError}</p>
        )}
        {context ? (
          <>
            <p className="text-xs text-muted-foreground">
              Loaded {context.fetchedAt}
              {context.source ? ` · ${context.source}` : ""}
            </p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">Voice</p>
                <p className="mt-1 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {excerpt(context.voice, 400)}
                </p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">ICP</p>
                <p className="mt-1 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {excerpt(context.icp, 400)}
                </p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">
                  Memory summary
                </p>
                <p className="mt-1 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {excerpt(context.memorySummary, 320)}
                </p>
              </div>
            </div>
          </>
        ) : (
          !contextError && (
            <p className="text-sm text-muted-foreground">Loading context…</p>
          )
        )}
      </div>

      <ul className="space-y-2 text-sm">
        <li>
          <Link href="/dashboard/margot" className="text-primary hover:underline">
            Margot dashboard
          </Link>
          {" — chat injects Nexus context when "}
          <code className="text-xs">MARGOT_NEXUS_CONTEXT</code> enabled
        </li>
        <li>
          <span className="text-muted-foreground">
            Hermes proxy chat:{" "}
            <code className="text-xs">POST /api/margot/hermes-proxy</code>
          </span>
        </li>
      </ul>
    </div>
  );
}
