"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ActivityEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  device: string | null;
  createdAt: string;
  userName: string | null;
}

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export default function ActivityTimeline({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch(`/api/inspections/${inspectionId}/activity`);
        if (res.ok) {
          const data = await res.json();
          setActivity(data.activity ?? []);
        }
      } catch (err) {
        console.error("Failed to load activity:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchActivity();
  }, [inspectionId]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-gray-100 animate-pulse" />
              {i < 4 && (
                <div className="w-0.5 flex-1 mt-1 bg-gray-100 animate-pulse min-h-[32px]" />
              )}
            </div>
            <div className="flex-1 pb-4 space-y-2">
              <div className="w-3/4 h-4 bg-gray-100 rounded animate-pulse" />
              <div className="w-1/3 h-3 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-3">
        <History size={32} className="opacity-40" />
        <p className="text-sm">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="relative border-l-2 border-gray-200 dark:border-slate-700 ml-1.5 space-y-0">
        {activity.map((entry, index) => (
          <div key={entry.id} className="relative pl-6 pb-6">
            {/* Timeline dot */}
            <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" />

            <div className="flex flex-wrap items-start gap-2">
              {/* Action text */}
              <p className="font-medium text-sm text-neutral-800 dark:text-slate-200 flex-1 min-w-0">
                {entry.action}
              </p>

              {/* Device chip */}
              {entry.device && (
                <Badge
                  variant="secondary"
                  className={
                    entry.device === "Mobile"
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0 text-xs"
                      : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-0 text-xs"
                  }
                >
                  {entry.device}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1">
              {/* EntityType badge */}
              {entry.entityType && (
                <Badge variant="outline" className="text-xs font-normal">
                  {entry.entityType}
                </Badge>
              )}

              {/* Relative time */}
              <span className="text-xs text-neutral-400 dark:text-slate-500">
                {relativeTime(entry.createdAt)}
              </span>

              {/* User name */}
              {entry.userName && (
                <span className="text-xs text-neutral-400 dark:text-slate-500">
                  · {entry.userName}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
