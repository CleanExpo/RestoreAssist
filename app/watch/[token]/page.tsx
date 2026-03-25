/**
 * /watch/[token] — Public video watch page
 *
 * Clients scan a QR code on their phone and land here.
 * No auth required — resolves shareToken to video via /api/videos/share/[token].
 *
 * Records a VideoView event when playback starts (via /api/videos/[id]/view).
 * Uses a random sessionId stored in sessionStorage (no persistent tracking).
 *
 * Branding: shows company name and primaryColour. Clean, minimal design.
 * First frame is always the disclaimer slate (rendered into the video).
 */

'use client'

import { useEffect, useState, use, useRef } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WatchVideo {
  id: string
  title: string
  description: string | null
  videoUrl: string
  thumbnailUrl: string | null
  durationSeconds: number | null
  companyName: string
  primaryColour: string
  sources: string[]
}

// ── Random session ID (no PII) ────────────────────────────────────────────────

function getSessionId(): string {
  const key = 'cet_session_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = Array.from({ length: 32 }, () =>
      '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('')
    sessionStorage.setItem(key, id)
  }
  return id
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WatchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [video, setVideo] = useState<WatchVideo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const viewTrackedRef = useRef(false)
  const lastCompletionRef = useRef(0)

  useEffect(() => {
    fetch(`/api/videos/share/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.video) setVideo(data.video)
        else setError(data.error ?? 'Video not found')
      })
      .catch(() => setError('Failed to load video. Check your connection and try again.'))
      .finally(() => setLoading(false))
  }, [token])

  // Track view events during playback
  useEffect(() => {
    const el = videoRef.current
    if (!el || !video) return

    const recordView = async (completionPercent: number) => {
      try {
        await fetch(`/api/videos/${video.id}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: getSessionId(),
            completionPercent,
            deviceType: /iPad/.test(navigator.userAgent) ? 'ipad' : /iPhone/.test(navigator.userAgent) ? 'iphone' : 'other',
            platform: /iPhone|iPad/.test(navigator.userAgent) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'web',
          }),
        })
      } catch {
        // Non-fatal — analytics best-effort only
      }
    }

    const onPlay = () => {
      if (!viewTrackedRef.current) {
        viewTrackedRef.current = true
        recordView(0)
      }
    }

    const onTimeUpdate = () => {
      if (!el.duration) return
      const completion = Math.round((el.currentTime / el.duration) * 100)
      // Record every 25% milestone
      if (completion >= lastCompletionRef.current + 25) {
        lastCompletionRef.current = Math.floor(completion / 25) * 25
        recordView(lastCompletionRef.current)
      }
    }

    const onEnded = () => recordView(100)

    el.addEventListener('play', onPlay)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('ended', onEnded)
    }
  }, [video])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-slate-500" />
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle size={40} className="text-red-500 mb-4" />
        <p className="text-white text-lg font-light">{error ?? 'Video not found'}</p>
        <p className="text-slate-500 text-sm mt-2">This link may have expired or the video is not ready yet.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-white/5">
        <span
          style={{ color: video.primaryColour }}
          className="text-sm font-semibold tracking-wide uppercase"
        >
          {video.companyName}
        </span>
        <div style={{ width: 32, height: 3, backgroundColor: video.primaryColour, borderRadius: 2 }} />
      </div>

      {/* Video */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-6">
        <div className="w-full max-w-2xl rounded-xl overflow-hidden bg-black shadow-2xl">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            src={video.videoUrl}
            poster={video.thumbnailUrl ?? undefined}
            controls
            playsInline
            className="w-full aspect-video"
          />
        </div>

        {/* Title */}
        <div className="text-center max-w-xl">
          <h1 className="text-white text-xl font-light leading-snug">{video.title}</h1>
          {video.durationSeconds && (
            <p className="text-slate-500 text-sm mt-1">
              {Math.floor(video.durationSeconds / 60)} min {video.durationSeconds % 60} sec
            </p>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-slate-600 text-xs text-center max-w-sm leading-relaxed">
          This information is provided for educational purposes only.
          Please consult your insurance policy documents for your specific coverage details.
        </p>

        {/* Sources */}
        {video.sources.length > 0 && (
          <div className="text-xs text-slate-700 text-center space-y-1">
            <p className="text-slate-600 font-medium">Sources cited:</p>
            {video.sources.map(url => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="block hover:text-slate-500 transition-colors truncate max-w-[280px]"
              >
                {url}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
