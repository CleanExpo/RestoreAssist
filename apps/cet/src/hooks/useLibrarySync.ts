/**
 * useLibrarySync
 *
 * Fetches the CET video library from RestoreAssist API and pre-downloads
 * MP4 files to Capacitor Filesystem for offline playback.
 *
 * - On WiFi: downloads all READY videos to device storage
 * - On cellular / offline: uses cached videos only (no download)
 * - cetToken: stored in localStorage on first device setup (entered via QR scan)
 */

import { useState, useEffect, useCallback } from 'react'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Network } from '@capacitor/network'

export interface CetVideo {
  id: string
  title: string
  category: string
  videoUrl: string
  thumbnailUrl: string | null
  durationSeconds: number | null
  sortOrder: number
}

export interface LibraryInfo {
  companyName: string
  logoUrl: string | null
  primaryColour: string
}

export interface LibraryState {
  library: LibraryInfo | null
  videos: CetVideo[]
  localUris: Record<string, string>  // videoId → local Capacitor Filesystem URI
  syncing: boolean
  error: string | null
  lastSync: Date | null
}

const API_BASE = 'https://restoreassist.com.au'
const CET_TOKEN_KEY = 'cet_library_token'

// ── Download a single video to Capacitor Filesystem ──────────────────────────

async function downloadVideo(video: CetVideo): Promise<string | null> {
  const fileName = `cet-video-${video.id}.mp4`

  // Return cached URI if already downloaded
  try {
    const stat = await Filesystem.stat({ path: fileName, directory: Directory.Data })
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Data })
    if (stat.size > 0) return uri
  } catch {
    // Not cached — need to download
  }

  try {
    const response = await fetch(video.videoUrl)
    if (!response.ok) return null

    const blob = await response.blob()

    // Convert blob to base64 for Filesystem.writeFile
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        resolve(result.split(',')[1]) // Strip data: prefix
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

    await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Data,
    })

    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Data })
    return uri
  } catch (err) {
    console.warn(`[CET] Failed to download ${video.id}:`, err)
    return null
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLibrarySync() {
  const [state, setState] = useState<LibraryState>({
    library: null,
    videos: [],
    localUris: {},
    syncing: false,
    error: null,
    lastSync: null,
  })

  const syncLibrary = useCallback(async (force = false) => {
    const token = localStorage.getItem(CET_TOKEN_KEY)
    if (!token) {
      setState(s => ({ ...s, error: 'No CET token configured. Please set up this device.' }))
      return
    }

    setState(s => ({ ...s, syncing: true, error: null }))

    try {
      // 1. Fetch library manifest from API
      const res = await fetch(`${API_BASE}/api/cet/library?token=${token}`)
      if (!res.ok) {
        const data = await res.json()
        setState(s => ({ ...s, syncing: false, error: data.error ?? 'Failed to fetch library' }))
        return
      }

      const { library, videos } = await res.json() as { library: LibraryInfo; videos: CetVideo[] }

      // 2. Check network type — only download on WiFi
      const netStatus = await Network.getStatus()
      const shouldDownload = force || (netStatus.connected && netStatus.connectionType !== 'cellular')

      // 3. Pre-download videos
      const localUris: Record<string, string> = {}
      if (shouldDownload) {
        await Promise.allSettled(
          videos.map(async video => {
            const uri = await downloadVideo(video)
            if (uri) localUris[video.id] = uri
          })
        )
      } else {
        // Load any already-cached URIs
        for (const video of videos) {
          try {
            const { uri } = await Filesystem.getUri({
              path: `cet-video-${video.id}.mp4`,
              directory: Directory.Data,
            })
            localUris[video.id] = uri
          } catch {
            // Not cached — video will stream from URL if network available
          }
        }
      }

      setState({
        library,
        videos,
        localUris,
        syncing: false,
        error: null,
        lastSync: new Date(),
      })
    } catch (err) {
      setState(s => ({
        ...s,
        syncing: false,
        error: err instanceof Error ? err.message : 'Sync failed',
      }))
    }
  }, [])

  // Initial sync on mount
  useEffect(() => {
    syncLibrary()
  }, [syncLibrary])

  // Re-sync when network reconnects
  useEffect(() => {
    let lastType = 'unknown'
    const listener = Network.addListener('networkStatusChange', status => {
      const currentType = status.connectionType
      if (status.connected && currentType !== 'cellular' && lastType !== currentType) {
        syncLibrary()
      }
      lastType = currentType
    })
    return () => { listener.then(h => h.remove()) }
  }, [syncLibrary])

  const setCetToken = (token: string) => {
    localStorage.setItem(CET_TOKEN_KEY, token)
    syncLibrary(true)
  }

  const hasCetToken = () => !!localStorage.getItem(CET_TOKEN_KEY)

  return { ...state, syncLibrary, setCetToken, hasCetToken }
}
