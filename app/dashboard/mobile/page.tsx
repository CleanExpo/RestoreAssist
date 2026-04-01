"use client"

import { useState } from "react"
import {
  Smartphone,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  QrCode,
  Apple,
  Wifi,
  WifiOff,
  Camera,
  Bell,
  ShieldCheck,
  RefreshCw,
  Database,
  Zap,
  Send,
  Loader2,
  ChevronRight,
  Download,
  Play,
} from "lucide-react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeatureStatus = "done" | "pending" | "blocked"

interface MobileFeature {
  id: string
  title: string
  description: string
  status: FeatureStatus
  icon: React.ComponentType<{ size?: number; className?: string }>
  blockedReason?: string
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const V1_FEATURES: MobileFeature[] = [
  {
    id: "field-capture",
    title: "Field inspection capture",
    description: "Camera, GPS tagging, and moisture reading input on site with IICRC S500 real-time validation.",
    status: "done",
    icon: Camera,
  },
  {
    id: "offline-sqlite",
    title: "Offline-first SQLite storage",
    description: "All inspection data stored locally in Expo SQLite 15. Works with zero signal — syncs automatically when connectivity returns.",
    status: "done",
    icon: WifiOff,
  },
  {
    id: "byok",
    title: "BYOK API key management",
    description: "Technicians bring their own AI API keys stored securely in iOS Keychain / Android Keystore via Expo SecureStore.",
    status: "done",
    icon: ShieldCheck,
  },
  {
    id: "auth",
    title: "Authentication",
    description: "Login, signup, and session persistence using NextAuth JWT tokens. Full role support: Admin, Manager, Technician.",
    status: "done",
    icon: ShieldCheck,
  },
  {
    id: "jobs-screen",
    title: "Jobs screen",
    description: "Active and recent jobs list with pull-to-refresh, search, and status filtering.",
    status: "done",
    icon: Database,
  },
  {
    id: "reports-screen",
    title: "Reports screen",
    description: "Browse completed reports with PDF preview and native sharing via expo-sharing.",
    status: "done",
    icon: Database,
  },
  {
    id: "inspection-detail",
    title: "Inspection detail screen",
    description: "Full room-by-room breakdown with moisture readings, photos, and IICRC classification.",
    status: "done",
    icon: CheckCircle2,
  },
  {
    id: "ai-reports",
    title: "AI report generation",
    description: "Generate IICRC-compliant scope narratives on-device using the technician's own API key, streamed via SSE.",
    status: "done",
    icon: Zap,
  },
  {
    id: "push-notifications",
    title: "Push notifications",
    description: "Expo Push Notifications for new job dispatches, sync errors, and inspection completions. PushToken model in DB.",
    status: "done",
    icon: Bell,
  },
  {
    id: "sync-engine",
    title: "Sync engine with image compression",
    description: "Background sync compresses photos to 90% JPEG at max 1920px before uploading to Supabase Storage.",
    status: "done",
    icon: RefreshCw,
  },
  {
    id: "prisma-models",
    title: "MobileInspection + PushToken models",
    description: "Prisma schema additions for offline-created inspections with sync state and per-device push tokens.",
    status: "done",
    icon: Database,
  },
  {
    id: "eas-setup",
    title: "EAS Project ID + env config",
    description: "EAS Project ID must be configured in app.config.ts. Supabase env vars required in mobile/.env.local.",
    status: "blocked",
    icon: AlertTriangle,
    blockedReason: "RA-246 — human action required",
  },
  {
    id: "testflight",
    title: "TestFlight internal testing",
    description: "Submit build to TestFlight for internal testers. Requires EAS setup to be complete first.",
    status: "blocked",
    icon: Apple,
    blockedReason: "Blocked on EAS setup (RA-246)",
  },
  {
    id: "app-store",
    title: "App Store submission",
    description: "Submit to Apple App Store for public distribution. Requires TestFlight round to be complete.",
    status: "pending",
    icon: Apple,
  },
  {
    id: "play-store",
    title: "Google Play submission",
    description: "Submit to Google Play for public distribution. Requires EAS Android build.",
    status: "pending",
    icon: Play,
  },
]

const V2_FEATURES = [
  {
    title: "Bluetooth moisture meter integration",
    description: "Direct BLE pairing with Protimeter MMS3 and Tramex CME5 meters. Auto-populates readings without manual entry.",
  },
  {
    title: "Photo OCR for meter readings",
    description: "Use on-device ML (Vision / ML Kit) to extract moisture readings from photos of analogue meters.",
  },
  {
    title: "Offline maps for site navigation",
    description: "Cached offline maps for navigating to remote loss sites with no mobile signal.",
  },
  {
    title: "Multi-site job management",
    description: "Manage multiple simultaneous loss sites in one session without losing in-progress data.",
  },
  {
    title: "Voice-to-text field notes",
    description: "Hands-free documentation with expo-speech and Whisper API — dictate room descriptions while working.",
  },
  {
    title: "Insurance adjuster portal",
    description: "Share inspection summaries and evidence directly with adjusters via a secure time-limited link.",
  },
  {
    title: "Equipment tracking via NFC",
    description: "Scan NFC tags on dehumidifiers, air movers, and scrubbers to record placement and readings automatically.",
  },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeatureStatusBadge({ status }: { status: FeatureStatus }) {
  if (status === "done") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs">
        Complete
      </Badge>
    )
  }
  if (status === "blocked") {
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs">
        Blocked
      </Badge>
    )
  }
  return (
    <Badge className="bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-400 border-0 text-xs">
      Pending
    </Badge>
  )
}

