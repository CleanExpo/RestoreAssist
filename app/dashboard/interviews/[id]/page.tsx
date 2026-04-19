"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  MessageSquare,
  FileText,
  User,
  Hash,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InterviewResponse {
  id: string;
  questionId: string;
  questionText: string;
  answerValue: string;
  answerType: string;
  answeredAt: string | null;
  createdAt: string;
}

interface FormTemplate {
  id: string;
  name: string;
  formType: string;
  category: string;
}

interface InterviewSessionDetail {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  totalQuestionsAsked: number;
  totalAnswersGiven: number;
  estimatedTimeMinutes: number;
  actualTimeMinutes: number | null;
  userTierLevel: string;
  technicianExperience: string | null;
  autoPopulatedFields: string | null;
  answers: string | null;
  standardsReferences: string | null;
  reportId: string | null;
  formTemplate: FormTemplate;
  responses: InterviewResponse[];
  createdAt: string;
}

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ElementType;
  }
> = {
  STARTED: { label: "Started", variant: "secondary", icon: PlayCircle },
  IN_PROGRESS: { label: "In Progress", variant: "default", icon: Clock },
  COMPLETED: { label: "Completed", variant: "default", icon: CheckCircle2 },
  ABANDONED: { label: "Abandoned", variant: "destructive", icon: XCircle },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseJsonField(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function InterviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [interview, setInterview] = useState<InterviewSessionDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchInterview = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/interviews/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Interview not found");
          return;
        }
        const data = await res.json();
        // API returns { session: ... }
        setInterview(data.session ?? data);
      } catch {
        setError("Failed to load interview session");
      } finally {
        setLoading(false);
      }
    };
    fetchInterview();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 p-4">
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center space-y-4">
        <MessageSquare
          size={48}
          className="mx-auto text-neutral-300 dark:text-slate-600"
        />
        <h2 className="text-xl font-semibold text-neutral-700 dark:text-slate-300">
          {error || "Interview session not found"}
        </h2>
        <p className="text-sm text-neutral-500 dark:text-slate-400">
          The interview you are looking for does not exist or you do not have
          access.
        </p>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/interviews")}
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Interviews
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[interview.status] ?? STATUS_CONFIG.STARTED;
  const StatusIcon = statusCfg.icon;

  const autoPopulated = parseJsonField(interview.autoPopulatedFields);

  const duration =
    interview.actualTimeMinutes != null
      ? `${interview.actualTimeMinutes}m`
      : interview.completedAt && interview.startedAt
        ? `${Math.round(
            (new Date(interview.completedAt).getTime() -
              new Date(interview.startedAt).getTime()) /
              60000,
          )}m`
        : `~${interview.estimatedTimeMinutes}m est.`;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Link
          href="/dashboard/interviews"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft size={16} />
          Interviews
        </Link>
        <ChevronRight
          size={14}
          className="hidden sm:block text-neutral-300 dark:text-slate-600"
        />
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white flex-1 truncate">
          {interview.formTemplate.name}
        </h1>
        <Badge
          variant={statusCfg.variant}
          className={
            interview.status === "COMPLETED"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
              : interview.status === "IN_PROGRESS"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                : interview.status === "ABANDONED"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800"
          }
        >
          <StatusIcon size={12} className="mr-1" />
          {statusCfg.label}
        </Badge>
      </div>

      {/* ── Metadata Card ──────────────────────────────────────────────── */}
      <Card className="border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-neutral-600 dark:text-slate-400 uppercase tracking-wider">
            Session Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-slate-500">
                <Calendar size={12} />
                Started
              </div>
              <p className="text-sm font-medium text-neutral-800 dark:text-slate-200">
                {formatDate(interview.startedAt)}
              </p>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-slate-500">
                <Clock size={12} />
                Duration
              </div>
              <p className="text-sm font-medium text-neutral-800 dark:text-slate-200">
                {duration}
              </p>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-slate-500">
                <Hash size={12} />
                Questions
              </div>
              <p className="text-sm font-medium text-neutral-800 dark:text-slate-200">
                {interview.totalAnswersGiven} / {interview.totalQuestionsAsked}{" "}
                answered
              </p>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-slate-500">
                <User size={12} />
                Experience
              </div>
              <p className="text-sm font-medium text-neutral-800 dark:text-slate-200 capitalize">
                {interview.technicianExperience
                  ? interview.technicianExperience.toLowerCase()
                  : "—"}
              </p>
            </div>
          </div>

          {interview.completedAt && (
            <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-slate-500 mb-0.5">
                <CheckCircle2 size={12} />
                Completed
              </div>
              <p className="text-sm font-medium text-neutral-800 dark:text-slate-200">
                {formatDate(interview.completedAt)}
              </p>
            </div>
          )}

          {/* Linked inspection link */}
          {interview.reportId && (
            <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-slate-800">
              <Link
                href={`/dashboard/reports/${interview.reportId}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
              >
                <FileText size={14} />
                View Linked Inspection Report
                <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Q&A Transcript ─────────────────────────────────────────────── */}
      <Card className="border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-neutral-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <MessageSquare size={14} />
            Q&amp;A Transcript
            <span className="ml-auto text-xs font-normal normal-case text-neutral-400 dark:text-slate-500">
              {interview.responses.length} response
              {interview.responses.length !== 1 ? "s" : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {interview.responses.length === 0 ? (
            <p className="text-sm text-neutral-400 dark:text-slate-500 text-center py-6">
              No responses recorded yet.
            </p>
          ) : (
            interview.responses.map((r, index) => (
              <div key={r.id} className="space-y-2">
                {index > 0 && <Separator className="my-3" />}
                {/* Question */}
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-neutral-100 dark:bg-slate-800 text-neutral-500 dark:text-slate-400 text-xs flex items-center justify-center font-medium">
                    {index + 1}
                  </span>
                  <div className="flex-1 px-3 py-2 rounded-lg bg-neutral-100 dark:bg-slate-800/70">
                    <p className="text-sm font-semibold text-neutral-700 dark:text-slate-200">
                      {r.questionText}
                    </p>
                  </div>
                </div>
                {/* Answer */}
                <div className="ml-7">
                  <div className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-700">
                    <p className="text-sm text-neutral-800 dark:text-slate-300 whitespace-pre-wrap">
                      {r.answerValue || (
                        <span className="italic text-neutral-400 dark:text-slate-500">
                          No answer provided
                        </span>
                      )}
                    </p>
                    {r.answeredAt && (
                      <p className="text-xs text-neutral-400 dark:text-slate-500 mt-1">
                        {formatDate(r.answeredAt)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Extracted / Auto-populated Data ────────────────────────────── */}
      {autoPopulated && Object.keys(autoPopulated).length > 0 && (
        <Card className="border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-neutral-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText size={14} />
              Extracted Data
              <span className="ml-auto text-xs font-normal normal-case text-neutral-400 dark:text-slate-500">
                {Object.keys(autoPopulated).length} field
                {Object.keys(autoPopulated).length !== 1 ? "s" : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-neutral-100 dark:divide-slate-800">
              {Object.entries(autoPopulated).map(([key, value]) => (
                <div key={key} className="py-2.5 flex items-start gap-4">
                  <span className="w-48 flex-shrink-0 text-xs font-medium text-neutral-500 dark:text-slate-400 capitalize pt-0.5">
                    {key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/_/g, " ")
                      .trim()}
                  </span>
                  <span className="flex-1 text-sm text-neutral-800 dark:text-slate-200 font-mono break-all">
                    {renderValue(value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Footer actions ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pb-8">
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/interviews")}
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Interviews
        </Button>
        {(interview.status === "IN_PROGRESS" ||
          interview.status === "STARTED") && (
          <Button
            onClick={() =>
              router.push(
                `/dashboard/forms/interview?formTemplateId=${interview.formTemplate.id}&sessionId=${interview.id}`,
              )
            }
            className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-600 hover:to-cyan-600"
          >
            Resume Interview
          </Button>
        )}
      </div>
    </div>
  );
}
