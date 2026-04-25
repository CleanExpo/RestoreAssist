"use client";
/**
 * RA-1658 — Margot Dashboard home (/dashboard/margot/home)
 *
 * Read-only tile view: Margot status, Telegram preview, Linear top-5,
 * Scheduled briefings, Corpus status. All tiles poll independently.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ExternalLinkIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Polling hook ─────────────────────────────────────────────────────────────

function usePoll<T>(url: string, intervalMs: number) {
  const [result, setResult] = useState<ApiEnvelope<T> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (res.ok) setResult(await res.json());
    } catch { /* ignore, keep stale data */ }
    setLoading(false);
  }, [url]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, intervalMs);
    return () => clearInterval(id);
  }, [fetchData, intervalMs]);

  return { data: result, loading };
}

// ─── Palette constants ────────────────────────────────────────────────────────

const BG     = "#F5F0E8";
const CARD   = "#FDFAF5";
const BORDER = "#E7E0D3";
const MUTED  = "#8C7F72";
const G      = "#4A8C3F"; // green
const A      = "#C98A2E"; // amber
const R      = "#B33A3A"; // red

// ─── Small primitives ─────────────────────────────────────────────────────────

function Dot({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: color, flexShrink: 0,
      boxShadow: color === G ? `0 0 6px ${G}99` : undefined,
    }} />
  );
}

function UpdatedAt({ ts, stale }: { ts?: string; stale?: boolean }) {
  const [, setTick] = useState(0);
  // re-render every 15s so "Xs ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!ts) return null;
  const secs = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  const label = secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
  return (
    <span style={{ fontSize: 11, color: stale ? A : MUTED }}>
      {stale ? "⚠ stale · " : ""}updated {label}
    </span>
  );
}

function TileCard({ title, footer, children }: { title: string; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: MUTED }}>
        {title}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      {footer && <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 6 }}>{footer}</div>}
    </div>
  );
}

function LoadingRows() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ height: 14, borderRadius: 4, background: "#EDE8E0", opacity: 0.6 }} />
      ))}
    </div>
  );
}

// ─── Tile: Margot Hero ────────────────────────────────────────────────────────

