'use client'

import { useState, useCallback, useRef } from 'react'
import { signIn } from 'next-auth/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  FileText,
  ArrowLeft,
  Home,
  Loader2,
  Cloud,
} from 'lucide-react'
import toast from 'react-hot-toast'

declare global {
  interface Window {
    gapi?: { load: (name: string, cb: () => void) => void; picker?: unknown }
    google?: {
      picker: {
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown
          setOAuthToken: (token: string) => unknown
          setAppId: (id: string) => unknown
          setDeveloperKey: (key: string) => unknown
          setCallback: (cb: (data: unknown) => void) => unknown
          build: () => { setVisible: (v: boolean) => void }
        }
        DocsView: new (id?: number) => {
          setIncludeFolders: (v: boolean) => unknown
          setSelectFolderEnabled: (v: boolean) => unknown
          setMimeTypes: (m: string) => unknown
        }
        ViewId: { FOLDERS: number; DOCS: number }
        Response: { ACTION: string; DOCUMENTS: unknown[] }
        Action: { PICKED: string }
        Document: { ID: string; NAME: string; MIME_TYPE: string }
      }
    }
  }
}

interface FolderItem {
  id: string
  name: string
}

interface BreadcrumbItem {
  id: string
  name: string
}

interface GoogleDriveFolderPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (folderId: string, folderName: string) => void
}