function FeatureRow({ feature }: { feature: MobileFeature }) {
  const Icon = feature.icon
  return (
    <div
      className={cn(
        "flex items-start gap-4 py-4 border-b last:border-b-0",
        "border-neutral-100 dark:border-slate-800"
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
          feature.status === "done"
            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            : feature.status === "blocked"
            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            : "bg-neutral-100 dark:bg-slate-800 text-neutral-500 dark:text-slate-500"
        )}
      >
        {feature.status === "done" ? (
          <CheckCircle2 size={16} />
        ) : feature.status === "blocked" ? (
          <AlertTriangle size={16} />
        ) : (
          <Clock size={16} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-sm font-medium",
              "text-neutral-900 dark:text-slate-100"
            )}
          >
            {feature.title}
          </span>
          <FeatureStatusBadge status={feature.status} />
        </div>
        <p className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          {feature.description}
        </p>
        {feature.blockedReason && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
            {feature.blockedReason}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Beta Signup Form
// ---------------------------------------------------------------------------

type DeviceType = "ios" | "android" | "both"

function BetaSignupCard() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [deviceType, setDeviceType] = useState<DeviceType>("both")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/mobile/beta-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, deviceType }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.")
      }
      setSubmitted(true)
      toast.success(data.message || "You're on the list!")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className={cn("border", "border-neutral-200 dark:border-slate-800", "bg-white dark:bg-slate-900")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell size={18} className="text-cyan-500" />
          Join the Mobile Beta
        </CardTitle>
        <CardDescription>
          Be the first to test RestoreAssist on iOS and Android. We'll notify
          you as soon as TestFlight and the Play Store beta are open.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-neutral-900 dark:text-slate-100">
              You're on the list!
            </p>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              We'll email you at <span className="font-mono">{email}</span> when
              the beta is ready for your device.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="beta-name">Full name</Label>
                <Input
                  id="beta-name"
                  type="text"
                  placeholder="Alex Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={submitting}
                  className="bg-white dark:bg-slate-800"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="beta-email">Email address</Label>
                <Input
                  id="beta-email"
                  type="email"
                  placeholder="alex@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                  className="bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Device preference</Label>
              <div className="flex gap-2 flex-wrap">
                {(["ios", "android", "both"] as DeviceType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDeviceType(type)}
                    disabled={submitting}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 border",
                      deviceType === type
                        ? "bg-cyan-500 text-white border-cyan-500 shadow-sm"
                        : "bg-white dark:bg-slate-800 text-neutral-700 dark:text-slate-300 border-neutral-300 dark:border-slate-700 hover:border-cyan-400"
                    )}
                  >
                    {type === "ios" ? "iOS" : type === "android" ? "Android" : "Both"}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Registering…
                </>
              ) : (
                <>
                  <Send size={16} className="mr-2" />
                  Notify me when ready
                </>
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MobileDashboardPage() {
  const doneCount = V1_FEATURES.filter((f) => f.status === "done").length
  const totalCount = V1_FEATURES.length
  const progressPct = Math.round((doneCount / totalCount) * 100)

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Smartphone size={20} className="text-white" />
          </div>
          <div>
            <h1 className={cn("text-2xl font-bold", "text-neutral-900 dark:text-slate-50")}>
              Mobile App
            </h1>
            <p className={cn("text-sm", "text-neutral-500 dark:text-slate-400")}>
              RestoreAssist for iOS &amp; Android — React Native + Expo SDK 52
            </p>
          </div>
        </div>
      </div>

      {/* Build Status */}
      <Card className={cn("border", "border-neutral-200 dark:border-slate-800", "bg-white dark:bg-slate-900")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap size={18} className="text-amber-500" />
            Build Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="text-sm font-medium text-neutral-900 dark:text-slate-100">
                Ready for TestFlight
              </p>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                All V1 features are implemented. Pending EAS Project ID
                configuration (RA-246) before the first build can be submitted.
              </p>
            </div>
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 shrink-0">
              Awaiting EAS Setup
            </Badge>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-neutral-500 dark:text-slate-400">
              <span>{doneCount} of {totalCount} milestones complete</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-neutral-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <Separator className="dark:border-slate-800" />

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Features done", value: `${doneCount - 2}`, note: "v1 core" },
              { label: "Tech stack", value: "Expo 52", note: "SDK" },
              { label: "Min iOS", value: "16.0", note: "required" },
              { label: "Min Android", value: "API 26", note: "Oreo+" },
            ].map((stat) => (
              <div
                key={stat.label}
                className={cn(
                  "rounded-lg p-3 text-center",
                  "bg-neutral-50 dark:bg-slate-800/60"
                )}
              >
                <p className="text-lg font-bold text-neutral-900 dark:text-slate-100">
                  {stat.value}
                </p>
                <p className="text-xs text-neutral-500 dark:text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Two-column grid: QR placeholder + EAS setup guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR / Download section */}
        <Card className={cn("border", "border-neutral-200 dark:border-slate-800", "bg-white dark:bg-slate-900")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download size={18} className="text-cyan-500" />
              Download
            </CardTitle>
            <CardDescription>
              Coming soon — available on App Store and Google Play once launch
              testing is complete.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* QR placeholder */}
            <div
              className={cn(
                "mx-auto w-36 h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2",
                "border-neutral-300 dark:border-slate-700",
                "bg-neutral-50 dark:bg-slate-800/50"
              )}
            >
              <QrCode size={32} className="text-neutral-400 dark:text-slate-600" />
              <p className="text-xs text-neutral-400 dark:text-slate-600 text-center leading-tight px-2">
                QR code<br />coming soon
              </p>
            </div>

            <div className="space-y-3">
              {/* App Store button (placeholder) */}
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl border",
                  "border-neutral-200 dark:border-slate-700",
                  "bg-neutral-50 dark:bg-slate-800/50"
                )}
              >
                <Apple size={24} className="text-neutral-400 dark:text-slate-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-700 dark:text-slate-300">
                    App Store
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-slate-500">
                    iOS 16.0 and later
                  </p>
                </div>
                <Badge className="bg-neutral-100 text-neutral-500 dark:bg-slate-700 dark:text-slate-400 border-0 text-xs">
                  Soon
                </Badge>
              </div>

              {/* Play Store button (placeholder) */}
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl border",
                  "border-neutral-200 dark:border-slate-700",
                  "bg-neutral-50 dark:bg-slate-800/50"
                )}
              >
                <Play size={24} className="text-neutral-400 dark:text-slate-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-700 dark:text-slate-300">
                    Google Play
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-slate-500">
                    Android 8.0 (API 26) and later
                  </p>
                </div>
                <Badge className="bg-neutral-100 text-neutral-500 dark:bg-slate-700 dark:text-slate-400 border-0 text-xs">
                  Soon
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* EAS Setup Guide */}
        <Card className={cn("border border-amber-200 dark:border-amber-800/40", "bg-amber-50 dark:bg-amber-900/10")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle size={18} className="text-amber-500" />
              EAS Setup Required — RA-246
            </CardTitle>
            <CardDescription className="text-amber-700 dark:text-amber-400">
              These steps require human action before the first build can be
              submitted to TestFlight.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                step: "1",
                title: "Create EAS account & project",
                detail: "Run `eas login` then `eas build:configure` in the mobile/ directory to generate the EAS Project ID.",
                link: "https://expo.dev/eas",
                linkLabel: "expo.dev/eas",
              },
              {
                step: "2",
                title: "Add Project ID to app.config.ts",
                detail: "Paste the EAS Project ID into `extra.eas.projectId` in `mobile/app.config.ts`.",
              },
              {
                step: "3",
                title: "Create mobile/.env.local",
                detail: "Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` — copy from the web `.env.local`.",
              },
              {
                step: "4",
                title: "Run first build",
                detail: "`eas build --platform ios --profile preview` — generates the .ipa for TestFlight upload.",
                link: "https://docs.expo.dev/build/introduction/",
                linkLabel: "EAS Build docs",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {item.step}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    {item.title}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                    {item.detail}
                  </p>
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline mt-1"
                    >
                      {item.linkLabel}
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* V1 Feature Checklist */}
      <Card className={cn("border", "border-neutral-200 dark:border-slate-800", "bg-white dark:bg-slate-900")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 size={18} className="text-emerald-500" />
            V1 Feature Status
          </CardTitle>
          <CardDescription>
            All core features are implemented. Remaining items are blocked on
            external configuration (EAS setup) or pending App Store review.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-neutral-100 dark:divide-slate-800 -mt-2">
          {V1_FEATURES.map((feature) => (
            <FeatureRow key={feature.id} feature={feature} />
          ))}
        </CardContent>
      </Card>

      {/* Beta signup */}
      <BetaSignupCard />

      {/* V2 Planned Features */}
      <Card className={cn("border", "border-neutral-200 dark:border-slate-800", "bg-white dark:bg-slate-900")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ChevronRight size={18} className="text-blue-500" />
            V2 Planned Features
          </CardTitle>
          <CardDescription>
            Post-launch roadmap items — all subject to customer feedback from
            V1 TestFlight users.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {V2_FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className={cn(
                "rounded-lg p-4 border",
                "border-neutral-100 dark:border-slate-800",
                "bg-neutral-50 dark:bg-slate-800/40"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-slate-100">
                    {feature.title}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tech Stack */}
      <Card className={cn("border", "border-neutral-200 dark:border-slate-800", "bg-white dark:bg-slate-900")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi size={18} className="text-cyan-500" />
            Tech Stack
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {[
              { key: "Framework", value: "React Native 0.76.0, Expo SDK 52" },
              { key: "Navigation", value: "expo-router 4.0 (file-based)" },
              { key: "Backend", value: "Supabase JS 2.86 (shared)" },
              { key: "Local storage", value: "Expo SQLite 15 — offline-first" },
              { key: "Secure storage", value: "Expo SecureStore (API keys, tokens)" },
              { key: "Push notifications", value: "Expo Notifications + FCM / APNs" },
              { key: "Build &amp; deploy", value: "EAS Build — dev / preview / prod" },
              { key: "OTA updates", value: "EAS Update — hot-fix without review" },
            ].map((row) => (
              <div key={row.key} className="flex justify-between gap-4 text-sm">
                <span className="text-neutral-500 dark:text-slate-400 shrink-0">{row.key}</span>
                <span
                  className="text-neutral-900 dark:text-slate-100 text-right"
                  dangerouslySetInnerHTML={{ __html: row.value }}
                />
              </div>
            ))}
          </div>

          <Separator className="my-4 dark:border-slate-800" />

          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-neutral-400 dark:text-slate-500">
              Linear: RA-162 · EPIC: RA-241 · Directory: <span className="font-mono">D:\RestoreAssist\mobile\</span>
            </p>
            <a
              href="https://docs.expo.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              Expo Docs
              <ExternalLink size={11} />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
