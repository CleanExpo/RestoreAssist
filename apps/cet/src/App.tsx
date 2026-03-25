/**
 * RestoreAssist CET — Kiosk Video Player
 *
 * iPad kiosk app for client-facing video education.
 * No auth. No inspection data. Offline-first via Capacitor Filesystem.
 *
 * Flow:
 *   1. First launch → prompt for cetToken (scanned via QR or typed manually)
 *   2. Sync library from RestoreAssist API on WiFi
 *   3. Display video grid → tap to play fullscreen
 *   4. Record view events at 0 / 25 / 50 / 75 / 100% completion
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useLibrarySync, type CetVideo } from './hooks/useLibrarySync'

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = 'https://restoreassist.com.au'
const CYAN = '#00F5FF'
const DARK = '#050505'

// ── Session ID (no PII — for anonymous view tracking only) ───────────────────

function getSessionId(): string {
  const key = 'cet_view_session'
  let id = localStorage.getItem(key)
  if (!id) {
    id = Array.from({ length: 32 }, () =>
      '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('')
    localStorage.setItem(key, id)
  }
  return id
}

// ── Duration formatter ────────────────────────────────────────────────────────

function formatDuration(secs: number | null): string {
  if (!secs) return ''
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── VideoPlayer ───────────────────────────────────────────────────────────────

interface VideoPlayerProps {
  video: CetVideo
  localUri: string | null
  onClose: () => void
}

function VideoPlayer({ video, localUri, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const viewTrackedRef = useRef(false)
  const lastMilestoneRef = useRef(0)

  const src = localUri ?? video.videoUrl

  const recordView = useCallback(async (completionPercent: number) => {
    try {
      await fetch(`${API_BASE}/api/videos/${video.id}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: getSessionId(),
          completionPercent,
          deviceType: 'ipad',
          platform: 'ios',
        }),
      })
    } catch {
      // View tracking is best-effort — never block playback
    }
  }, [video.id])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const onPlay = () => {
      if (!viewTrackedRef.current) {
        viewTrackedRef.current = true
        recordView(0)
      }
    }

    const onTimeUpdate = () => {
      if (!el.duration) return
      const pct = Math.round((el.currentTime / el.duration) * 100)
      const nextMilestone = lastMilestoneRef.current + 25
      if (pct >= nextMilestone && nextMilestone <= 100) {
        lastMilestoneRef.current = nextMilestone
        recordView(nextMilestone)
      }
    }

    const onEnded = () => {
      recordView(100)
    }

    el.addEventListener('play', onPlay)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('ended', onEnded)
    }
  }, [recordView])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: DARK,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ color: CYAN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            {video.category.replace(/_/g, ' ')}
          </p>
          <h2 style={{ color: '#fff', fontSize: 17, fontWeight: 400, lineHeight: 1.3 }}>
            {video.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            borderRadius: 8,
            color: '#aaa',
            cursor: 'pointer',
            fontSize: 14,
            padding: '8px 16px',
            marginLeft: 16,
            flexShrink: 0,
          }}
        >
          Close
        </button>
      </div>

      {/* Video */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          playsInline
          style={{ width: '100%', maxHeight: '100%', borderRadius: 12, background: '#000' }}
        />
      </div>

      {/* Disclaimer */}
      <p style={{
        textAlign: 'center',
        color: 'rgba(255,255,255,0.2)',
        fontSize: 10,
        padding: '8px 24px 16px',
        lineHeight: 1.5,
        flexShrink: 0,
      }}>
        This information is provided for educational purposes only.
        Please consult your insurance policy documents for your specific coverage details.
      </p>
    </div>
  )
}

// ── VideoCard ─────────────────────────────────────────────────────────────────

interface VideoCardProps {
  video: CetVideo
  isDownloaded: boolean
  onTap: () => void
}

function VideoCard({ video, isDownloaded, onTap }: VideoCardProps) {
  return (
    <button
      onClick={onTap}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: 0,
        textAlign: 'left',
        transition: 'border-color 0.15s',
        width: '100%',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        aspectRatio: '16/9',
        background: '#111',
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
      }}>
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 40, height: 40,
              borderRadius: '50%',
              background: 'rgba(0,245,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Play triangle */}
              <div style={{
                width: 0, height: 0,
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderLeft: `14px solid ${CYAN}`,
                marginLeft: 3,
              }} />
            </div>
          </div>
        )}

        {/* Duration badge */}
        {video.durationSeconds && (
          <span style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(0,0,0,0.7)',
            color: '#fff', fontSize: 11, fontWeight: 600,
            borderRadius: 4, padding: '2px 6px',
          }}>
            {formatDuration(video.durationSeconds)}
          </span>
        )}

        {/* Downloaded indicator */}
        {isDownloaded && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.6)',
            borderRadius: 4, padding: '2px 6px',
            fontSize: 10, color: '#4ade80',
          }}>
            ✓ Offline
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px 14px' }}>
        <p style={{
          color: 'rgba(0,245,255,0.6)', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
        }}>
          {video.category.replace(/_/g, ' ')}
        </p>
        <p style={{ color: '#fff', fontSize: 13, fontWeight: 400, lineHeight: 1.4 }}>
          {video.title}
        </p>
      </div>
    </button>
  )
}

