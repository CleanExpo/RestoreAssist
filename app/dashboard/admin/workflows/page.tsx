"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Shield,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Play,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkflowStatus =
  | "PENDING"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "PARTIALLY_FAILED"
  | "CANCELLED";

type TaskStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED"
  | "DEAD_LETTER";

interface AgentTask {
  id: string;
  taskType: string;
  displayName: string;
  status: TaskStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  attempts: number;
  durationMs: number | null;
}

interface AgentWorkflow {
  id: string;
  name: string;
  status: WorkflowStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  reportId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  tasks?: AgentTask[];
}

type FilterTab = "ALL" | WorkflowStatus;

// ─── Status badge config ──────────────────────────────────────────────────────

const WORKFLOW_STATUS_CONFIG: Record<
  WorkflowStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: Clock,
  },
  RUNNING: {
    label: "Running",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    icon: Loader2,
  },
  PAUSED: {
    label: "Paused",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: Clock,
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-500/10 text-green-600 dark:text-green-400",
    icon: CheckCircle,
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-500/10 text-red-600 dark:text-red-400",
    icon: XCircle,
  },
  PARTIALLY_FAILED: {
    label: "Partial Fail",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    icon: AlertCircle,
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400",
    icon: XCircle,
  },
};

const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  READY: { label: "Ready", className: "bg-blue-500/10 text-blue-500" },
  RUNNING: {
    label: "Running",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  SKIPPED: {
    label: "Skipped",
    className: "bg-neutral-500/10 text-neutral-500",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-neutral-500/10 text-neutral-500",
  },
  DEAD_LETTER: {
    label: "Dead Letter",
    className: "bg-red-900/20 text-red-700 dark:text-red-400",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt) return "—";
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function canResume(status: WorkflowStatus): boolean {
  return ["FAILED", "PARTIALLY_FAILED", "PAUSED"].includes(status);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard() {
  return (
    <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 animate-pulse">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-neutral-200 dark:bg-neutral-700 w-12 h-12" />
          <div className="space-y-2">
            <div className="h-6 w-12 bg-neutral-200 dark:bg-neutral-700 rounded" />
            <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-700 rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Task expand row ──────────────────────────────────────────────────────────

function TaskRow({ task }: { task: AgentTask }) {
  const [expandError, setExpandError] = useState(false);
  const cfg = TASK_STATUS_CONFIG[task.status] ?? {
    label: task.status,
    className: "",
  };

  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30">
      <td className="pl-12 pr-4 py-2 text-xs text-neutral-500 dark:text-neutral-400 font-mono">
        {task.id.slice(0, 8)}
      </td>
      <td className="px-4 py-2 text-xs text-neutral-700 dark:text-neutral-300">
        {task.displayName || task.taskType}
      </td>
      <td className="px-4 py-2">
        <Badge className={cn("text-xs", cfg.className)}>{cfg.label}</Badge>
      </td>
      <td className="px-4 py-2 text-xs text-neutral-500">
        {formatDate(task.startedAt)}
      </td>
      <td className="px-4 py-2 text-xs text-neutral-500">
        {formatDate(task.completedAt)}
      </td>
      <td className="px-4 py-2 text-xs text-neutral-500">
        {task.durationMs != null
          ? `${task.durationMs}ms`
          : formatDuration(task.startedAt, task.completedAt)}
      </td>
      <td className="px-4 py-2 text-xs" colSpan={2}>
        {task.errorMessage ? (
          <div>
            <span
              className={cn(
                "text-red-500 dark:text-red-400 cursor-pointer",
                expandError ? "" : "line-clamp-1",
              )}
              onClick={() => setExpandError(!expandError)}
              title={expandError ? "Click to collapse" : "Click to expand"}
            >
              {task.errorMessage}
            </span>
          </div>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Workflow row ─────────────────────────────────────────────────────────────

function WorkflowRow({
  workflow,
  onResume,
}: {
  workflow: AgentWorkflow;
  onResume: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<AgentTask[]>(workflow.tasks ?? []);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [resuming, setResuming] = useState(false);

  const cfg = WORKFLOW_STATUS_CONFIG[workflow.status] ?? {
    label: workflow.status,
    className: "",
    icon: Clock,
  };
  const StatusIcon = cfg.icon;

  const progressPct =
    workflow.totalTasks > 0
      ? Math.round((workflow.completedTasks / workflow.totalTasks) * 100)
      : 0;

  const handleExpand = async () => {
    if (!expanded && tasks.length === 0) {
      setLoadingTasks(true);
      try {
        const res = await fetch(`/api/agents/workflows/${workflow.id}`);
        if (res.ok) {
          const data = await res.json();
          setTasks(data.tasks ?? []);
        }
      } catch {
        // silently fail — tasks stay empty
      } finally {
        setLoadingTasks(false);
      }
    }
    setExpanded(!expanded);
  };

  const handleResume = async () => {
    setResuming(true);
    try {
      await onResume(workflow.id);
    } finally {
      setResuming(false);
    }
  };

  return (
    <>
      <tr className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
        {/* Expand toggle */}
        <td className="px-4 py-3 w-8">
          <button
            onClick={handleExpand}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {loadingTasks ? (
              <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
            ) : expanded ? (
              <ChevronDown className="h-4 w-4 text-neutral-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-neutral-500" />
            )}
          </button>
        </td>

        {/* Workflow ID */}
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
            {workflow.id.slice(0, 8)}
          </span>
        </td>

        {/* Name */}
        <td className="px-4 py-3">
          <span className="text-sm text-neutral-800 dark:text-neutral-200 truncate max-w-[160px] block">
            {workflow.name || "—"}
          </span>
          {workflow.reportId && (
            <span className="text-xs text-neutral-400 font-mono">
              report:{workflow.reportId.slice(0, 6)}
            </span>
          )}
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <Badge className={cn("gap-1 text-xs", cfg.className)}>
            <StatusIcon
              className={cn(
                "h-3 w-3",
                workflow.status === "RUNNING" && "animate-spin",
              )}
            />
            {cfg.label}
          </Badge>
        </td>

        {/* Progress */}
        <td className="px-4 py-3 min-w-[120px]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-600 dark:text-neutral-400 w-8 text-right shrink-0">
              {workflow.completedTasks}/{workflow.totalTasks}
            </span>
            <div className="flex-1 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  workflow.status === "FAILED" ||
                    workflow.status === "PARTIALLY_FAILED"
                    ? "bg-red-500"
                    : workflow.status === "COMPLETED"
                      ? "bg-green-500"
                      : "bg-blue-500",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </td>

        {/* Failed tasks */}
        <td className="px-4 py-3 text-center">
          {workflow.failedTasks > 0 ? (
            <span className="text-xs font-medium text-red-500 dark:text-red-400">
              {workflow.failedTasks}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">0</span>
          )}
        </td>

        {/* Started at */}
        <td className="px-4 py-3">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {formatDate(workflow.startedAt ?? workflow.createdAt)}
          </span>
        </td>

        {/* Duration */}
        <td className="px-4 py-3">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {formatDuration(workflow.startedAt, workflow.completedAt)}
          </span>
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          {canResume(workflow.status) && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
              onClick={handleResume}
              disabled={resuming}
            >
              {resuming ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Resume
            </Button>
          )}
        </td>
      </tr>

      {/* Expanded tasks */}
      {expanded && tasks.length > 0 && (
        <>
          <tr className="bg-neutral-50/80 dark:bg-neutral-800/20">
            <td colSpan={9} className="px-4 pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Tasks ({tasks.length})
              </span>
            </td>
          </tr>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </>
      )}
      {expanded && tasks.length === 0 && !loadingTasks && (
        <tr className="bg-neutral-50/80 dark:bg-neutral-800/20">
          <td
            colSpan={9}
            className="px-4 py-3 text-xs text-neutral-400 text-center"
          >
            No tasks recorded for this workflow.
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: FilterTab }[] = [
  { label: "All", value: "ALL" },
  { label: "Running", value: "RUNNING" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Failed", value: "FAILED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function WorkflowMonitorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [workflows, setWorkflows] = useState<AgentWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");

  // Auth guard
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if ((session?.user as { role?: string })?.role !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  const fetchWorkflows = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (activeTab !== "ALL") params.set("status", activeTab);
      const res = await fetch(`/api/agents/workflows?${params}`);
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows ?? []);
      }
    } catch (err) {
      console.error("[WorkflowMonitor] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if ((session?.user as { role?: string })?.role === "ADMIN") {
      setLoading(true);
      fetchWorkflows();
    }
  }, [fetchWorkflows, session]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchWorkflows();
    setRefreshing(false);
  };

  const handleResume = async (id: string) => {
    try {
      const res = await fetch(`/api/agents/workflows/${id}/resume`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchWorkflows();
      }
    } catch (err) {
      console.error("[WorkflowMonitor] resume error:", err);
    }
  };

  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  // Summary counts (always computed from ALL workflows, ignoring filter)
  const [allWorkflows, setAllWorkflows] = useState<AgentWorkflow[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/agents/workflows?limit=50")
      .then((r) => r.json())
      .then((d) => setAllWorkflows(d.workflows ?? []))
      .catch((err) => console.error("[WorkflowMonitor]", err));
  }, [isAdmin]);

  const counts = {
    running: allWorkflows.filter((w) => w.status === "RUNNING").length,
    completed: allWorkflows.filter((w) => w.status === "COMPLETED").length,
    failed: allWorkflows.filter(
      (w) => w.status === "FAILED" || w.status === "PARTIALLY_FAILED",
    ).length,
  };

  // ── Loading / auth guard render ──

  if (status === "loading" || loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-48 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
            <div className="h-4 w-64 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <CardContent className="p-0">
            <table className="w-full">
              <tbody>
                {[...Array(5)].map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Shield className="h-12 w-12 text-neutral-400" />
        <p className="text-neutral-600 dark:text-neutral-400">
          Admin access required
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Workflow Monitor
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Agent workflow execution history and status
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Activity className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {counts.running}
                </p>
                <p className="text-sm text-neutral-500">Running</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {counts.completed}
                </p>
                <p className="text-sm text-neutral-500">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-red-500/10">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {counts.failed}
                </p>
                <p className="text-sm text-neutral-500">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors",
              activeTab === tab.value
                ? "bg-white dark:bg-neutral-900 border border-b-0 border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white -mb-px"
                : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-neutral-900 dark:text-white text-base">
            <Activity className="h-5 w-5 text-cyan-500" />
            Workflows
            <span className="text-sm font-normal text-neutral-400">
              ({workflows.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Activity className="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
              <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                No workflows recorded yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                    <th className="w-8 px-4 py-3" />
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Progress
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Failed
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Started
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((workflow) => (
                    <WorkflowRow
                      key={workflow.id}
                      workflow={workflow}
                      onResume={handleResume}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
