"use client";
/**
 * Margot Overview — live ops tiles + Phil's social restoration gate (docs/research/social-restoration-relevance.md).
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Ban,
  Bot,
  CheckCircle2,
  ExternalLinkIcon,
  HelpCircle,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DashboardPanel,
  DashboardPanelHeader,
} from "@/app/dashboard/components/DashboardPanel";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import { cn } from "@/lib/utils";
import { SocialRolePromptCard } from "@/components/margot/SocialRolePromptCard";
import { SocialRelevanceTester } from "@/components/margot/SocialRelevanceTester";
import { ADVANCED_WORKSPACE_EYEBROW } from "@/lib/dashboard/simple-dashboard-theme";
import { MARGOT_SOCIAL_TRAINING_CHECKS } from "@/lib/margot/social-role-prompt";
import {
  MARGOT_AVATAR_ORB_PATH,
  MARGOT_DISPLAY_NAME,
} from "@/lib/margot-surface";

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
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(url);
      if (res.ok) {
        setResult(await res.json());
      } else if (res.status === 403) {
        setResult({
          data: {} as T,
          fetchedAt: new Date().toISOString(),
          stale: true,
          reason:
            "Platform operator access required for live Margot ops feeds.",
        });
      }
    } catch {
      /* keep last good payload */
    }
    setLoading(false);
    if (isManual) setRefreshing(false);
  }, [url]);

  useEffect(() => {
    void fetchData(false);
    const id = setInterval(() => void fetchData(false), intervalMs);
    return () => clearInterval(id);
  }, [fetchData, intervalMs]);

  return {
    data: result,
    loading,
    refreshing,
    refresh: () => void fetchData(true),
  };
}

function TileActions({
  ts,
  stale,
  onRefresh,
  refreshing,
}: {
  ts?: string;
  stale?: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <UpdatedAt ts={ts} stale={stale} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh"
      >
        <RefreshCw
          className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
        />
      </Button>
    </div>
  );
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
          className="h-3.5 animate-pulse rounded bg-muted"
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
        tone === "idle" && "bg-muted-foreground/40",
      )}
      aria-hidden
    />
  );
}