function HeroTile() {
  const { data, loading } = usePoll<HealthData>("/api/margot/health", 30_000);
  const online = data?.data?.online ?? false;
  const dotColor = loading ? "#CBD5E0" : (online ? G : (data?.stale ? A : R));

  return (
    <TileCard title="Margot Status" footer={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}>
      {loading ? <LoadingRows /> : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Dot color={dotColor} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {online ? "Online" : data?.data?.reason ?? "Unreachable"}
            </div>
            {data?.data?.lastHeartbeat && (
              <div style={{ fontSize: 12, color: MUTED }}>
                Heartbeat: {new Date(data.data.lastHeartbeat).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            {data?.data?.uptime !== undefined && data.data.uptime !== null && (
              <div style={{ fontSize: 12, color: MUTED }}>
                Uptime: {Math.round(data.data.uptime / 3600)}h {Math.round((data.data.uptime % 3600) / 60)}m
              </div>
            )}
          </div>
        </div>
      )}
    </TileCard>
  );
}

// ─── Tile: Telegram ───────────────────────────────────────────────────────────

function TelegramTile() {
  const { data, loading } = usePoll<{ messages: TelegramMessage[] }>("/api/margot/telegram/recent", 60_000);
  const messages = data?.data?.messages ?? [];

  return (
    <TileCard title="Telegram — last 10" footer={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}>
      {loading ? <LoadingRows /> : messages.length === 0 ? (
        <span style={{ fontSize: 13, color: MUTED }}>{data?.reason ?? "No messages logged yet"}</span>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {messages.map((m: TelegramMessage) => (
            <li key={m.id} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ color: MUTED, fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                {new Date(m.ts).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span style={{ color: m.from === "user" ? "#141413" : "#4A6B8C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.from === "user" ? "you: " : "margot: "}{m.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </TileCard>
  );
}

// ─── Tile: Linear top-5 ───────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: "Urgent", color: R },
  2: { label: "High",   color: A },
  3: { label: "Medium", color: "#4A6B8C" },
  4: { label: "Low",    color: MUTED },
};

function LinearTile() {
  const { data, loading } = usePoll<{ issues: LinearIssue[] }>("/api/margot/linear/top", 60_000);
  const issues = data?.data?.issues ?? [];

  return (
    <TileCard title="Linear — Urgent / High" footer={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}>
      {loading ? <LoadingRows /> : issues.length === 0 ? (
        <span style={{ fontSize: 13, color: MUTED }}>{data?.reason ?? "No urgent/high issues"}</span>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {issues.map((issue: LinearIssue) => {
            const pri = PRIORITY_LABEL[issue.priority] ?? { label: "—", color: MUTED };
            return (
              <li key={issue.id} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: MUTED, flexShrink: 0, minWidth: 60 }}>{issue.identifier}</span>
                <span style={{ background: pri.color + "22", color: pri.color, fontSize: 10, padding: "1px 6px", borderRadius: 9999, flexShrink: 0, fontWeight: 600 }}>
                  {pri.label}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {issue.title}
                </span>
                <a href={issue.url} target="_blank" rel="noreferrer" style={{ color: "#4A6B8C", flexShrink: 0 }}>
                  <ExternalLinkIcon size={12} />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </TileCard>
  );
}

// ─── Tile: Schedules ──────────────────────────────────────────────────────────

function SchedulesTile() {
  const { data, loading } = usePoll<{ schedules: Schedule[] }>("/api/margot/schedules", 300_000);
  const schedules = data?.data?.schedules ?? [];

  return (
    <TileCard title="Scheduled Briefings" footer={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}>
      {loading ? <LoadingRows /> : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          {schedules.map((s: Schedule) => (
            <li key={s.id} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 500 }}>{s.name}</span>
              <span style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>
                {s.nextRunAt
                  ? new Date(s.nextRunAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
                  : s.cronExpr}
              </span>
            </li>
          ))}
        </ul>
      )}
    </TileCard>
  );
}

// ─── Tile: Corpus ─────────────────────────────────────────────────────────────

function CorpusTile() {
  const { data, loading } = usePoll<CorpusData>("/api/margot/corpus/status", 300_000);
  const corpus = data?.data;
  const dotColor = !corpus ? "#CBD5E0" : corpus.stale ? A : corpus.fileCount !== null ? G : R;

  return (
    <TileCard title="Corpus Status" footer={<UpdatedAt ts={data?.fetchedAt} stale={data?.stale} />}>
      {loading ? <LoadingRows /> : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Dot color={dotColor} />
          <div>
            {corpus?.fileCount !== null && corpus?.fileCount !== undefined ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{corpus.fileCount} files</div>
                {corpus.lastUploadAt && (
                  <div style={{ fontSize: 12, color: MUTED }}>
                    Last upload: {new Date(corpus.lastUploadAt).toLocaleDateString("en-AU")}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: MUTED }}>{data?.reason ?? "Corpus data unavailable"}</div>
            )}
            {corpus?.storeName && (
              <div style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{corpus.storeName}</div>
            )}
          </div>
        </div>
      )}
    </TileCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MargotHomeDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (session?.user?.role !== "ADMIN") router.push("/dashboard");
  }, [status, session, router]);

  const nowRef = useRef(new Date());
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { nowRef.current = new Date(); setTick((t) => t + 1); }, 60_000);
    return () => clearInterval(id);
  }, []);

  if (status === "loading" || !session) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG }}>
        <span style={{ color: MUTED }}>Loading Margot…</span>
      </div>
    );
  }

  const now = nowRef.current;
  const dateStr = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "Inter, system-ui, sans-serif", fontSize: 14 }}>
      {/* Sticky top bar */}
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        background: BG, borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", gap: 12, padding: "0 20px", height: 52,
      }}>
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18 }}>🐕 Margot</span>
        <span style={{ fontSize: 12, color: MUTED }}>{dateStr} · {timeStr}</span>
        <div style={{ flex: 1 }} />
        <a href="/dashboard/margot" style={{ fontSize: 12, color: "#4A6B8C", textDecoration: "none" }}>
          Chat ↗
        </a>
      </header>

      <main style={{ padding: "20px", maxWidth: 1200 }}>
        {/* Hero — full width */}
        <div style={{ marginBottom: 16 }}>
          <HeroTile />
        </div>

        {/* 2-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          <TelegramTile />
          <LinearTile />
          <SchedulesTile />
          <CorpusTile />
        </div>
      </main>

      <footer style={{ padding: "16px 20px", borderTop: `1px solid ${BORDER}`, fontSize: 11, color: MUTED }}>
        v1 · auto-refresh 60s · <a href="/dashboard/margot" style={{ color: "#4A6B8C" }}>/dashboard/margot for chat</a>
      </footer>
    </div>
  );
}