export function GoogleDriveFolderPicker({
  open,
  onOpenChange,
  onSelect,
}: GoogleDriveFolderPickerProps) {
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [pdfCount, setPdfCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'root', name: 'My Drive' },
  ])
  const [currentFolderId, setCurrentFolderId] = useState('root')
  const [initialized, setInitialized] = useState(false)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [needsGoogleSignIn, setNeedsGoogleSignIn] = useState(false)
  const scriptsLoadedRef = useRef(false)

  const loadGooglePickerScript = (): Promise<void> =>
    new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve()
        return
      }
      if (window.gapi?.picker !== undefined) {
        resolve()
        return
      }
      if (scriptsLoadedRef.current) {
        const check = () => {
          if (window.gapi?.picker !== undefined) resolve()
          else setTimeout(check, 50)
        }
        check()
        return
      }
      const script = document.createElement('script')
      script.src = 'https://apis.google.com/js/api.js'
      script.async = true
      script.onload = () => {
        window.gapi!.load('picker', () => {
          scriptsLoadedRef.current = true
          resolve()
        })
      }
      document.head.appendChild(script)
    })

  const openGoogleDrivePicker = useCallback(async () => {
    setPickerLoading(true)
    setNeedsGoogleSignIn(false)
    try {
      const res = await fetch('/api/claims/google-drive-token')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 403) {
          setNeedsGoogleSignIn(true)
          toast.error('Sign in with Google to browse your Drive')
        } else {
          toast.error(data.message || data.error || 'Failed to get Google Drive access')
        }
        return
      }
      const accessToken = data.accessToken
      if (!accessToken) {
        setNeedsGoogleSignIn(true)
        toast.error('Sign in with Google to browse your Drive')
        return
      }
      await loadGooglePickerScript()
      const google = window.google
      const gapi = window.gapi
      if (!google?.picker || !gapi) {
        toast.error('Google Picker failed to load')
        return
      }
      const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID || ''
      const developerKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''
      const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder')
      const builder = new google.picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(accessToken)
        .setCallback((pickerData: unknown) => {
          const d = pickerData as Record<string, unknown>
          const action = d?.action ?? (typeof google.picker.Response !== 'undefined' && (d as Record<string, unknown>)[(google.picker.Response as Record<string, string>).ACTION])
          const docsRaw = d?.docs ?? (typeof google.picker.Response !== 'undefined' && (d as Record<string, unknown>)[(google.picker.Response as Record<string, string>).DOCUMENTS])
          const docs = Array.isArray(docsRaw) ? docsRaw : undefined
          const picked = action === 'picked' || (typeof google.picker.Action !== 'undefined' && action === (google.picker.Action as Record<string, string>).PICKED)
          if (picked && docs?.[0]) {
            const doc = docs[0] as Record<string, unknown>
            const id = (doc.id ?? doc.ID) as string
            const name = (doc.name ?? doc.NAME) as string
            if (id) {
              onSelect(id, name || 'Selected Folder')
              onOpenChange(false)
            }
          }
        })
      if (appId) builder.setAppId(appId)
      if (developerKey) builder.setDeveloperKey(developerKey)
      const picker = builder.build()
      picker.setVisible(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to open Google Drive')
    } finally {
      setPickerLoading(false)
    }
  }, [onSelect, onOpenChange])

  const fetchFolders = useCallback(async (parentId: string) => {
    setLoading(true)
    try {
      const response = await fetch('/api/claims/drive-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentFolderId: parentId }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load folders')
      }

      const data = await response.json()
      setFolders(data.folders || [])
      setPdfCount(data.pdfCount || 0)
      setCurrentFolderId(parentId)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load folders')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load root on first open
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && !initialized) {
      setInitialized(true)
      fetchFolders('root')
    }
    onOpenChange(isOpen)
  }

  const navigateToFolder = (folder: FolderItem) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
    fetchFolders(folder.id)
  }

  const navigateToBreadcrumb = (index: number) => {
    const target = breadcrumbs[index]
    setBreadcrumbs(prev => prev.slice(0, index + 1))
    fetchFolders(target.id)
  }

  const goBack = () => {
    if (breadcrumbs.length > 1) {
      const newCrumbs = breadcrumbs.slice(0, -1)
      setBreadcrumbs(newCrumbs)
      fetchFolders(newCrumbs[newCrumbs.length - 1].id)
    }
  }

  const handleSelect = () => {
    const currentName = breadcrumbs[breadcrumbs.length - 1]?.name || 'Selected Folder'
    onSelect(currentFolderId, currentName)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Browse Google Drive</DialogTitle>
          <DialogDescription>
            Select a folder containing claim PDFs for analysis
          </DialogDescription>
        </DialogHeader>

        {/* Open with your Google account */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-sm font-medium text-foreground">Browse your Google Drive</p>
          <p className="text-xs text-muted-foreground">
            Sign in with Google to see and select folders from your own Drive.
          </p>
          {needsGoogleSignIn ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Sign in with Google first to use this option.
              </p>
              <Button
                size="sm"
                onClick={() => signIn('google', { callbackUrl: window.location.href })}
                className="w-fit gap-2"
              >
                <Cloud className="h-4 w-4" />
                Sign in with Google
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={openGoogleDrivePicker}
              disabled={pickerLoading}
              className="w-fit gap-2"
            >
              {pickerLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening…
                </>
              ) : (
                <>
                  <Cloud className="h-4 w-4" />
                  Open with Google Drive
                </>
              )}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Or browse folders shared with the app (service account):
        </p>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm overflow-x-auto py-1">
          {breadcrumbs.map((crumb, idx) => (
            <div key={crumb.id} className="flex items-center gap-1 shrink-0">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <button
                onClick={() => navigateToBreadcrumb(idx)}
                className={`hover:underline px-1 py-0.5 rounded transition-colors ${
                  idx === breadcrumbs.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {idx === 0 ? (
                  <span className="flex items-center gap-1">
                    <Home className="h-3.5 w-3.5" />
                    My Drive
                  </span>
                ) : (
                  crumb.name
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Folder list */}
        <ScrollArea className="h-[300px] border rounded-lg">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">No subfolders found</p>
            </div>
          ) : (
            <div className="p-1">
              {breadcrumbs.length > 1 && (
                <button
                  onClick={goBack}
                  className="flex items-center gap-3 w-full p-2.5 rounded-md hover:bg-muted transition-colors text-sm text-muted-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
              )}
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => navigateToFolder(folder)}
                  className="flex items-center gap-3 w-full p-2.5 rounded-md hover:bg-muted transition-colors text-sm group"
                >
                  <Folder className="h-5 w-5 text-amber-500 group-hover:hidden" />
                  <FolderOpen className="h-5 w-5 text-amber-500 hidden group-hover:block" />
                  <span className="truncate text-left flex-1">{folder.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* PDF count + select */}
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
            <FileText className="h-4 w-4" />
            <span>{pdfCount} PDF{pdfCount !== 1 ? 's' : ''} in this folder</span>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Select This Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
