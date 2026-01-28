"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  Droplets,
  Flame,
  Bug,
  CloudLightning,
  MessageSquare,
  Loader2,
  ChevronRight,
  MapPin,
  GraduationCap,
  User,
  Award,
} from "lucide-react"

interface FormTemplate {
  id: string
  name: string
  formType: string
  category: string
  description: string | null
}

const JOB_TYPES = [
  { value: "WATER_DAMAGE", label: "Water Damage", icon: Droplets, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800", activeBg: "bg-blue-100 dark:bg-blue-900/40", activeRing: "ring-blue-500/30" },
  { value: "FIRE_DAMAGE", label: "Fire Damage", icon: Flame, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800", activeBg: "bg-red-100 dark:bg-red-900/40", activeRing: "ring-red-500/30" },
  { value: "MOULD_REMEDIATION", label: "Mould Remediation", icon: Bug, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", activeBg: "bg-emerald-100 dark:bg-emerald-900/40", activeRing: "ring-emerald-500/30" },
  { value: "STORM_DAMAGE", label: "Storm Damage", icon: CloudLightning, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", activeBg: "bg-amber-100 dark:bg-amber-900/40", activeRing: "ring-amber-500/30" },
]

const EXPERIENCE_LEVELS = [
  { value: "novice", label: "Novice", description: "New to restoration work", icon: GraduationCap, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800", activeBg: "bg-blue-100 dark:bg-blue-900/40", activeRing: "ring-blue-500/30" },
  { value: "experienced", label: "Experienced", description: "2+ years in restoration", icon: User, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", activeBg: "bg-emerald-100 dark:bg-emerald-900/40", activeRing: "ring-emerald-500/30" },
  { value: "expert", label: "Expert", description: "5+ years, IICRC certified", icon: Award, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800", activeBg: "bg-purple-100 dark:bg-purple-900/40", activeRing: "ring-purple-500/30" },
]

export default function NewInterviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reportId = searchParams.get("reportId")
  const initialJobType = searchParams.get("jobType") || "WATER_DAMAGE"
  const initialPostcode = searchParams.get("postcode") || ""

  const [jobType, setJobType] = useState(initialJobType)
  const [postcode, setPostcode] = useState(initialPostcode)
  const [experienceLevel, setExperienceLevel] = useState<"novice" | "experienced" | "expert">("experienced")
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/form-templates")
      if (response.ok) {
        const data = await response.json()
        const tpls = data.templates || []
        setTemplates(tpls)
        if (tpls.length > 0) {
          setSelectedTemplate(tpls[0].id)
        }
      }
    } catch (error) {
      console.error("Error fetching templates:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleStart = () => {
    if (!selectedTemplate) {
      toast.error("Please select a form template")
      return
    }

    setStarting(true)
    const params = new URLSearchParams({
      formTemplateId: selectedTemplate,
      jobType,
      experienceLevel,
    })
    if (postcode) params.set("postcode", postcode)
    if (reportId) params.set("reportId", reportId)

    router.push(`/dashboard/forms/interview?${params.toString()}`)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard/interviews")}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="text-cyan-500" size={24} />
            Start Interview
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400">
            Configure your guided interview session
          </p>
        </div>
      </div>

      {reportId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
          <MessageSquare size={14} />
          Linked to Report: <span className="font-medium">{reportId}</span>
        </div>
      )}

      {/* Job Type Selection */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-neutral-700 dark:text-slate-300 uppercase tracking-wider">
          Job Type
        </label>
        <div className="grid grid-cols-2 gap-3">
          {JOB_TYPES.map((jt) => {
            const isActive = jobType === jt.value
            const Icon = jt.icon
            return (
              <button
                key={jt.value}
                onClick={() => setJobType(jt.value)}
                className={cn(
                  "flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-200",
                  isActive
                    ? cn(jt.activeBg, jt.border, "ring-2", jt.activeRing)
                    : cn(jt.bg, "border-neutral-200 dark:border-slate-700", "hover:border-cyan-300 dark:hover:border-cyan-800")
                )}
              >
                <Icon size={24} className={jt.color} />
                <span className={cn("font-medium text-sm", isActive ? "text-neutral-900 dark:text-white" : "text-neutral-700 dark:text-slate-300")}>
                  {jt.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Postcode */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-neutral-700 dark:text-slate-300 uppercase tracking-wider">
          Postcode <span className="text-neutral-400 font-normal normal-case">(optional — for building code detection)</span>
        </label>
        <div className="relative">
          <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="e.g. 2000"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all"
            maxLength={4}
          />
        </div>
      </div>

      {/* Experience Level Selection */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-neutral-700 dark:text-slate-300 uppercase tracking-wider">
          Experience Level
        </label>
        <div className="grid grid-cols-3 gap-3">
          {EXPERIENCE_LEVELS.map((level) => {
            const isActive = experienceLevel === level.value
            const Icon = level.icon
            return (
              <button
                key={level.value}
                onClick={() => setExperienceLevel(level.value as "novice" | "experienced" | "expert")}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all duration-200",
                  isActive
                    ? cn(level.activeBg, level.border, "ring-2", level.activeRing)
                    : cn(level.bg, "border-neutral-200 dark:border-slate-700", "hover:border-cyan-300 dark:hover:border-cyan-800")
                )}
              >
                <Icon size={24} className={level.color} />
                <div className="flex-1">
                  <div className={cn("font-medium text-sm mb-0.5", isActive ? "text-neutral-900 dark:text-white" : "text-neutral-700 dark:text-slate-300")}>
                    {level.label}
                  </div>
                  <div className={cn("text-xs", isActive ? "text-neutral-600 dark:text-slate-400" : "text-neutral-500 dark:text-slate-500")}>
                    {level.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Template Selection */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-neutral-700 dark:text-slate-300 uppercase tracking-wider">
          Form Template
        </label>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-cyan-500" size={24} />
          </div>
        ) : templates.length === 0 ? (
          <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 text-sm text-amber-700 dark:text-amber-400">
            No form templates available. Create a form template first, or the interview will use the default question set.
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => setSelectedTemplate(tpl.id)}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all duration-200",
                  selectedTemplate === tpl.id
                    ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 ring-2 ring-cyan-500/30"
                    : "border-neutral-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-800"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-neutral-900 dark:text-white">{tpl.name}</div>
                    {tpl.description && (
                      <div className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5 line-clamp-1">{tpl.description}</div>
                    )}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 dark:bg-slate-800 text-neutral-500 dark:text-slate-400 capitalize">
                    {tpl.category.toLowerCase().replace("_", " ")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Start Button */}
      <div className="pt-4 border-t border-neutral-200 dark:border-slate-700">
        <button
          onClick={handleStart}
          disabled={starting || (!selectedTemplate && templates.length > 0)}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all duration-200",
            starting
              ? "bg-cyan-400 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.01] active:scale-[0.99]"
          )}
        >
          {starting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <MessageSquare size={18} />
              Start Guided Interview
              <ChevronRight size={16} />
            </>
          )}
        </button>
        <p className="text-xs text-neutral-400 dark:text-slate-500 text-center mt-2">
          Est. {jobType === "WATER_DAMAGE" ? "10-15" : "8-12"} minutes • IICRC S500 compliant questions
        </p>
      </div>
    </div>
  )
}
