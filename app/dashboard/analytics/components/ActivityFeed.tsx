"use client";

import { Loader2, FileText, CheckCircle2, Edit, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Activity {
  id: string;
  type: "created" | "updated" | "completed";
  description: string;
  timestamp: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  };
  report: {
    id: string;
    title: string;
    clientName: string;
    status: string;
  };
}

interface ActivityFeedProps {
  activities: Activity[];
  loading?: boolean;
}

export default function ActivityFeed({
  activities,
  loading = false,
}: ActivityFeedProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "p-6 rounded-lg border",
          "border-neutral-200 dark:border-slate-700/60",
          "bg-white dark:bg-slate-900/50",
        )}
      >
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p
              className={cn("text-sm", "text-muted-foreground")}
            >
              Loading activity feed...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div
        className={cn(
          "p-6 rounded-lg border",
          "border-neutral-200 dark:border-slate-700/60",
          "bg-white dark:bg-slate-900/50",
        )}
      >
        <h3
          className={cn(
            "font-semibold mb-4",
            "text-foreground",
          )}
        >
          Team Activity Feed
        </h3>
        <div
          className={cn(
            "flex items-center justify-center h-[300px]",
            "text-muted-foreground",
          )}
        >
          No recent activity
        </div>
      </div>
    );
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "updated":
        return <Edit className="w-4 h-4 text-blue-500" />;
      case "created":
        return <Plus className="w-4 h-4 text-cyan-500" />;
      default:
        return <FileText className="w-4 h-4 text-neutral-500" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "completed":
        return "bg-emerald-100 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800";
      case "updated":
        return "bg-blue-100 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800";
      case "created":
        return "bg-cyan-100 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800";
      default:
        return "bg-muted/50 border-neutral-200 dark:border-slate-600";
    }
  };

  const getUserRoleBadge = (role: string) => {
    const roleMap: Record<string, { label: string; color: string }> = {
      ADMIN: {
        label: "Admin",
        color:
          "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
      },
      MANAGER: {
        label: "Manager",
        color:
          "bg-info-subtle text-info-subtle-foreground",
      },
      USER: {
        label: "Technician",
        color:
          "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
      },
    };
    const roleInfo = roleMap[role] || {
      label: role,
      color:
        "bg-muted text-foreground/90",
    };
    return (
      <span
        className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium",
          roleInfo.color,
        )}
      >
        {roleInfo.label}
      </span>
    );
  };

  return (
    <div
      className={cn(
        "p-6 rounded-lg border",
        "border-neutral-200 dark:border-slate-700/60",
        "bg-white dark:bg-slate-900/50",
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3
          className={cn(
            "font-semibold text-lg",
            "text-foreground",
          )}
        >
          Team Activity Feed
        </h3>
        <span className={cn("text-xs", "text-muted-foreground")}>
          {activities.length} recent activities
        </span>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className={cn(
              "flex items-start gap-3 p-4 rounded-lg border transition-colors",
              getActivityColor(activity.type),
              "hover:shadow-md",
            )}
          >
            <div
              className={cn(
                "p-2 rounded-lg flex-shrink-0",
                "bg-white dark:bg-slate-900/50",
              )}
            >
              {getActivityIcon(activity.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    "text-foreground",
                  )}
                >
                  {activity.description}
                </p>
                <span
                  className={cn(
                    "text-xs whitespace-nowrap",
                    "text-muted-foreground",
                  )}
                >
                  {formatDistanceToNow(new Date(activity.timestamp), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "text-xs",
                    "text-muted-foreground",
                  )}
                >
                  {activity.user.name || activity.user.email}
                </span>
                {getUserRoleBadge(activity.user.role)}
                <span
                  className={cn(
                    "text-xs",
                    "text-muted-foreground",
                  )}
                >
                  • {activity.report.clientName}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
