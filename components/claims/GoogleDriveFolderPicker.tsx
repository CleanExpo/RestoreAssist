'use client'

import { useState, useCallback } from 'react'
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
} from 'lucide-react'
import toast from 'react-hot-toast'

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
