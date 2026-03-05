'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  GraduationCap,
  Plus,
  Trash2,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Filter,
  X,
  BookOpen
} from 'lucide-react'

interface CecRecord {
  id: string
  courseName: string
  provider: string
  cecPoints: number
  completedAt: string
  certificateUrl: string | null
  expiresAt: string | null
  createdAt: string
}

// IICRC requires 14 CEC points per 4-year renewal cycle
const IICRC_REQUIRED_POINTS = 14
const IICRC_CYCLE_YEARS = 4

const PROVIDERS = ['IICRC', 'CARSI', 'Other'] as const

export function CecTracker() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [records, setRecords] = useState<CecRecord[]>([])
  const [totalPoints, setTotalPoints] = useState(0)
  const [pointsByProvider, setPointsByProvider] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filterProvider, setFilterProvider] = useState<string>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form state
  const [newRecord, setNewRecord] = useState({
    courseName: '',
    provider: 'IICRC',
    cecPoints: '',
    completedAt: '',
    certificateUrl: '',
    expiresAt: ''
  })

  const fetchRecords = useCallback(async () => {
    try {
      const url = filterProvider !== 'all'
        ? `/api/contractors/cec?provider=${filterProvider}`
        : '/api/contractors/cec'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setTotalPoints(data.totalPoints || 0)
        setPointsByProvider(data.pointsByProvider || {})
      }
    } catch (error) {
      console.error('Failed to fetch CEC records:', error)
    } finally {
      setLoading(false)
    }
  }, [filterProvider])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchRecords()
    }
  }, [status, fetchRecords, router])

  const handleAdd = async () => {
    if (!newRecord.courseName || !newRecord.provider || !newRecord.cecPoints || !newRecord.completedAt) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' })
      return
    }

    try {
      const res = await fetch('/api/contractors/cec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newRecord,
          cecPoints: parseFloat(newRecord.cecPoints)
        })
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'CEC record added successfully' })
        setShowAddForm(false)
        setNewRecord({
          courseName: '',
          provider: 'IICRC',
          cecPoints: '',
          completedAt: '',
          certificateUrl: '',
          expiresAt: ''
        })
        await fetchRecords()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to add CEC record' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add CEC record' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this CEC record?')) return

    try {
      const res = await fetch(`/api/contractors/cec/${id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'CEC record deleted' })
        await fetchRecords()
      } else {
        setMessage({ type: 'error', text: 'Failed to delete CEC record' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete CEC record' })
    }
  }

  const progressPercent = Math.min((totalPoints / IICRC_REQUIRED_POINTS) * 100, 100)
  const pointsRemaining = Math.max(IICRC_REQUIRED_POINTS - totalPoints, 0)

  // Find records expiring within 6 months
  const sixMonthsFromNow = new Date()
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
  const expiringRecords = records.filter(
    (r) => r.expiresAt && new Date(r.expiresAt) <= sixMonthsFromNow && new Date(r.expiresAt) > new Date()
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading CEC records...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-cyan-400" />
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">CEC Tracker</h1>
            <p className="text-sm text-neutral-600 dark:text-slate-400">
              IICRC Continuing Education Credits &amp; CARSI Course Completions
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Log CEC
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Expiring Soon Warning */}
      {expiringRecords.length > 0 && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium mb-2">
            <AlertTriangle className="h-5 w-5" />
            Certificates Expiring Soon
          </div>
          <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
            {expiringRecords.map((r) => {
              const daysLeft = Math.ceil(
                (new Date(r.expiresAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              )
              return (
                <li key={r.id}>
                  {r.courseName} - expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Total Points */}
        <div className="bg-neutral-50 dark:bg-slate-800/30 border border-neutral-200 dark:border-slate-700 rounded-lg p-6">
          <div className="text-sm text-neutral-600 dark:text-slate-400 mb-1">Total CEC Points</div>
          <div className="text-3xl font-bold text-neutral-900 dark:text-white">{totalPoints}</div>
          <div className="text-sm text-neutral-500 dark:text-slate-500 mt-1">
            across all providers
          </div>
        </div>

        {/* IICRC Progress */}
        <div className="bg-neutral-50 dark:bg-slate-800/30 border border-neutral-200 dark:border-slate-700 rounded-lg p-6">
          <div className="text-sm text-neutral-600 dark:text-slate-400 mb-1">
            IICRC Renewal Progress
          </div>
          <div className="text-3xl font-bold text-neutral-900 dark:text-white">
            {totalPoints}/{IICRC_REQUIRED_POINTS}
          </div>
          <div className="mt-3">
            <div className="w-full bg-neutral-200 dark:bg-slate-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  progressPercent >= 100
                    ? 'bg-green-500'
                    : progressPercent >= 70
                    ? 'bg-cyan-500'
                    : progressPercent >= 40
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-sm text-neutral-500 dark:text-slate-500 mt-1">
              {pointsRemaining > 0
                ? `${pointsRemaining} points needed (${IICRC_CYCLE_YEARS}-year cycle)`
                : 'Renewal requirement met'}
            </div>
          </div>
        </div>

        {/* Points by Provider */}
        <div className="bg-neutral-50 dark:bg-slate-800/30 border border-neutral-200 dark:border-slate-700 rounded-lg p-6">
          <div className="text-sm text-neutral-600 dark:text-slate-400 mb-3">Points by Provider</div>
          <div className="space-y-2">
            {PROVIDERS.map((p) => (
              <div key={p} className="flex items-center justify-between">
                <span className="text-sm text-neutral-700 dark:text-slate-300">{p}</span>
                <span className="text-sm font-medium text-neutral-900 dark:text-white">
                  {pointsByProvider[p] || 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add CEC Form */}
      {showAddForm && (
        <div className="mb-8 p-6 bg-neutral-50 dark:bg-slate-800/30 border border-neutral-200 dark:border-slate-700 rounded-lg">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
            Log Continuing Education
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2">
                Course Name *
              </label>
              <input
                type="text"
                value={newRecord.courseName}
                onChange={(e) => setNewRecord({ ...newRecord, courseName: e.target.value })}
                placeholder="e.g. WRT - Water Damage Restoration"
                className="w-full px-4 py-2 bg-white dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2">
                Provider *
              </label>
              <select
                value={newRecord.provider}
                onChange={(e) => setNewRecord({ ...newRecord, provider: e.target.value })}
                className="w-full px-4 py-2 bg-white dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2">
                CEC Points *
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={newRecord.cecPoints}
                onChange={(e) => setNewRecord({ ...newRecord, cecPoints: e.target.value })}
                placeholder="e.g. 2"
                className="w-full px-4 py-2 bg-white dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2">
                Completion Date *
              </label>
              <input
                type="date"
                value={newRecord.completedAt}
                onChange={(e) => setNewRecord({ ...newRecord, completedAt: e.target.value })}
                className="w-full px-4 py-2 bg-white dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2">
                Certificate URL
              </label>
              <input
                type="url"
                value={newRecord.certificateUrl}
                onChange={(e) => setNewRecord({ ...newRecord, certificateUrl: e.target.value })}
                placeholder="https://..."
                className="w-full px-4 py-2 bg-white dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2">
                Expiry Date
              </label>
              <input
                type="date"
                value={newRecord.expiresAt}
                onChange={(e) => setNewRecord({ ...newRecord, expiresAt: e.target.value })}
                className="w-full px-4 py-2 bg-white dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Save Record
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-neutral-200 dark:bg-slate-600 text-neutral-800 dark:text-white rounded-lg hover:bg-neutral-300 dark:hover:bg-slate-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <Filter className="h-5 w-5 text-neutral-500 dark:text-slate-400" />
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-neutral-300 dark:border-slate-700 rounded-lg text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Providers</option>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Records Table */}
      <div className="bg-neutral-50 dark:bg-slate-800/30 border border-neutral-200 dark:border-slate-700 rounded-lg overflow-hidden">
        {records.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-12 w-12 text-neutral-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-neutral-500 dark:text-slate-400">No CEC records found</p>
            <p className="text-sm text-neutral-400 dark:text-slate-500 mt-1">
              Click &quot;Log CEC&quot; to add your first continuing education record
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-slate-700">
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                    Course
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                    Provider
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                    Points
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                    Completed
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                    Certificate
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-slate-700">
                {records.map((record) => {
                  const isExpiringSoon =
                    record.expiresAt &&
                    new Date(record.expiresAt) <= sixMonthsFromNow &&
                    new Date(record.expiresAt) > new Date()
                  const isExpired =
                    record.expiresAt && new Date(record.expiresAt) <= new Date()

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-neutral-100 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-neutral-900 dark:text-white font-medium">
                        {record.courseName}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            record.provider === 'IICRC'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                              : record.provider === 'CARSI'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                              : 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/30'
                          }`}
                        >
                          {record.provider}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-900 dark:text-white">
                        {record.cecPoints}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600 dark:text-slate-400">
                        {new Date(record.completedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {record.expiresAt ? (
                          <span
                            className={
                              isExpired
                                ? 'text-red-600 dark:text-red-400 font-medium'
                                : isExpiringSoon
                                ? 'text-amber-600 dark:text-amber-400 font-medium'
                                : 'text-neutral-600 dark:text-slate-400'
                            }
                          >
                            {new Date(record.expiresAt).toLocaleDateString()}
                            {isExpired && ' (expired)'}
                            {isExpiringSoon &&
                              ` (${Math.ceil(
                                (new Date(record.expiresAt).getTime() - Date.now()) /
                                  (1000 * 60 * 60 * 24)
                              )}d)`}
                          </span>
                        ) : (
                          <span className="text-neutral-400 dark:text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {record.certificateUrl ? (
                          <a
                            href={record.certificateUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1 text-sm"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-neutral-400 dark:text-slate-500 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="text-red-500 hover:text-red-400 transition-colors"
                          title="Delete record"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