// ── Token Setup Screen ────────────────────────────────────────────────────────

interface TokenSetupProps {
  onToken: (token: string) => void
  error: string | null
}

function TokenSetup({ onToken, error }: TokenSetupProps) {
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const token = input.trim()
    if (token.length > 4) onToken(token)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: DARK,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 40,
    }}>
      {/* Accent bar */}
      <div style={{ width: 48, height: 3, background: CYAN, borderRadius: 2, marginBottom: 32 }} />

      <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 300, marginBottom: 12, textAlign: 'center' }}>
        RestoreAssist CET
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 40, textAlign: 'center' }}>
        Enter your library access code to get started.
        {'\n'}This is set up once per device.
      </p>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Library access code"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${error ? '#ef4444' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 10,
            color: '#fff',
            fontSize: 16,
            padding: '14px 16px',
            outline: 'none',
            letterSpacing: '0.05em',
            marginBottom: error ? 8 : 16,
          }}
        />

        {error && (
          <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 16 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={input.trim().length < 5}
          style={{
            width: '100%',
            background: input.trim().length >= 5 ? CYAN : 'rgba(0,245,255,0.2)',
            border: 'none',
            borderRadius: 10,
            color: input.trim().length >= 5 ? DARK : 'rgba(0,245,255,0.4)',
            cursor: input.trim().length >= 5 ? 'pointer' : 'default',
            fontSize: 15,
            fontWeight: 700,
            padding: '14px',
            transition: 'all 0.15s',
          }}
        >
          Connect Library
        </button>
      </form>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const {
    library,
    videos,
    localUris,
    syncing,
    error,
    lastSync,
    setCetToken,
    hasCetToken,
    syncLibrary,
  } = useLibrarySync()

  const [activeVideo, setActiveVideo] = useState<CetVideo | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  // Handle token submission
  const handleToken = (token: string) => {
    setTokenError(null)
    setCetToken(token)
  }

  // Update token error from library error (invalid token returns API error)
  useEffect(() => {
    if (error && !hasCetToken()) {
      setTokenError(error)
    }
  }, [error, hasCetToken])

  // No token — show setup screen
  if (!hasCetToken()) {
    return <TokenSetup onToken={handleToken} error={tokenError} />
  }

  // Show active video player
  if (activeVideo) {
    return (
      <VideoPlayer
        video={activeVideo}
        localUri={localUris[activeVideo.id] ?? null}
        onClose={() => setActiveVideo(null)}
      />
    )
  }

  const companyName = library?.companyName ?? 'RestoreAssist'
  const primaryColour = library?.primaryColour ?? CYAN

  return (
    <div style={{
      height: '100%', width: '100%',
      background: DARK,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <span style={{
            color: primaryColour,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            {companyName}
          </span>
          {lastSync && (
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 2 }}>
              Library updated {lastSync.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {syncing && (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>Syncing…</span>
          )}
          <button
            onClick={() => syncLibrary(true)}
            disabled={syncing}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: syncing ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)',
              cursor: syncing ? 'default' : 'pointer',
              fontSize: 12,
              padding: '7px 14px',
            }}
          >
            Sync
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          borderBottom: '1px solid rgba(239,68,68,0.2)',
          color: '#fca5a5',
          fontSize: 12,
          padding: '8px 20px',
          flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* Video grid */}
      <div
        className="scrollable"
        style={{ flex: 1, padding: 16, overflowY: 'auto' }}
      >
        {videos.length === 0 && !syncing ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            height: '60vh', textAlign: 'center', gap: 12,
          }}>
            <div style={{ width: 40, height: 3, background: primaryColour, borderRadius: 2 }} />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
              No videos available yet.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
              Connect to WiFi and tap Sync to download your library.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
          }}>
            {videos.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                isDownloaded={!!localUris[video.id]}
                onTap={() => setActiveVideo(video)}
              />
            ))}

            {/* Skeleton cards while syncing */}
            {syncing && videos.length === 0 && Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <div style={{ aspectRatio: '16/9', background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, width: '40%', marginBottom: 8 }} />
                  <div style={{ height: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 4, width: '80%' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>
          {videos.length} video{videos.length !== 1 ? 's' : ''} •{' '}
          {Object.keys(localUris).length} downloaded
        </p>
        <div style={{ width: 32, height: 2, background: primaryColour, borderRadius: 1, opacity: 0.6 }} />
      </div>
    </div>
  )
}
