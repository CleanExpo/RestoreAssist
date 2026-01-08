'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, Copy, FileCheck, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface BulkOperationModalProps {
  operationType: 'export-excel' | 'export-zip' | 'duplicate' | 'status-update' | 'delete'
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

  const getOperationTitle = () => {
    switch (operationType) {
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

  const handleConfirm = async () => {
    switch (operationType) {
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
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
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
