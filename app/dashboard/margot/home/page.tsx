"use client";
/**
 * Margot Overview — status tiles for ops (health, Telegram, Linear, schedules, corpus).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ExternalLinkIcon, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DashboardPanel,
  DashboardPanelHeader,
  dashboardSurfaceClass,
} from "@/app/dashboard/components/DashboardPanel";
import { cn } from "@/lib/utils";
import { SocialRolePromptCard } from "@/components/margot/SocialRolePromptCard";

interface ApiEnvelope<T> {
  data: T;
  fetchedAt: string;
  stale?: boolean;
  reason?: string;
}

interface HealthData {
  online: boolean;
  lastHeartbeat: string | null;
  uptime?: number;
  stale: boolean;
  reason?: string;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  state: string;
  assignee: string | null;
  url: string;
  team: string;
}

interface TelegramMessage {
  id: string;
  from: "user" | "assistant";
  text: string;
  ts: string;
}

interface Schedule {
  id: string;
  name: string;
  cronExpr: string;
  nextRunAt: string | null;
  lastStatus: string | null;
}

interface CorpusData {
  fileCount: number | null;
  lastUploadAt: string | null;
  storeName: string | null;
  stale: boolean;
}

function usePoll<T>(url: string, intervalMs: number) {
  const [result, setResult] = useState<ApiEnvelope<T> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (res.ok) setResult(await res.json());
    } catch {
      /* keep last good payload */
    }
    setLoading(false);
  }, [url]);

  useEffect(() => {
    void fetchData();
    const id = setInterval(() => void fetchData(), intervalMs);
    return () => clearInterval(id);
  }, [fetchData, intervalMs]);

  return { data: result, loading };
}

function UpdatedAt({ ts, stale }: { ts?: string; stale?: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!ts) return null;
  const secs = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  const label = secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
  return (
    <span
      className={cn(
        "text-[11px]",
        stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}
    >
      {stale ? "stale · " : ""}updated {label}
    </span>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-3.5 animate-pulse rounded bg-neutral-200 dark:bg-slate-700"
        />
      ))}
    </div>
  );
}

function StatusDot({
  tone,
}: {
  tone: "ok" | "warn" | "bad" | "idle";
}) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        tone === "ok" && "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]",
        tone === "warn" && "bg-amber-500",
        tone === "bad" && "bg-rose-500",
        tone === "idle" && "bg-neutral-300 dark:bg-slate-600",
      )}
      aria-hidden
    />
  );
}

