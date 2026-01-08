'use client'

import { useState } from 'react'
import {
  Download,
  Copy,
  CheckSquare,
  Trash2,
  ChevronDown,
  Loader2,
  FileText,
  Archive,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { BulkOperationModal } from './BulkOperationModal'

interface BulkActionsToolbarProps {
  selectedCount: number
  totalCount: number
  onSelectedIdsChange: (ids: string[]) => void
  selectedIds: string[]
  onRefresh: () => void
}

type OperationType = 'export-excel' | 'export-zip' | 'duplicate' | 'status-update' | 'delete' | null

export function BulkActionsToolbar({
  selectedCount,
  totalCount,
  onSelectedIdsChange,
  selectedIds,
  onRefresh,
}: BulkActionsToolbarProps) {
  const [operationType, setOperationType] = useState<OperationType>(null)
  const [isLoading, setIsLoading] = useState(false)

  if (selectedCount === 0) {
    return null
  }

  const handleExportExcel = async () => {
    setOperationType('export-excel')
    setIsLoading(true)

    try {
      const response = await fetch('/api/reports/bulk-export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          options: {
            includeScope: true,
            includeEstimate: true,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Export failed')
      }

      // Download file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RestoreAssist_Export_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(`Exported ${selectedCount} report(s) to Excel`, {
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#10b981',
          border: '1px solid #059669',
        },
      })

      setOperationType(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Export failed',
        {
          duration: 4000,
          style: {
            background: '#1e293b',
            color: '#f87171',
            border: '1px solid #dc2626',
          },
        }
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportZip = async () => {
    if (selectedCount > 25) {
      toast.error('Maximum 25 reports can be exported to ZIP at a time', {
        duration: 4000,
      })
      return
    }

    setOperationType('export-zip')
    setIsLoading(true)

    try {
      const response = await fetch('/api/reports/bulk-export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          pdfType: 'enhanced',
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Export failed')
      }

      // Download file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RestoreAssist_PDFs_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(`Exported ${selectedCount} PDF(s) to ZIP`, {
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#10b981',
          border: '1px solid #059669',
        },
      })

      setOperationType(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Export failed',
        {
          duration: 4000,
          style: {
            background: '#1e293b',
            color: '#f87171',
            border: '1px solid #dc2626',
          },
        }
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleDuplicate = () => {
    if (selectedCount > 50) {
      toast.error('Maximum 50 reports can be duplicated at a time', {
        duration: 4000,
      })
      return
    }

    setOperationType('duplicate')
  }

  const handleStatusUpdate = () => {
    setOperationType('status-update')
  }

  const handleDelete = () => {
    setOperationType('delete')
  }

  return (
    <>
      <div className="sticky bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-slate-900 to-slate-800 border-t border-slate-700 p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Selection info */}
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-medium text-slate-200">
              {selectedCount} of {totalCount} reports selected
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export Excel */}
            <button
              onClick={handleExportExcel}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {isLoading && operationType === 'export-excel' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Export Excel
            </button>

            {/* Export ZIP */}
            <button
              onClick={handleExportZip}
              disabled={isLoading || selectedCount > 25}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors text-sm font-medium"
              title={selectedCount > 25 ? 'Maximum 25 reports for ZIP export' : ''}
            >
              {isLoading && operationType === 'export-zip' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              Export PDFs
            </button>

            {/* Duplicate */}
            <button
              onClick={handleDuplicate}
              disabled={isLoading || selectedCount > 50}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/50 text-white rounded-lg transition-colors text-sm font-medium"
              title={selectedCount > 50 ? 'Maximum 50 reports for duplication' : ''}
            >
              {isLoading && operationType === 'duplicate' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Duplicate
            </button>

            {/* Status Update */}
            <button
              onClick={handleStatusUpdate}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {isLoading && operationType === 'status-update' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckSquare className="w-4 h-4" />
              )}
              Update Status
            </button>

            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {isLoading && operationType === 'delete' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Modal for operation confirmation */}
      {operationType && (
        <BulkOperationModal
          operationType={operationType}
          selectedCount={selectedCount}
          selectedIds={selectedIds}
          onClose={() => setOperationType(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  )
}