function HeroTile() {
  const { data, loading, refreshing, refresh } = usePoll<HealthData>(
    "/api/margot/health",
    30_000,
  );
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
        title="Margot runtime"
        description="Heartbeat from the ops assistant on the Mac mini / Hermes stack."
        action={
          <TileActions
            ts={data?.fetchedAt}
            stale={data?.stale}
            onRefresh={refresh}
            refreshing={refreshing}
          />
        }
      />
      {loading ? (
        <LoadingRows />
      ) : (
        <div className="flex items-center gap-3">
          <StatusDot tone={tone} />
          <div>
            <p className="text-base font-semibold text-foreground">
              {online
                ? "Online"
                : (data?.reason ??
                  data?.data?.reason ??
                  "Unreachable")}
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
  const { data, loading, refreshing, refresh } = usePoll<{
    messages: TelegramMessage[];
  }>("/api/margot/telegram/recent", 60_000);
  const messages = data?.data?.messages ?? [];

  return (
    <DashboardPanel className="h-full">
      <DashboardPanelHeader
        title="Telegram — last 10"
        action={
          <TileActions
            ts={data?.fetchedAt}
            stale={data?.stale}
            onRefresh={refresh}
            refreshing={refreshing}
          />
        }
      />
      {loading ? (
        <LoadingRows />
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {data?.reason ?? "No messages logged yet"}
        </p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
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
                  m.from === "assistant" ? "text-primary" : "text-foreground",
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
  const { data, loading, refreshing, refresh } = usePoll<{
    issues: LinearIssue[];
  }>("/api/margot/linear/top", 60_000);
  const issues = data?.data?.issues ?? [];

  return (
    <DashboardPanel className="h-full">
      <DashboardPanelHeader
        title="Linear — urgent / high"
        action={
          <TileActions
            ts={data?.fetchedAt}
            stale={data?.stale}
            onRefresh={refresh}
            refreshing={refreshing}
          />
        }
      />
      {loading ? (
        <LoadingRows />
      ) : issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {data?.reason ?? "No urgent/high issues"}
        </p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
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
  const { data, loading, refreshing, refresh } = usePoll<{
    schedules: Schedule[];
  }>("/api/margot/schedules", 300_000);
  const schedules = data?.data?.schedules ?? [];

  return (
    <DashboardPanel className="h-full">
      <DashboardPanelHeader
        title="Scheduled briefings"
        action={
          <TileActions
            ts={data?.fetchedAt}
            stale={data?.stale}
            onRefresh={refresh}
            refreshing={refreshing}
          />
        }
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
  const { data, loading, refreshing, refresh } = usePoll<CorpusData>(
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
        title="RAG corpus"
        description="Knowledge store Margot and Hermes draw from."
        action={
          <TileActions
            ts={data?.fetchedAt}
            stale={data?.stale}
            onRefresh={refresh}
            refreshing={refreshing}
          />
        }
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

function SocialDecisionCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <DashboardPanel>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Engage</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Property damage restoration: water, flood, storm, fire/smoke,
              mould, sewage, IICRC, claims, building remediation.
            </p>
          </div>
        </div>
      </DashboardPanel>
      <DashboardPanel>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300">
            <Ban className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Ignore</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cars, utes, teeth, furniture, art, hair, film, watches, data
              restore, ecology — and bare &quot;restoration&quot; with no
              property context.
            </p>
          </div>
        </div>
      </DashboardPanel>
      <DashboardPanel>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-200">
            <HelpCircle className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Unsure</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Mixed signals or empty input — fail closed. Do not comment
              (Phil: precision over recall).
            </p>
          </div>
        </div>
      </DashboardPanel>
    </div>
  );
}

export default function MargotHomeDashboard() {
  return (
    <div className="space-y-8">
      <DashboardListPageHeader
        eyebrow={`${ADVANCED_WORKSPACE_EYEBROW} · ${MARGOT_DISPLAY_NAME}`}
        title="Ops overview"
        description="Live health, Telegram, Linear, schedules, and corpus — plus the social restoration gate Phil asked for. Engage only on property and insurance work; refuse car, teeth, and other false matches."
        icon={
          <span className="relative block h-8 w-8 overflow-hidden rounded-full ring-2 ring-cyan-400/40">
            <Image
              src={MARGOT_AVATAR_ORB_PATH}
              alt=""
              fill
              className="object-cover"
              sizes="32px"
            />
          </span>
        }
        primaryAction={
          <Button asChild size="sm" className="min-h-10">
            <Link href="/dashboard/margot">
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Open chat
            </Link>
          </Button>
        }
        secondaryLinks={[
          { href: "/dashboard/margot", label: "Chat" },
          { href: "/dashboard/margot/social", label: "Social training" },
          { href: "/dashboard/mission-control", label: "Mission Control" },
          { href: "/dashboard/admin/rag", label: "RAG admin" },
          { href: "/dashboard/admin", label: "Admin home" },
        ]}
      />

      <SocialDecisionCards />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Bot className="h-5 w-5 text-cyan-500" aria-hidden />
              Live ops
            </h2>
            <p className="text-sm text-muted-foreground">
              Tiles refresh automatically. Use refresh on a tile to pull now.
            </p>
          </div>
        </div>
        <HeroTile />
        <div className="grid gap-4 md:grid-cols-2">
          <TelegramTile />
          <LinearTile />
          <SchedulesTile />
          <CorpusTile />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Social gate (pre-post check)
          </h2>
          <p className="text-sm text-muted-foreground">
            Run posts through{" "}
            <code className="text-xs">/api/margot/social-relevance</code> before
            Hermes comments. Copy the role prompt into{" "}
            <code className="text-xs">SOUL.md</code> on the Mac mini.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <SocialRelevanceTester />
          <div className="space-y-4">
            <SocialRolePromptCard />
            <DashboardPanel>
              <DashboardPanelHeader
                title="Chat drills"
                description="One-click prompts to verify refuse vs engage in Margot chat."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/margot">
                      Open chat
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                }
              />
              <ul className="space-y-2">
                {MARGOT_SOCIAL_TRAINING_CHECKS.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={`/dashboard/margot?q=${encodeURIComponent(item.prompt)}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {item.prompt}
                        </span>
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          item.expect === "refuse"
                            ? "shrink-0 border-rose-500/30 text-rose-700 dark:text-rose-300"
                            : "shrink-0 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                        }
                      >
                        {item.expect}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </DashboardPanel>
          </div>
        </div>
      </section>
    </div>
  );
}
