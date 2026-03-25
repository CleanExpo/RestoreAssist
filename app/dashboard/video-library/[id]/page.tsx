'use client'

/**
 * /dashboard/video-library/[id]
 *
 * Video detail page — preview, script editor, render button, QR code, analytics.
 */

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  PlayCircle,
  Loader2,
  QrCode,
  Pencil,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VideoDetail {
  id: string
  title: string
  category: string
  status: 'DRAFT' | 'RENDERING' | 'READY' | 'FAILED'
  videoUrl: string | null
  thumbnailUrl: string | null
  audioUrl: string | null
  durationSeconds: number | null
  scriptText: string
  isShareable: boolean
  shareToken: string | null
  updatedAt: string
  library: {
    companyName: string
    isAnalyticsEnabled: boolean
    brandingMode: string
  }
}

interface Analytics {
  totalViews: number
  uniqueSessions: number
  avgCompletion: number
  fullyWatched: number
  completionBuckets: Record<string, number>
  viewsByDay: Record<string, number>
}

// ── Status colours ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'Draft',        cls: 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-400' },
  RENDERING: { label: 'Rendering…',   cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  READY:     { label: 'Ready',        cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
  FAILED:    { label: 'Failed',       cls: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [video, setVideo] = useState<VideoDetail | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [analyticsUpgradeRequired, setAnalyticsUpgradeRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [editingScript, setEditingScript] = useState(false)
  const [scriptDraft, setScriptDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchVideo = async () => {
    const res = await fetch(`/api/videos/${id}`)
    if (res.ok) {
      const data = await res.json()
      setVideo(data.video)
      setScriptDraft(data.video.scriptText)
    } else {
      router.push('/dashboard/video-library')
    }
    setLoading(false)
  }

  const fetchAnalytics = async () => {
    const res = await fetch(`/api/videos/${id}/analytics`)
    if (res.ok) {
      const data = await res.json()
      setAnalytics(data)
    } else if (res.status === 402) {
      setAnalyticsUpgradeRequired(true)
    }
  }

  useEffect(() => {
    fetchVideo()
    fetchAnalytics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Auto-refresh when rendering
  useEffect(() => {
    if (video?.status !== 'RENDERING') return
    const interval = setInterval(fetchVideo, 10_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.status])

  const renderVideo = async () => {
    setRendering(true)
    try {
      const res = await fetch(`/api/videos/${id}/render`, { method: 'POST' })
      if (res.ok) {
        toast.success('Render started — check back in 1-2 minutes')
        await fetchVideo()
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to start render')
      }
    } finally {
      setRendering(false)
    }
  }

  const saveScript = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/videos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptText: scriptDraft }),
      })
      if (res.ok) {
        toast.success('Script saved — render again to apply changes')
        setEditingScript(false)
        await fetchVideo()
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to save script')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading || !video) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 size={24} className="animate-spin text-neutral-400" />
      </div>
    )
  }

  const badge = STATUS_BADGE[video.status]

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Back + title */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.push('/dashboard/video-library')}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0 mt-0.5"
        >
          <ArrowLeft size={18} className="text-neutral-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
              {video.title}
            </h1>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1', badge.cls)}>
              {video.status === 'RENDERING' && <Loader2 size={10} className="animate-spin" />}
              {video.status === 'READY' && <CheckCircle2 size={10} />}
              {video.status === 'FAILED' && <AlertTriangle size={10} />}
              {badge.label}
            </span>
          </div>
          <p className="text-sm text-neutral-400 mt-0.5">{video.library.companyName}</p>
        </div>
      </div>

      {/* Video player or placeholder */}
      {video.videoUrl ? (
        <div className="rounded-xl overflow-hidden bg-black aspect-video">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={video.videoUrl}
            poster={video.thumbnailUrl ?? undefined}
            controls
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 dark:border-slate-700 aspect-video flex flex-col items-center justify-center gap-3 bg-neutral-50 dark:bg-slate-900/50">
          <PlayCircle size={48} className="text-neutral-300 dark:text-slate-600" />
          <p className="text-sm text-neutral-400">
            {video.status === 'RENDERING'
              ? 'Rendering in progress — check back in 1-2 minutes'
              : 'No video yet — render to generate'}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        {(video.status === 'DRAFT' || video.status === 'FAILED') && (
          <button
            onClick={renderVideo}
            disabled={rendering}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {rendering ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
            Render Video
          </button>
        )}

        {video.status === 'READY' && video.isShareable && video.shareToken && (
          <a
            href={`/api/videos/${id}/qr`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800 text-sm text-neutral-700 dark:text-slate-300 transition-colors"
          >
            <QrCode size={15} />
            Download QR Code
          </a>
        )}

        {video.status === 'READY' && video.isShareable && video.shareToken && (
          <a
            href={`/watch/${video.shareToken}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800 text-sm text-neutral-700 dark:text-slate-300 transition-colors"
          >
            Preview public link
          </a>
        )}
      </div>

      {/* Script editor */}
      <div className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-slate-200">Script</h2>
          {!editingScript ? (
            <button
              onClick={() => setEditingScript(true)}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-slate-300 transition-colors"
            >
              <Pencil size={13} /> Edit script
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingScript(false); setScriptDraft(video.scriptText) }}
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600"
              >
                <X size={13} /> Cancel
              </button>
              <button
                onClick={saveScript}
                disabled={saving}
                className="flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700 font-medium"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save
              </button>
            </div>
          )}
        </div>

        {editingScript ? (
          <textarea
            value={scriptDraft}
            onChange={e => setScriptDraft(e.target.value)}
            rows={18}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 text-sm text-neutral-700 dark:text-slate-300 font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        ) : (
          <pre className="text-sm text-neutral-600 dark:text-slate-400 whitespace-pre-wrap font-sans leading-relaxed">
            {video.scriptText}
          </pre>
        )}
      </div>

      {/* Analytics */}
      <div className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-slate-200 flex items-center gap-2 mb-4">
          <BarChart3 size={15} className="text-cyan-500" />
          Video Analytics
        </h2>

        {analyticsUpgradeRequired ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-neutral-50 dark:bg-slate-800/50 border border-dashed border-neutral-200 dark:border-slate-700">
            <Lock size={16} className="text-neutral-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-neutral-700 dark:text-slate-300">Analytics add-on required</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                Add the Analytics add-on ($33/month) to see viewing data for this video.
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/integrations')}
              className="ml-auto px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium flex-shrink-0"
            >
              Upgrade
            </button>
          </div>
        ) : analytics ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Views', value: analytics.totalViews },
              { label: 'Unique Clients', value: analytics.uniqueSessions },
              { label: 'Avg. Completion', value: `${analytics.avgCompletion}%` },
              { label: 'Fully Watched', value: analytics.fullyWatched },
            ].map(stat => (
              <div key={stat.label} className="text-center p-3 rounded-lg bg-neutral-50 dark:bg-slate-800/50">
                <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No viewing data yet — views are recorded when the CET app plays this video.</p>
        )}
      </div>
    </div>
  )
}
