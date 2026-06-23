"use client";

import { useState, useEffect } from "react";

type MarkProps = { className?: string };

function Mark({ className = "h-5 w-5", children }: MarkProps & { children: React.ReactNode }) {
  return (
    <span className={className} aria-hidden="true">
      {children}
    </span>
  );
}

const ChartMark = (props: MarkProps) => <Mark {...props}>▥</Mark>;
const PlayMark = (props: MarkProps) => <Mark {...props}>▶</Mark>;
const CheckMark = (props: MarkProps) => <Mark {...props}>✓</Mark>;
const PauseMark = (props: MarkProps) => <Mark {...props}>Ⅱ</Mark>;
const UpMark = (props: MarkProps) => <Mark {...props}>↗</Mark>;
const DownMark = (props: MarkProps) => <Mark {...props}>↘</Mark>;
const UsersMark = (props: MarkProps) => <Mark {...props}>◉</Mark>;

interface VideoStat {
  videoSlug: string;
  plays: number;
  pauses: number;
  completes: number;
  p25: number;
  p50: number;
  p75: number;
  uniqueUsers: number;
  completionRate: number;
  dropoff25: number;
  dropoff50: number;
}

export default function VideoAnalyticsPage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [data, setData] = useState<VideoStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/video/analytics?period=${period}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [period]);

  const totalPlays = data.reduce((sum, d) => sum + d.plays, 0);
  const avgCompletion = data.length
    ? Math.round(data.reduce((sum, d) => sum + d.completionRate, 0) / data.length)
    : 0;

  const colorForRate = (rate: number) => {
    if (rate >= 70) return "text-green-400";
    if (rate >= 40) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ChartMark className="h-7 w-7" />
            Video Analytics
          </h1>
          <p className="mt-1 text-muted-foreground">
            Track how users engage with tutorial and explainer videos
          </p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? "bg-brand-bronze text-white"
                  : "bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20"
              }`}
            >
              {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <PlayMark className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-sm text-muted-foreground">Total Plays</p>
              <p className="text-2xl font-bold">{totalPlays.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <CheckMark className="h-5 w-5 text-green-400" />
            <div>
              <p className="text-sm text-muted-foreground">Avg Completion</p>
              <p className={`text-2xl font-bold ${colorForRate(avgCompletion)}`}>
                {avgCompletion}%
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <UsersMark className="h-5 w-5 text-brand-bronze" />
            <div>
              <p className="text-sm text-muted-foreground">Videos Tracked</p>
              <p className="text-2xl font-bold">{data.length}</p>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading analytics</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No video engagement data yet. Data will appear as users watch videos.
        </div>
      )}

      {/* Table */}
      {!loading && !error && data.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy/5">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Video</th>
                <th className="px-4 py-3 text-right font-medium">Plays</th>
                <th className="px-4 py-3 text-right font-medium">Unique</th>
                <th className="px-4 py-3 text-right font-medium">25%</th>
                <th className="px-4 py-3 text-right font-medium">50%</th>
                <th className="px-4 py-3 text-right font-medium">75%</th>
                <th className="px-4 py-3 text-right font-medium">Complete</th>
                <th className="px-4 py-3 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((row) => (
                <tr key={row.videoSlug} className="hover:bg-brand-bronze/5">
                  <td className="px-4 py-3 font-medium">{row.videoSlug}</td>
                  <td className="px-4 py-3 text-right">{row.plays}</td>
                  <td className="px-4 py-3 text-right">{row.uniqueUsers}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.p25}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.p50}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.p75}</td>
                  <td className="px-4 py-3 text-right font-medium">{row.completes}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${colorForRate(row.completionRate)}`}>
                      {row.completionRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
