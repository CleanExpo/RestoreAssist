"use client";
/**
 * Unite-Group Mission Control — deep link from RestoreAssist (product UI).
 * Tier 2: Hermes health + Nexus context bundle preview.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";

const HERMES_OPS =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_HERMES_OPS_URL) ||
  "http://127.0.0.1:9119/ops";

interface HealthData {
  online: boolean;
  stale: boolean;
  reason?: string;
}

type FieldStatus = "loaded" | "empty" | "missing" | "error";

type NexusContext = {
  fetchedAt: string;
  source?: string;
  fields?: Partial<Record<string, FieldStatus>>;
  sources?: {
    disk: boolean;
    hermes: "off" | "ok" | "unreachable";
    hermesReason?: string;
  };
  voice: string;
  icp: string;
  memorySummary: string;
  wikiIndexExcerpt: string;
};

type Envelope<T> = {
  data: T;
  fetchedAt: string;
  stale: boolean;
  reason?: string;
};

type Card = {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  url: string;
  assignee: string | null;
  team: string | null;
};

type BoardColumn = {
  id: string;
  name: string;
  type: string;
  position: number;
  cards: Card[];
};

type WorkerHealth = {
  name: string;
  url: string | null;
  online: boolean;
  lastHeartbeat: string | null;
  stale: boolean;
  reason?: string;
  uptime?: unknown;
  version?: unknown;
};

/**
 * The endpoints type uptime and version as unknown because they come from a
 * body this repository does not control. Rendering one straight into JSX
 * crashes React if it arrives as an object, so only scalars are shown.
 */