function HeroTile() {
  const { data, loading } = usePoll<HealthData>("/api/margot/health", 30_000);
  const online = data?.data?.online ?? false;
  const tone: "ok" | "warn" | "bad" | "idle" = loading
    ? "idle"
    : online
      ? "ok"
      : data?.stale
        ? "warn"
        : "bad";

  return (
    <DashboardPanel>
      <DashboardPanelHeader
        title="Margot status"
        description="Heartbeat from the ops assistant runtime."
        action={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}
      />
      {loading ? (
        <LoadingRows />
      ) : (
        <div className="flex items-center gap-3">
          <StatusDot tone={tone} />
          <div>
            <p className="text-base font-semibold text-foreground">
              {online ? "Online" : (data?.data?.reason ?? "Unreachable")}
            </p>
            {data?.data?.lastHeartbeat ? (
              <p className="text-xs text-muted-foreground">
                Heartbeat:{" "}
                {new Date(data.data.lastHeartbeat).toLocaleTimeString("en-AU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            ) : null}
            {data?.data?.uptime != null ? (
              <p className="text-xs text-muted-foreground">
                Uptime: {Math.round(data.data.uptime / 3600)}h{" "}
                {Math.round((data.data.uptime % 3600) / 60)}m
              </p>
            ) : null}
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}

function TelegramTile() {
  const { data, loading } = usePoll<{ messages: TelegramMessage[] }>(
    "/api/margot/telegram/recent",
    60_000,
  );
  const messages = data?.data?.messages ?? [];

  return (
    <DashboardPanel className="h-full">
      <DashboardPanelHeader
        title="Telegram — last 10"
        action={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}
      />
      {loading ? (
        <LoadingRows />
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {data?.reason ?? "No messages logged yet"}
        </p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className="flex gap-2 text-sm">
              <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
                {new Date(m.ts).toLocaleTimeString("en-AU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span
                className={cn(
                  "min-w-0 truncate",
                  m.from === "assistant"
                    ? "text-primary"
                    : "text-foreground",
                )}
              >
                <span className="text-muted-foreground">
                  {m.from === "user" ? "you: " : "margot: "}
                </span>
                {m.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

const PRIORITY: Record<number, { label: string; className: string }> = {
  1: {
    label: "Urgent",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  2: {
    label: "High",
    className: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  },
  3: {
    label: "Medium",
    className: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
  },
  4: {
    label: "Low",
    className: "bg-neutral-500/10 text-muted-foreground",
  },
};

function LinearTile() {
  const { data, loading } = usePoll<{ issues: LinearIssue[] }>(
    "/api/margot/linear/top",
    60_000,
  );
  const issues = data?.data?.issues ?? [];

  return (
    <DashboardPanel className="h-full">
      <DashboardPanelHeader
        title="Linear — urgent / high"
        action={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}
      />
      {loading ? (
        <LoadingRows />
      ) : issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {data?.reason ?? "No urgent/high issues"}
        </p>
      ) : (
        <ul className="space-y-2">
          {issues.map((issue) => {
            const pri = PRIORITY[issue.priority] ?? PRIORITY[4];
            return (
              <li key={issue.id} className="flex items-center gap-2 text-sm">
                <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">
                  {issue.identifier}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    pri.className,
                  )}
                >
                  {pri.label}
                </span>
                <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-primary"
                  aria-label={`Open ${issue.identifier} in Linear`}
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}

function SchedulesTile() {
  const { data, loading } = usePoll<{ schedules: Schedule[] }>(
    "/api/margot/schedules",
    300_000,
  );
  const schedules = data?.data?.schedules ?? [];

  return (
    <DashboardPanel className="h-full">
      <DashboardPanelHeader
        title="Scheduled briefings"
        action={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}
      />
      {loading ? (
        <LoadingRows />
      ) : schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No schedules configured</p>
      ) : (
        <ul className="space-y-2">
          {schedules.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="font-medium text-foreground">{s.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {s.nextRunAt
                  ? new Date(s.nextRunAt).toLocaleTimeString("en-AU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : s.cronExpr}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

function CorpusTile() {
  const { data, loading } = usePoll<CorpusData>(
    "/api/margot/corpus/status",
    300_000,
  );
  const corpus = data?.data;
  const tone: "ok" | "warn" | "bad" | "idle" = !corpus
    ? "idle"
    : corpus.stale
      ? "warn"
      : corpus.fileCount != null
        ? "ok"
        : "bad";

  return (
    <DashboardPanel className="h-full">
      <DashboardPanelHeader
        title="Corpus status"
        action={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}
      />
      {loading ? (
        <LoadingRows />
      ) : (
        <div className="flex items-center gap-3">
          <StatusDot tone={tone} />
          <div>
            {corpus?.fileCount != null ? (
              <>
                <p className="text-base font-semibold">
                  {corpus.fileCount} files
                </p>
                {corpus.lastUploadAt ? (
                  <p className="text-xs text-muted-foreground">
                    Last upload:{" "}
                    {new Date(corpus.lastUploadAt).toLocaleDateString("en-AU")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {data?.reason ?? "Corpus data unavailable"}
              </p>
            )}
            {corpus?.storeName ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                {corpus.storeName}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}

export default function MargotHomeDashboard() {
  const nowRef = useRef(new Date());
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      nowRef.current = new Date();
      setTick((t) => t + 1);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const now = nowRef.current;
  const dateStr = now.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {dateStr} · {timeStr}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live ops tiles refresh on their own. Use Chat to train social
            comments.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/margot">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Open chat
          </Link>
        </Button>
      </div>

      <HeroTile />

      <div className="grid gap-4 md:grid-cols-2">
        <TelegramTile />
        <LinearTile />
        <SchedulesTile />
        <CorpusTile />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SocialRolePromptCard />
        <DashboardPanel className={cn(dashboardSurfaceClass)}>
          <DashboardPanelHeader
            title="Social comment rule"
            description="Phil: reign in false “restoration” replies on social."
          />
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Badge variant="outline" className="shrink-0">
                Engage
              </Badge>
              Water, flood, fire, mould, storm, claims, IICRC, building work
            </li>
            <li className="flex gap-2">
              <Badge variant="outline" className="shrink-0">
                Ignore
              </Badge>
              Cars, utes, teeth, furniture, art, hair, film, data restore
            </li>
            <li className="flex gap-2">
              <Badge variant="outline" className="shrink-0">
                Unsure
              </Badge>
              Bare “restoration” or mixed signals — do not comment
            </li>
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/dashboard/margot/social">
              Open social training
            </Link>
          </Button>
        </DashboardPanel>
      </div>
    </div>
  );
}
