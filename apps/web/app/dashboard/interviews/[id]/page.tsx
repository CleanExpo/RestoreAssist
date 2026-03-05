"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  User,
  FileText,
  ClipboardCheck,
  ChevronRight,
} from "lucide-react"

interface InterviewResponse {
  id: string
  questionId: string
  questionText: string
  answerValue: string
  answerType: string
  answeredAt: string | null
  createdAt: string
}

interface InterviewSession {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  abandonedAt: string | null
  totalQuestionsAsked: number
  totalAnswersGiven: number
  estimatedTimeMinutes: number
  actualTimeMinutes: number | null
  userTierLevel: string
  technicianExperience: string | null
  autoPopulatedFields: string | null
  formTemplate: {
    id: string
    name: string
    formType: string
    category: string
  }
  responses: InterviewResponse[]
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  STARTED: { label: "Started", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", icon: PlayCircle },
  IN_PROGRESS: { label: "In Progress", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", icon: Clock },
  COMPLETED: { label: "Completed", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", icon: CheckCircle2 },
  ABANDONED: { label: "Abandoned", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", icon: XCircle },
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function parseAutoPopulatedFields(raw: string | null): Record<string, { value: unknown; confidence?: number }> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, { value: unknown; confidence?: number }>
  } catch {
    return null
  }
}

export default function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"transcript" | "fields">("transcript")

  useEffect(() => {
    fetchSession()
  }, [id])

  const fetchSession = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/interviews/${id}`)
      if (response.ok) {
        const data = await response.json()
        setSession(data.session)
      } else {
        toast.error("Interview session not found")
        router.push("/dashboard/interviews")
      }
    } catch (error) {
      console.error("Error:", error)
      toast.error("Failed to load interview session")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-cyan-500" size={32} />
      </div>
    )
  }

  if (!session) return null

  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.STARTED
  const StatusIcon = statusCfg.icon
  const autoFields = parseAutoPopulatedFields(session.autoPopulatedFields)
  const isResumable = session.status === "IN_PROGRESS" || session.status === "STARTED"
  const progress = session.totalQuestionsAsked > 0
    ? Math.round((session.totalAnswersGiven / session.totalQuestionsAsked) * 100)
    : 0

  const TABS: { key: "transcript" | "fields"; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "transcript", label: "Transcript", icon: MessageSquare, count: session.responses.length },
    { key: "fields", label: "Auto-Populated Fields", icon: FileText, count: autoFields ? Object.keys(autoFields).length : 0 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push("/dashboard/interviews")}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors mt-0.5"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="text-cyan-500" size={22} />
              {session.formTemplate.name}
            </h1>
            <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1", statusCfg.bg, statusCfg.color)}>
              <StatusIcon size={12} />
              {statusCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-neutral-500 dark:text-slate-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {formatDate(session.startedAt)}
            </span>
            {session.completedAt && (
              <span className="flex items-center gap-1">
                <CheckCircle2 size={14} />
                Completed {formatDate(session.completedAt)}
              </span>
            )}
            {session.technicianExperience && (
              <span className="flex items-center gap-1">
                <User size={14} />
                {session.technicianExperience}
              </span>
            )}
            <span className="capitalize text-neutral-400 dark:text-slate-500">
              {session.formTemplate.category.toLowerCase().replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isResumable && (
            <button
              onClick={() =>
                router.push(
                  `/dashboard/forms/interview?formTemplateId=${session.formTemplate.id}&sessionId=${session.id}`
                )
              }
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-sm"
            >
              <PlayCircle size={16} />
              Resume
            </button>
          )}
          {session.status === "COMPLETED" && (
            <button
              onClick={() =>
                router.push(`/dashboard/inspections/new?sessionId=${session.id}`)
              }
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg font-medium hover:from-emerald-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-sm"
            >
              <ClipboardCheck size={16} />
              Create Inspection
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">Questions</div>
          <div className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
            {session.totalAnswersGiven}/{session.totalQuestionsAsked}
          </div>
        </div>
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">Progress</div>
          <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">{progress}%</div>
        </div>
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">Time</div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {session.actualTimeMinutes ? `${session.actualTimeMinutes}m` : `~${session.estimatedTimeMinutes}m`}
          </div>
        </div>
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">Fields Populated</div>
          <div className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">
            {autoFields ? Object.keys(autoFields).length : 0}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {session.status !== "COMPLETED" && session.totalQuestionsAsked > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-neutral-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm font-medium text-neutral-500 dark:text-slate-400">{progress}%</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-neutral-200 dark:border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-all border-b-2",
              activeTab === tab.key
                ? "border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-50/50 dark:bg-cyan-900/10"
                : "border-transparent text-neutral-500 dark:text-slate-400 hover:text-neutral-700 dark:hover:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-800/50"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-xs",
                activeTab === tab.key ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600" : "bg-neutral-100 dark:bg-slate-800 text-neutral-500"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {/* Transcript */}
        {activeTab === "transcript" && (
          <div className="space-y-4">
            {session.responses.length > 0 ? (
              session.responses.map((r, idx) => (
                <div
                  key={r.id}
                  className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white mb-2">
                        {r.questionText}
                      </p>
                      <div className="p-3 rounded-lg bg-neutral-50 dark:bg-slate-800/50 border border-neutral-100 dark:border-slate-700/30">
                        <p className="text-sm text-neutral-700 dark:text-slate-300 whitespace-pre-wrap">
                          {r.answerValue || "No answer provided"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-neutral-400 dark:text-slate-500">
                        {r.answerType && (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-slate-800 text-neutral-500 dark:text-slate-400">
                            {r.answerType}
                          </span>
                        )}
                        {r.answeredAt && (
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {formatDate(r.answeredAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-16">
                <MessageSquare size={48} className="mx-auto text-neutral-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-neutral-700 dark:text-slate-300">No responses yet</h3>
                <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
                  {isResumable
                    ? "Resume the interview to start answering questions"
                    : "This interview session has no recorded responses"}
                </p>
                {isResumable && (
                  <button
                    onClick={() =>
                      router.push(
                        `/dashboard/forms/interview?formTemplateId=${session.formTemplate.id}&sessionId=${session.id}`
                      )
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 mt-4 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm"
                  >
                    <PlayCircle size={16} />
                    Resume Interview
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Auto-Populated Fields */}
        {activeTab === "fields" && (
          <div className="space-y-4">
            {autoFields && Object.keys(autoFields).length > 0 ? (
              <>
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    These fields were automatically populated from interview answers and can be used to pre-fill inspection forms.
                  </p>
                  {session.status === "COMPLETED" && (
                    <button
                      onClick={() => router.push(`/dashboard/inspections/new?sessionId=${session.id}`)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 mt-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium"
                    >
                      <ClipboardCheck size={14} />
                      Use for New Inspection
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-700/50">
                  <table className="w-full">
                    <thead className="bg-neutral-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Field</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Value</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                      {Object.entries(autoFields).map(([key, field]) => (
                        <tr key={key} className="hover:bg-neutral-50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-sm font-medium text-neutral-900 dark:text-white">
                            {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim()}
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-700 dark:text-slate-300 max-w-xs truncate">
                            {typeof field.value === "object" ? JSON.stringify(field.value) : String(field.value ?? "")}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {field.confidence != null ? (
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-xs font-medium",
                                field.confidence >= 80
                                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                                  : field.confidence >= 50
                                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                                    : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                              )}>
                                {field.confidence}%
                              </span>
                            ) : (
                              <span className="text-neutral-400 dark:text-slate-500">--</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <FileText size={48} className="mx-auto text-neutral-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-neutral-700 dark:text-slate-300">No auto-populated fields</h3>
                <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
                  {session.status === "COMPLETED"
                    ? "This interview did not generate any auto-populated fields"
                    : "Complete the interview to see auto-populated fields"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