function scalar(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * A degraded read is announced, never absorbed. This is the one piece of copy
 * that keeps an unreachable Linear from looking like a finished week.
 */
function StaleNotice({ reason }: { reason?: string }) {
  return (
    <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
      Read incomplete{reason ? `: ${reason}` : ""}. What is shown below may be
      partial, and what is missing is unknown rather than absent.
    </p>
  );
}

/**
 * Why a field is blank matters more than the fact that it is. Rendering a
 * failed read and a genuinely empty file identically is the same lie as
 * showing an unreachable board as a finished week.
 */
const STATUS_COPY: Record<FieldStatus, string> = {
  loaded: "",
  empty: "(file present but empty)",
  missing: "(not synced to this deployment)",
  error: "(could not be read)",
};

function excerpt(text: string, max = 280): string {
  const t = text.trim();
  if (!t) return "(empty)";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function ContextField({
  label,
  text,
  status,
  max,
}: {
  label: string;
  text: string;
  status?: FieldStatus;
  max: number;
}) {
  const unavailable = status !== undefined && status !== "loaded";
  return (
    <div>
      <p className="font-medium text-muted-foreground">{label}</p>
      {unavailable ? (
        <p className="mt-1 text-xs italic text-amber-600">
          {STATUS_COPY[status]}
        </p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap font-mono text-xs leading-relaxed">
          {excerpt(text, max)}
        </p>
      )}
    </div>
  );
}

export default function MissionControlPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [context, setContext] = useState<NexusContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [board, setBoard] = useState<Envelope<{
    columns: BoardColumn[];
  }> | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<Envelope<{
    workers: WorkerHealth[];
  }> | null>(null);
  const [workersError, setWorkersError] = useState<string | null>(null);

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

  useEffect(() => {
    fetch("/api/mission-control/board")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        setBoard(j as Envelope<{ columns: BoardColumn[] }>);
        setBoardError(null);
      })
      .catch((e) =>
        setBoardError(e instanceof Error ? e.message : "Failed to load board"),
      );
  }, []);

  useEffect(() => {
    fetch("/api/mission-control/workers")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        setWorkers(j as Envelope<{ workers: WorkerHealth[] }>);
        setWorkersError(null);
      })
      .catch((e) =>
        setWorkersError(
          e instanceof Error ? e.message : "Failed to load worker health",
        ),
      );
  }, []);

  const online = health?.online === true;

  return (
    <div className="mx-auto max-w-9xl space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Unite-Group · Nexus Hub</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Mission Control
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Group operator surface — not RestoreAssist field CRM. Primary home UI
          is the Nexus Hub Command Center on disk. Use{" "}
          <Link
            href="/dashboard/margot/home"
            className="text-primary underline-offset-4 hover:underline"
          >
            Margot Overview
          </Link>{" "}
          for status tiles and social-comment training.
        </p>
      </header>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
        <p className="font-medium">CEO Command Center (on your PC)</p>
        <p className="text-sm text-muted-foreground">
          Run on the Nexus Hub machine:{" "}
          <code className="text-xs">
            D:\Hermes\scripts\Open-Mission-Control.ps1
          </code>
          — opens <code className="text-xs">mission-control\index.html</code>{" "}
          and the TTS proxy on port 9120.
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
          Wiki: <code>{HERMES_OPS.replace(/\/ops\/?$/, "")}/wiki</code> ·
          Memory: <code>{HERMES_OPS.replace(/\/ops\/?$/, "")}/memory</code>
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Board (Linear projection)</h2>
        {boardError && (
          <p className="text-sm text-amber-600">
            Board unavailable: {boardError}. This is a failed read, not an empty
            board.
          </p>
        )}
        {!boardError && board === null && (
          <p className="text-sm text-muted-foreground">Loading board…</p>
        )}
        {board && (
          <>
            {board.stale && <StaleNotice reason={board.reason} />}
            <p className="text-xs text-muted-foreground">
              Read {board.fetchedAt}
            </p>
            {board.data.columns.length === 0 ? (
              !board.stale && (
                <p className="text-sm text-muted-foreground">
                  No open columns returned.
                </p>
              )
            ) : (
              <div className="space-y-3">
                {board.data.columns.map((column) => (
                  <div key={column.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium text-sm">{column.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {column.cards.length}
                      </span>
                    </div>
                    {column.cards.length === 0 ? (
                      !board.stale && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          No open cards.
                        </p>
                      )
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {column.cards.map((card) => (
                          <li key={card.id} className="text-xs">
                            <a
                              href={card.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-primary hover:underline"
                            >
                              {card.identifier}
                            </a>{" "}
                            <span>{card.title}</span>
                            {card.assignee && (
                              <span className="text-muted-foreground">
                                {" "}
                                · {card.assignee}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Worker health</h2>
        {workersError && (
          <p className="text-sm text-amber-600">
            Worker health unavailable: {workersError}. No worker may be assumed
            online.
          </p>
        )}
        {!workersError && workers === null && (
          <p className="text-sm text-muted-foreground">Loading workers…</p>
        )}
        {workers && (
          <>
            {workers.stale && <StaleNotice reason={workers.reason} />}
            <p className="text-xs text-muted-foreground">
              Read {workers.fetchedAt}
            </p>
            {workers.data.workers.length === 0
              ? !workers.stale && (
                  <p className="text-sm text-muted-foreground">
                    No workers configured.
                  </p>
                )
              : workers.data.workers.map((worker) => {
                  const uptime = scalar(worker.uptime);
                  const version = scalar(worker.version);
                  return (
                    <div
                      key={worker.name}
                      className="flex items-start justify-between gap-4 border-t pt-2 text-sm first:border-t-0 first:pt-0"
                    >
                      <div>
                        <p className="font-medium">{worker.name}</p>
                        {worker.reason && (
                          <p className="text-xs text-amber-600">
                            {worker.reason}
                          </p>
                        )}
                        {(uptime || version) && (
                          <p className="text-xs text-muted-foreground">
                            {version ? `v${version}` : ""}
                            {version && uptime ? " · " : ""}
                            {uptime ? `uptime ${uptime}` : ""}
                          </p>
                        )}
                      </div>
                      <span
                        className={
                          worker.online && !worker.stale
                            ? "text-success text-sm font-medium"
                            : "text-amber-600 text-sm font-medium"
                        }
                      >
                        {worker.online && !worker.stale
                          ? "Online"
                          : "Unconfirmed"}
                      </span>
                    </div>
                  );
                })}
          </>
        )}
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
            {context.sources?.hermes === "unreachable" && (
              <p className="text-xs text-amber-600">
                Hermes is configured but did not answer
                {context.sources.hermesReason
                  ? `: ${context.sources.hermesReason}`
                  : ""}
                . The fields it supplies are unavailable, not empty.
              </p>
            )}
            <div className="space-y-3 text-sm">
              <ContextField
                label="Voice"
                text={context.voice}
                status={context.fields?.voice}
                max={400}
              />
              <ContextField
                label="ICP"
                text={context.icp}
                status={context.fields?.icp}
                max={400}
              />
              <ContextField
                label="Memory summary"
                text={context.memorySummary}
                status={context.fields?.memorySummary}
                max={320}
              />
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
          <Link
            href="/dashboard/margot"
            className="text-primary hover:underline"
          >
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
