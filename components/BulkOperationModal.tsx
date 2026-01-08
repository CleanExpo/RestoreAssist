'use client'

import { useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
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
        return 'Update Report Status'
      case 'delete':
        return 'Delete Reports'
      default:
        return 'Bulk Operation'
    }
  }

  const getOperationDescription = () => {
    switch (operationType) {
      case 'duplicate':
        return `You are about to duplicate ${selectedCount} report(s). Each report will be copied with a new ID and can be edited independently.`
      case 'status-update':
        return `You are about to update the status of ${selectedCount} report(s) to "${STATUS_OPTIONS.find(s => s.value === selectedStatus)?.label}".`
      case 'delete':
        return `You are about to permanently delete ${selectedCount} report(s). This action cannot be undone.`
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
        body: JSON.stringify({
          ids: selectedIds,
          options: {
            appendText,
          },
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Duplication failed')
      }

      setSuccess(true)
      toast.success(`Successfully duplicated ${data.duplicated} report(s)`, {
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#10b981',
          border: '1px solid #059669',
        },
      })

      // Refresh reports list after a delay
      setTimeout(() => {
        onRefresh()
        onClose()
      }, 1500)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      toast.error(errorMsg, {
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#f87171',
          border: '1px solid #dc2626',
        },
      })
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
        body: JSON.stringify({
          ids: selectedIds,
          status: selectedStatus,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Status update failed')
      }

      setSuccess(true)
      toast.success(`Successfully updated ${data.updated} report(s)`, {
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#10b981',
          border: '1px solid #059669',
        },
      })

      // Refresh reports list after a delay
      setTimeout(() => {
        onRefresh()
        onClose()
      }, 1500)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      toast.error(errorMsg, {
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#f87171',
          border: '1px solid #dc2626',
        },
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    // TODO: Implement delete endpoint
    setError('Delete functionality coming soon')
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">{getOperationTitle()}</h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-300 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Description */}
          <p className="text-sm text-slate-300">{getOperationDescription()}</p>

          {/* Operation-specific controls */}
          {operationType === 'duplicate' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-300 mb-2 block">
                  Append to report name:
                </span>
                <input
                  type="text"
                  value={appendText}
                  onChange={e => setAppendText(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  placeholder="(Copy)"
                />
              </label>
              <p className="text-xs text-slate-400">
                Example: Report WD-001 will become "WD-001 (Copy)"
              </p>
            </div>
          )}

          {operationType === 'status-update' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-300 mb-2 block">
                  New Status:
                </span>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
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
              <p className="text-sm text-red-300">
                <strong>Warning:</strong> This action cannot be undone. All selected reports will
                be permanently deleted along with their associated data.
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-300">Operation completed successfully!</p>
            </div>
          )}

          {/* Progress indicator for long operations */}
          {isLoading && selectedCount > 10 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Processing {selectedCount} reports...</span>
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full animate-pulse"
                  style={{ width: '50%' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex gap-3 p-6 border-t border-slate-700">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/50 text-slate-100 rounded-lg transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2 ${
                operationType === 'delete'
                  ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-600/50'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50'
              } text-white disabled:opacity-50`}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {operationType === 'delete' ? 'Delete' : 'Confirm'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
