'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, Copy, FileCheck, Trash2, Table, Download, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'

interface BulkOperationModalProps {
  operationType: 'export-excel' | 'export-pdf' | 'export-zip' | 'duplicate' | 'status-update' | 'delete'
  selectedCount: number
  selectedIds: string[]
  onClose: () => void
  onRefresh: () => void
}

interface StatusOption {
  value: string
  label: string
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
]

export function BulkOperationModal({
  operationType,
  selectedCount,
  selectedIds,
  onClose,
  onRefresh,
}: BulkOperationModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<string>('PENDING')
  const [appendText, setAppendText] = useState('(Copy)')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [excelReports, setExcelReports] = useState<Array<{
    id: string
    reportNumber: string | null
    title: string
    clientName: string
    propertyAddress: string
    excelUrl: string | null
  }>>([])
  const [downloadingZip, setDownloadingZip] = useState(false)
  const hasTriggeredExport = useRef(false)
  const isDownloading = useRef(false)
  const downloadLinkRef = useRef<HTMLAnchorElement | null>(null)
  const downloadSessionId = useRef<string | null>(null)

  const getOperationTitle = () => {
    switch (operationType) {
      case 'export-excel':
        return 'Export Excel Reports'
      case 'duplicate':
        return 'Duplicate Reports'
      case 'status-update':
        return 'Update Status'
      case 'delete':
        return 'Delete Reports'
      default:
        return 'Confirm Action'
    }
  }

  const getOperationDescription = () => {
    switch (operationType) {
      case 'export-excel':
        return `Export Excel reports for ${selectedCount} report${selectedCount !== 1 ? 's' : ''}?`
      case 'duplicate':
        return `Duplicate ${selectedCount} report${selectedCount !== 1 ? 's' : ''}?`
      case 'status-update':
        return `Update ${selectedCount} report${selectedCount !== 1 ? 's' : ''} to "${STATUS_OPTIONS.find(s => s.value === selectedStatus)?.label}"?`
      case 'delete':
        return `Delete ${selectedCount} report${selectedCount !== 1 ? 's' : ''}? This cannot be undone.`
      default:
        return ''
    }
  }

  const handleDuplicate = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/reports/bulk-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, options: { appendText } }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Duplication failed')
      setSuccess(true)
      toast.success(`Successfully duplicated ${data.duplicated || selectedCount} report(s)`)
      setTimeout(() => { onRefresh(); onClose() }, 1500)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatusUpdate = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/reports/bulk-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, status: selectedStatus }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Status update failed')
      setSuccess(true)
      toast.success(`Successfully updated ${data.updated || selectedCount} report(s)`)
      setTimeout(() => { onRefresh(); onClose() }, 1500)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/reports/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Delete failed')
      setSuccess(true)
      toast.success(`Successfully deleted ${data.deletedCount || selectedCount} report(s)`)
      setTimeout(() => { onRefresh(); onClose() }, 1500)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportExcel = async () => {
    // Prevent double-triggering - check and set synchronously
    if (isLoading || hasTriggeredExport.current || isDownloading.current) {
      return
    }
    // Set flags immediately to prevent race conditions
    hasTriggeredExport.current = true
    isDownloading.current = true
    setIsLoading(true)
    setError(null)
    
    // Generate unique session ID for this download
    const sessionId = `excel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    downloadSessionId.current = sessionId
    
    try {
      // First, get the list of Excel reports to show progress
      const listResponse = await fetch('/api/reports/bulk-export-excel-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, zip: false }),
      })
      const listData = await listResponse.json()
      
      if (!listResponse.ok) {
        // Check if there are missing reports and show customer-centric message
        if (listData.missingReports && listData.missingReports.length > 0) {
          const missingCount = listData.missingReports.length
          const missingList = listData.missingReports
            .slice(0, 5)
            .map((r: any) => `• ${r.reportNumber || r.id} - ${r.clientName}`)
            .join('\n')
          const moreText = missingCount > 5 ? `\n... and ${missingCount - 5} more report(s)` : ''
          
          const errorMessage = `Excel reports not found for ${missingCount} of ${listData.totalSelected || selectedIds.length} selected report(s).\n\nPlease generate Excel reports individually for these reports first:\n\n${missingList}${moreText}\n\nYou can generate Excel reports by opening each report and clicking "Generate Excel Report".`
          throw new Error(errorMessage)
        }
        throw new Error(listData.message || listData.error || 'Export failed')
      }
      
      if (!listData.reports || listData.reports.length === 0) {
        throw new Error('No Excel reports found for selected reports. Please generate Excel reports first.')
      }

      // If some reports are missing Excel files, show a warning but continue with available ones
      if (listData.missingReports && listData.missingReports.length > 0) {
        const missingCount = listData.missingReports.length
        const missingList = listData.missingReports
          .slice(0, 3)
          .map((r: any) => `${r.reportNumber || r.id}`)
          .join(', ')
        const moreText = missingCount > 3 ? ` and ${missingCount - 3} more` : ''
        
        toast(
          `⚠️ ${missingCount} report(s) missing Excel files (${missingList}${moreText}). Exporting ${listData.count} available report(s).`,
          { 
            id: 'excel-export-warning', 
            duration: 8000,
            icon: '⚠️',
            style: {
              background: '#1e293b',
              color: '#fbbf24',
              border: '1px solid #f59e0b'
            }
          }
        )
      }

      setExcelReports(listData.reports)
      toast.loading(`Downloading ${listData.count} Excel file(s) and creating ZIP...`, { id: 'excel-export' })

      // Now download the ZIP (which will download all files from Cloudinary and zip them)
      const zipResponse = await fetch('/api/reports/bulk-export-excel-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, zip: true }),
      })

      if (!zipResponse.ok) {
        const error = await zipResponse.json()
        throw new Error(error.message || error.error || 'Zip download failed')
      }

      // Verify this is still the active download session
      if (downloadSessionId.current !== sessionId) {
        // Another download started, abort this one
        return
      }

      // Remove any existing download links before creating a new one
      if (downloadLinkRef.current && document.body.contains(downloadLinkRef.current)) {
        try {
          document.body.removeChild(downloadLinkRef.current)
        } catch (e) {
          // Link already removed, ignore
        }
      }
      
      const blob = await zipResponse.blob()
      
      // Double-check session is still valid after async operation
      if (downloadSessionId.current !== sessionId) {
        window.URL.revokeObjectURL(window.URL.createObjectURL(blob))
        return
      }
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Excel_Reports_${new Date().toISOString().split('T')[0]}.zip`
      a.style.display = 'none'
      a.setAttribute('data-download-session', sessionId)
      
      // Store reference for cleanup
      downloadLinkRef.current = a
      document.body.appendChild(a)
      
      // Trigger download
      a.click()
      
      // Clean up after download starts
      setTimeout(() => {
        // Only clean up if this is still the active session
        if (downloadSessionId.current === sessionId) {
          window.URL.revokeObjectURL(url)
          if (downloadLinkRef.current && document.body.contains(downloadLinkRef.current)) {
            try {
              document.body.removeChild(downloadLinkRef.current)
            } catch (e) {
              // Already removed, ignore
            }
          }
          downloadLinkRef.current = null
          isDownloading.current = false
        }
      }, 200)
      
      setSuccess(true)
      toast.success(`Successfully downloaded ${listData.count} Excel report(s) as ZIP!`, { id: 'excel-export' })
      setTimeout(() => { onClose() }, 2000)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      // Reset flags on error so user can retry
      hasTriggeredExport.current = false
      isDownloading.current = false
      downloadSessionId.current = null
      if (downloadLinkRef.current && document.body.contains(downloadLinkRef.current)) {
        try {
          document.body.removeChild(downloadLinkRef.current)
        } catch (e) {
          // Already removed, ignore
        }
      }
      downloadLinkRef.current = null
      
      // Show a concise toast message, detailed info is in the modal
      if (errorMsg.includes('Excel reports not found')) {
        const missingCount = errorMsg.match(/(\d+) of (\d+)/)?.[1] || 'some'
        toast.error(
          `Excel reports not found for ${missingCount} selected report(s). Please generate Excel reports individually first.`,
          { 
            id: 'excel-export',
            duration: 5000
          }
        )
      } else {
        toast.error(errorMsg, { id: 'excel-export' })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadZip = async () => {
    setDownloadingZip(true)
    try {
      const response = await fetch('/api/reports/bulk-export-excel-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, zip: true }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || error.error || 'Zip download failed')
      }

      // Prevent double download
      if (isDownloading.current) {
        return
      }
      isDownloading.current = true
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Excel_Reports_${new Date().toISOString().split('T')[0]}.zip`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      // Clean up immediately
      setTimeout(() => {
        window.URL.revokeObjectURL(url)
        if (document.body.contains(a)) {
          document.body.removeChild(a)
        }
        isDownloading.current = false
      }, 100)
      
      toast.success('Zip file downloaded successfully!')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setDownloadingZip(false)
    }
  }

  const handleConfirm = async () => {
    switch (operationType) {
      case 'export-excel':
        await handleExportExcel()
        break
      case 'duplicate':
        await handleDuplicate()
        break
      case 'status-update':
        await handleStatusUpdate()
        break
      case 'delete':
        await handleDelete()
        break
    }
  }

  // Auto-trigger export when modal opens for export-excel
  useEffect(() => {
    // Use a ref to track if we've already set up the effect
    let mounted = true
    
    if (operationType === 'export-excel' && 
        selectedIds.length > 0 && 
        !isLoading && 
        !success && 
        !hasTriggeredExport.current &&
        !isDownloading.current) {
      // Small delay to ensure component is fully mounted and prevent double execution
      const timeoutId = setTimeout(() => {
        if (mounted && !hasTriggeredExport.current && !isDownloading.current) {
          handleExportExcel()
        }
      }, 50)
      
      return () => {
        mounted = false
        clearTimeout(timeoutId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationType])
  
  // Reset trigger flags when modal closes or operation type changes
  useEffect(() => {
    return () => {
      hasTriggeredExport.current = false
      isDownloading.current = false
      downloadSessionId.current = null
      if (downloadLinkRef.current && document.body.contains(downloadLinkRef.current)) {
        try {
          document.body.removeChild(downloadLinkRef.current)
        } catch (e) {
          // Already removed, ignore
        }
      }
      downloadLinkRef.current = null
    }
  }, [operationType])

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose()
        }
      }}
    >
      <div 
        className="bg-slate-800 rounded-xl shadow-2xl max-w-md w-full border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">{getOperationTitle()}</h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300">{getOperationDescription()}</p>

          {/* Excel Export Results */}
          {operationType === 'export-excel' && excelReports.length > 0 && success && (
            <div className="space-y-3">
              <div className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-3">
                <p className="text-sm font-medium text-emerald-300">
                  ✓ Successfully downloaded {excelReports.length} Excel report(s) as ZIP file
                </p>
                <p className="text-xs text-emerald-400 mt-1">
                  Files downloaded from Cloudinary and packaged into a ZIP archive
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                <p className="text-xs text-slate-400 font-medium">Included files:</p>
                {excelReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center gap-2 p-2 bg-slate-700/30 border border-slate-600 rounded text-xs"
                  >
                    <FileSpreadsheet className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-slate-300 truncate">
                      {report.reportNumber || report.id} - {report.clientName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operation-specific controls */}
          {operationType === 'duplicate' && (
            <div className="space-y-2">
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">Append text:</span>
                <input
                  type="text"
                  value={appendText}
                  onChange={e => setAppendText(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  placeholder="(Copy)"
                />
              </label>
            </div>
          )}

          {operationType === 'status-update' && (
            <div className="space-y-2">
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">New status:</span>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50 cursor-pointer"
                >
                  {STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {operationType === 'delete' && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
              <p className="text-xs text-red-300">
                ⚠️ This action cannot be undone. All data will be permanently deleted.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-300 mb-2">Unable to Export Excel Reports</p>
                <p className="text-xs text-red-300 whitespace-pre-line leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <p className="text-xs text-green-300">Operation completed successfully!</p>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              <span className="text-sm text-slate-400">Processing...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex gap-3 p-5 border-t border-slate-700">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/50 text-slate-200 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            {operationType !== 'export-excel' && (
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-semibold flex items-center justify-center gap-2 ${
                  operationType === 'delete'
                    ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white'
                    : operationType === 'duplicate'
                    ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/50 text-white'
                    : 'bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white'
                } disabled:opacity-50`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    {operationType === 'delete' && <Trash2 className="w-4 h-4" />}
                    {operationType === 'duplicate' && <Copy className="w-4 h-4" />}
                    {operationType === 'status-update' && <FileCheck className="w-4 h-4" />}
                    <span>Confirm</span>
                  </>
                )}
              </button>
            )}
            {operationType === 'export-excel' && !success && (
              <button
                onClick={handleExportExcel}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white rounded-lg transition-colors text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Downloading & Creating ZIP...</span>
                  </>
                ) : (
                  <>
                    <Table className="w-4 h-4" />
                    <span>Download Excel ZIP</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Success Footer */}
        {success && (
          <div className="p-5 border-t border-slate-700">
            <button
              onClick={() => { onRefresh(); onClose() }}
              className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-semibold flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Done</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
