'use client'

/**
 * /dashboard/video-library
 *
 * Client Education Terminal (CET) video library management.
 * Supervisors and admins manage the company's 10 educational videos.
 *
 * Features:
 * - Grid of video cards with status badge (DRAFT / RENDERING / READY / FAILED)
 * - "Add Video" → create a new video from a template category
 * - "Render" button → POST /api/videos/[id]/render
 * - "QR Code" button → GET /api/videos/[id]/qr (for preferred supplier video)
 * - Auto-refresh every 10s when any video is RENDERING
 * - Analytics teaser (upgrade CTA if not enabled)
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Video,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  PlayCircle,
  Clock,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { SCRIPT_TEMPLATES } from '@/lib/video-generation/script-templates'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VideoSummary {
  id: string
  title: string
  category: string
  status: 'DRAFT' | 'RENDERING' | 'READY' | 'FAILED'
  thumbnailUrl: string | null
  videoUrl: string | null
  durationSeconds: number | null
  isShareable: boolean
  shareToken: string | null
  updatedAt: string
}

interface LibraryMeta {
  id: string
  companyName: string
  isAnalyticsEnabled: boolean
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<VideoSummary['status'], { label: string; colour: string; bg: string; icon: React.ReactNode }> = {
  DRAFT: {
    label: 'Draft',
    colour: 'text-neutral-500 dark:text-slate-400',
    bg: 'bg-neutral-100 dark:bg-slate-800',
    icon: <Clock size={12} />,
  },
  RENDERING: {
    label: 'Rendering…',
    colour: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    icon: <Loader2 size={12} className="animate-spin" />,
  },
  READY: {
    label: 'Ready',
    colour: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    icon: <CheckCircle2 size={12} />,
  },
  FAILED: {
    label: 'Failed — retry',
    colour: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/30',
    icon: <AlertTriangle size={12} />,
  },
}

// ── Available categories not yet in library ───────────────────────────────────

function MissingCategoryButton({
  category,
  onAdd,
  adding,
}: {
  category: string
  onAdd: (category: string) => void
  adding: boolean
}) {
  const template = SCRIPT_TEMPLATES[category]
  return (
    <button
      onClick={() => onAdd(category)}
      disabled={adding}
      className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-neutral-200 dark:border-slate-700 hover:border-cyan-400 hover:bg-cyan-50/30 dark:hover:bg-cyan-900/10 transition-all text-left group"
    >
      <Plus size={18} className="text-neutral-400 group-hover:text-cyan-500 flex-shrink-0 transition-colors" />
      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-slate-300 group-hover:text-cyan-700 dark:group-hover:text-cyan-400">
          {template?.title ?? category}
        </p>
        <p className="text-xs text-neutral-400">Click to add from template</p>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VideoLibraryPage() {
  const router = useRouter()
  const [videos, setVideos] = useState<VideoSummary[]>([])
  const [library, setLibrary] = useState<LibraryMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingCategory, setAddingCategory] = useState<string | null>(null)
  const [renderingId, setRenderingId] = useState<string | null>(null)

  const fetchVideos = useCallback(async () => {
    const res = await fetch('/api/videos')
    if (res.ok) {
      const data = await res.json()
      setVideos(data.videos ?? [])
      setLibrary(data.library ?? null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchVideos()
  }, [fetchVideos])

  // Auto-refresh while any video is rendering
  useEffect(() => {
    const hasRendering = videos.some(v => v.status === 'RENDERING')
    if (!hasRendering) return

    const interval = setInterval(fetchVideos, 10_000)
    return () => clearInterval(interval)
  }, [videos, fetchVideos])

  const addVideo = async (category: string) => {
    setAddingCategory(category)
    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.video.title} added — click Render to generate the video`)
        await fetchVideos()
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to create video')
      }
    } finally {
      setAddingCategory(null)
    }
  }

  const renderVideo = async (id: string) => {
    setRenderingId(id)
    try {
      const res = await fetch(`/api/videos/${id}/render`, { method: 'POST' })
      if (res.ok) {
        toast.success('Render started — this takes 1-2 minutes')
        await fetchVideos()
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to start render')
      }
    } finally {
      setRenderingId(null)
    }
  }

  const openQr = (id: string) => {
    window.open(`/api/videos/${id}/qr`, '_blank')
  }

  const existingCategories = new Set(videos.map(v => v.category))
  const missingCategories = Object.keys(SCRIPT_TEMPLATES).filter(c => !existingCategories.has(c))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 size={24} className="animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <Video size={22} className="text-cyan-500" />
            Client Education Terminal
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
            Manage the educational videos shown to clients on your CET iPad
            {library && ` — ${library.companyName}`}
          </p>
        </div>
        <button
          onClick={fetchVideos}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className="text-neutral-400" />
        </button>
      </div>

      {/* Analytics add-on banner */}
      {library && !library.isAnalyticsEnabled && (
        <div className="rounded-xl border border-cyan-200 dark:border-cyan-800/50 bg-cyan-50/50 dark:bg-cyan-900/10 p-4 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-cyan-800 dark:text-cyan-300">
              Unlock Video Analytics — $33/month
            </p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-0.5">
              See how many clients watch each video, completion rates, and daily view trends.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/integrations')}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium transition-colors flex-shrink-0"
          >
            Add Analytics
          </button>
        </div>
      )}

      {/* Video grid */}
      {videos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Your Video Library
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map(video => {
              const cfg = STATUS_CONFIG[video.status]
              return (
                <div
                  key={video.id}
                  className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden hover:border-neutral-300 dark:hover:border-slate-600 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-neutral-100 dark:bg-slate-800 relative">
                    {video.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video size={32} className="text-neutral-300 dark:text-slate-600" />
                      </div>
                    )}
                    {/* Status badge */}
                    <span className={cn('absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.colour, cfg.bg)}>
                      {cfg.icon} {cfg.label}
                    </span>
                    {/* Duration */}
                    {video.durationSeconds && (
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-xs">
                        {Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, '0')}
                      </span>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-3 space-y-3">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white leading-snug">
                      {video.title}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {/* Render / Re-render */}
                      {(video.status === 'DRAFT' || video.status === 'FAILED') && (
                        <button
                          onClick={() => renderVideo(video.id)}
                          disabled={renderingId === video.id}
                          className="flex-1 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {renderingId === video.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <PlayCircle size={12} />
                          )}
                          Render
                        </button>
                      )}

                      {/* QR code (shareable videos only) */}
                      {video.status === 'READY' && video.isShareable && video.shareToken && (
                        <button
                          onClick={() => openQr(video.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800 text-xs text-neutral-600 dark:text-slate-300 transition-colors flex-shrink-0"
                        >
                          <QrCode size={13} />
                          QR
                        </button>
                      )}

                      {/* View detail */}
                      <button
                        onClick={() => router.push(`/dashboard/video-library/${video.id}`)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800 text-xs text-neutral-600 dark:text-slate-300 transition-colors flex-shrink-0"
                        aria-label="View detail"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Missing categories */}
      {missingCategories.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Add Videos from Templates
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {missingCategories.map(category => (
              <MissingCategoryButton
                key={category}
                category={category}
                onAdd={addVideo}
                adding={addingCategory === category}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {videos.length === 0 && missingCategories.length === 0 && (
        <div className="text-center py-16">
          <Video size={48} className="text-neutral-200 dark:text-slate-700 mx-auto mb-4" />
          <p className="text-neutral-500 dark:text-slate-400">No videos yet.</p>
          <p className="text-sm text-neutral-400 mt-1">Use the templates above to create your first CET video.</p>
        </div>
      )}
    </div>
  )
}
