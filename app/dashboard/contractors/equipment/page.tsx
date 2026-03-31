'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  Wrench,
  Calendar,
  Hash,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalibrationRecord {
  id: string
  calibratedAt: string
  calibratedBy: string
  notes: string | null
  nextDueDate: string | null
  createdAt: string
}

interface Equipment {
  id: string
  name: string
  equipmentType: string | null
  serialNumber: string | null
  manufacturer: string | null
  model: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'IN_SERVICE' | 'DECOMMISSIONED'
  purchaseDate: string | null
  lastCalibrationDate: string | null
  nextCalibrationDate: string | null
  calibrationRecords?: CalibrationRecord[]
}

type CalibrationStatus = 'overdue' | 'due-soon' | 'current' | 'never'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCalibrationStatus(nextDate: string | null): CalibrationStatus {
  if (!nextDate) return 'never'
  const now = new Date()
  const due = new Date(nextDate)
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 30) return 'due-soon'
  return 'current'
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

function StatusBadge({ status }: { status: Equipment['status'] }) {
  const config = {
    ACTIVE: { label: 'Active', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
    INACTIVE: { label: 'Inactive', className: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
    IN_SERVICE: { label: 'In Service', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    DECOMMISSIONED: { label: 'Decommissioned', className: 'bg-red-500/10 text-red-400 border-red-500/30' }
  }[status]

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  )
}

function CalibrationBadge({ nextDate }: { nextDate: string | null }) {
  const cs = getCalibrationStatus(nextDate)
  if (cs === 'never') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-slate-500/10 text-slate-400 border-slate-500/30">
        <Clock className="h-3 w-3" />
        Not calibrated
      </span>
    )
  }
  if (cs === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-red-500/10 text-red-400 border-red-500/30">
        <XCircle className="h-3 w-3" />
        Overdue — due {formatDate(nextDate)}
      </span>
    )
  }
  if (cs === 'due-soon') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/30">
        <AlertTriangle className="h-3 w-3" />
        Due soon — {formatDate(nextDate)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-green-500/10 text-green-400 border-green-500/30">
      <CheckCircle className="h-3 w-3" />
      Current — due {formatDate(nextDate)}
    </span>
  )
}

// ─── Default add-equipment form values ────────────────────────────────────────

const EMPTY_EQUIPMENT_FORM = {
  name: '',
  equipmentType: '',
  serialNumber: '',
  manufacturer: '',
  model: '',
  status: 'ACTIVE' as Equipment['status'],
  purchaseDate: '',
  lastCalibrationDate: '',
  nextCalibrationDate: ''
}

const EMPTY_CALIBRATION_FORM = {
  calibratedAt: '',
  calibratedBy: '',
  notes: '',
  nextDueDate: ''
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function EquipmentPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addingEquipment, setAddingEquipment] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [calibrationHistories, setCalibrationHistories] = useState<Record<string, CalibrationRecord[]>>({})
  const [loadingHistory, setLoadingHistory] = useState<Set<string>>(new Set())

  // Log calibration form per equipment
  const [logCalibrationId, setLogCalibrationId] = useState<string | null>(null)
  const [calibrationForm, setCalibrationForm] = useState(EMPTY_CALIBRATION_FORM)
  const [loggingCalibration, setLoggingCalibration] = useState(false)

  const [equipmentForm, setEquipmentForm] = useState(EMPTY_EQUIPMENT_FORM)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchEquipment()
    }
  }, [status])

  const fetchEquipment = async () => {
    try {
      const res = await fetch('/api/contractors/equipment')
      if (res.ok) {
        const data = await res.json()
        setEquipment(data.equipment ?? [])
      }
    } catch (err) {
      console.error('Failed to fetch equipment:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCalibrationHistory = async (id: string) => {
    if (calibrationHistories[id]) return // already loaded
    setLoadingHistory(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/contractors/equipment/${id}/calibrations`)
      if (res.ok) {
        const data = await res.json()
        setCalibrationHistories(prev => ({ ...prev, [id]: data.calibrations ?? [] }))
      }
    } catch (err) {
      console.error('Failed to fetch calibration history:', err)
    } finally {
      setLoadingHistory(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        fetchCalibrationHistory(id)
      }
      return next
    })
  }

  const handleAddEquipment = async () => {
    if (!equipmentForm.name) {
      setMessage({ type: 'error', text: 'Equipment name is required' })
      return
    }

    setAddingEquipment(true)
    setMessage(null)

    try {
      const res = await fetch('/api/contractors/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...equipmentForm,
          purchaseDate: equipmentForm.purchaseDate || null,
          lastCalibrationDate: equipmentForm.lastCalibrationDate || null,
          nextCalibrationDate: equipmentForm.nextCalibrationDate || null
        })
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Equipment added successfully' })
        setShowAddForm(false)
        setEquipmentForm(EMPTY_EQUIPMENT_FORM)
        await fetchEquipment()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error ?? 'Failed to add equipment' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to add equipment' })
    } finally {
      setAddingEquipment(false)
    }
  }

  const handleLogCalibration = async (equipmentId: string) => {
    if (!calibrationForm.calibratedAt || !calibrationForm.calibratedBy) {
      setMessage({ type: 'error', text: 'Calibration date and technician name are required' })
      return
    }

    setLoggingCalibration(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/contractors/equipment/${equipmentId}/calibrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calibratedAt: calibrationForm.calibratedAt,
          calibratedBy: calibrationForm.calibratedBy,
          notes: calibrationForm.notes || null,
          nextDueDate: calibrationForm.nextDueDate || null
        })
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Calibration logged successfully' })
        setLogCalibrationId(null)
        setCalibrationForm(EMPTY_CALIBRATION_FORM)
        // Refresh equipment list and clear cached history so it reloads
        setCalibrationHistories(prev => {
          const next = { ...prev }
          delete next[equipmentId]
          return next
        })
        await fetchEquipment()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error ?? 'Failed to log calibration' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to log calibration' })
    } finally {
      setLoggingCalibration(false)
    }
  }

  // Items needing attention (overdue or due soon)
  const attentionItems = equipment.filter(e => {
    const cs = getCalibrationStatus(e.nextCalibrationDate ?? null)
    return cs === 'overdue' || cs === 'due-soon'
  })

  // ─── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <Skeleton className="h-9 w-48 bg-slate-700" />
          <Skeleton className="h-10 w-36 bg-slate-700" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="bg-slate-800/30 border-slate-700">
              <CardHeader>
                <Skeleton className="h-6 w-40 bg-slate-700" />
                <Skeleton className="h-4 w-24 bg-slate-700 mt-1" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full bg-slate-700" />
                <Skeleton className="h-4 w-3/4 bg-slate-700" />
                <Skeleton className="h-8 w-32 bg-slate-700" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* Calibration Due Banner */}
      {attentionItems.length > 0 && (
        <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${
          attentionItems.some(e => getCalibrationStatus(e.nextCalibrationDate ?? null) === 'overdue')
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        }`}>
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">
              {attentionItems.length} item{attentionItems.length !== 1 ? 's' : ''} have calibration due or overdue
            </div>
            <ul className="mt-1 text-sm space-y-0.5">
              {attentionItems.map(e => (
                <li key={e.id}>
                  <span className="font-medium">{e.name}</span>
                  {e.nextCalibrationDate && (
                    <span className="opacity-75"> — due {formatDate(e.nextCalibrationDate)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 border ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-white">Equipment</h1>
          {equipment.length > 0 && (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-700 text-slate-300 text-sm font-semibold">
              {equipment.length}
            </span>
          )}
        </div>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-cyan-500 hover:bg-cyan-600 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Equipment
        </Button>
      </div>

      {/* Add Equipment Form */}
      {showAddForm && (
        <Card className="bg-slate-800/30 border-slate-700 mb-8">
          <CardHeader>
            <CardTitle className="text-white text-lg">New Equipment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div className="space-y-1">
                <Label className="text-slate-300">Name *</Label>
                <Input
                  value={equipmentForm.name}
                  onChange={e => setEquipmentForm({ ...equipmentForm, name: e.target.value })}
                  placeholder="e.g. Protimeter MMS3"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Type / Category</Label>
                <Input
                  value={equipmentForm.equipmentType}
                  onChange={e => setEquipmentForm({ ...equipmentForm, equipmentType: e.target.value })}
                  placeholder="e.g. Moisture Meter"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Serial Number</Label>
                <Input
                  value={equipmentForm.serialNumber}
                  onChange={e => setEquipmentForm({ ...equipmentForm, serialNumber: e.target.value })}
                  placeholder="e.g. SN-12345678"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Manufacturer</Label>
                <Input
                  value={equipmentForm.manufacturer}
                  onChange={e => setEquipmentForm({ ...equipmentForm, manufacturer: e.target.value })}
                  placeholder="e.g. Protimeter"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Model</Label>
                <Input
                  value={equipmentForm.model}
                  onChange={e => setEquipmentForm({ ...equipmentForm, model: e.target.value })}
                  placeholder="e.g. MMS3"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Status</Label>
                <Select
                  value={equipmentForm.status}
                  onValueChange={v => setEquipmentForm({ ...equipmentForm, status: v as Equipment['status'] })}
                >
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="ACTIVE" className="text-white hover:bg-slate-700">Active</SelectItem>
                    <SelectItem value="INACTIVE" className="text-white hover:bg-slate-700">Inactive</SelectItem>
                    <SelectItem value="IN_SERVICE" className="text-white hover:bg-slate-700">In Service</SelectItem>
                    <SelectItem value="DECOMMISSIONED" className="text-white hover:bg-slate-700">Decommissioned</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Purchase Date</Label>
                <Input
                  type="date"
                  value={equipmentForm.purchaseDate}
                  onChange={e => setEquipmentForm({ ...equipmentForm, purchaseDate: e.target.value })}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Last Calibration Date</Label>
                <Input
                  type="date"
                  value={equipmentForm.lastCalibrationDate}
                  onChange={e => setEquipmentForm({ ...equipmentForm, lastCalibrationDate: e.target.value })}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Next Calibration Due</Label>
                <Input
                  type="date"
                  value={equipmentForm.nextCalibrationDate}
                  onChange={e => setEquipmentForm({ ...equipmentForm, nextCalibrationDate: e.target.value })}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleAddEquipment}
                disabled={addingEquipment}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {addingEquipment ? 'Saving...' : 'Save Equipment'}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowAddForm(false); setEquipmentForm(EMPTY_EQUIPMENT_FORM) }}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {equipment.length === 0 && (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Wrench className="h-12 w-12 text-slate-500 mb-4" />
            <p className="text-slate-400 max-w-md">
              No equipment registered. Add your moisture meters, thermal cameras, and other equipment.
            </p>
            <Button
              onClick={() => setShowAddForm(true)}
              className="mt-6 bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Equipment
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Equipment Cards Grid */}
      {equipment.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipment.map(item => {
            const isExpanded = expandedIds.has(item.id)
            const isLoggingThisItem = logCalibrationId === item.id
            const history = calibrationHistories[item.id] ?? []
            const isLoadingThisHistory = loadingHistory.has(item.id)

            return (
              <Card key={item.id} className="bg-slate-800/30 border-slate-700 flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-white text-base font-semibold leading-tight truncate">
                        {item.name}
                      </CardTitle>
                      {item.equipmentType && (
                        <p className="text-sm text-slate-400 mt-0.5">{item.equipmentType}</p>
                      )}
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col gap-3 pt-0">
                  {/* Identifiers */}
                  <div className="space-y-1">
                    {item.serialNumber && (
                      <div className="flex items-center gap-2 text-sm">
                        <Hash className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span className="font-mono text-slate-300 text-xs">{item.serialNumber}</span>
                      </div>
                    )}
                    {(item.manufacturer || item.model) && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Wrench className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span>
                          {[item.manufacturer, item.model].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                    {item.purchaseDate && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Calendar className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span>Purchased {formatDate(item.purchaseDate)}</span>
                      </div>
                    )}
                  </div>

                  <Separator className="bg-slate-700" />

                  {/* Calibration status */}
                  <div className="space-y-1.5">
                    <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Calibration</div>
                    <CalibrationBadge nextDate={item.nextCalibrationDate ?? null} />
                    {item.lastCalibrationDate && (
                      <div className="text-xs text-slate-400">
                        Last calibrated: {formatDate(item.lastCalibrationDate)}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (isLoggingThisItem) {
                          setLogCalibrationId(null)
                          setCalibrationForm(EMPTY_CALIBRATION_FORM)
                        } else {
                          setLogCalibrationId(item.id)
                          setCalibrationForm(EMPTY_CALIBRATION_FORM)
                        }
                      }}
                      className="flex-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      variant="outline"
                    >
                      {isLoggingThisItem ? 'Cancel' : 'Log Calibration'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleExpand(item.id)}
                      className="border-slate-600 text-slate-400 hover:bg-slate-700"
                      aria-label={isExpanded ? 'Collapse history' : 'Expand history'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* Log Calibration Form */}
                  {isLoggingThisItem && (
                    <div className="mt-2 p-3 bg-slate-700/30 border border-slate-600 rounded-lg space-y-3">
                      <div className="text-sm font-medium text-slate-300">Log New Calibration</div>

                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">Calibration Date *</Label>
                        <Input
                          type="date"
                          value={calibrationForm.calibratedAt}
                          onChange={e => setCalibrationForm({ ...calibrationForm, calibratedAt: e.target.value })}
                          className="bg-slate-800/50 border-slate-600 text-white text-sm h-8"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">Calibrated By *</Label>
                        <Input
                          value={calibrationForm.calibratedBy}
                          onChange={e => setCalibrationForm({ ...calibrationForm, calibratedBy: e.target.value })}
                          placeholder="Technician name or lab"
                          className="bg-slate-800/50 border-slate-600 text-white text-sm h-8 placeholder:text-slate-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">Notes</Label>
                        <Input
                          value={calibrationForm.notes}
                          onChange={e => setCalibrationForm({ ...calibrationForm, notes: e.target.value })}
                          placeholder="Certificate ref, results..."
                          className="bg-slate-800/50 border-slate-600 text-white text-sm h-8 placeholder:text-slate-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">Next Due Date</Label>
                        <Input
                          type="date"
                          value={calibrationForm.nextDueDate}
                          onChange={e => setCalibrationForm({ ...calibrationForm, nextDueDate: e.target.value })}
                          className="bg-slate-800/50 border-slate-600 text-white text-sm h-8"
                        />
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleLogCalibration(item.id)}
                        disabled={loggingCalibration}
                        className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
                      >
                        {loggingCalibration ? 'Saving...' : 'Save Calibration'}
                      </Button>
                    </div>
                  )}

                  {/* Calibration History */}
                  {isExpanded && (
                    <div className="mt-2">
                      <Separator className="bg-slate-700 mb-3" />
                      <div className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">
                        Calibration History
                      </div>

                      {isLoadingThisHistory ? (
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-full bg-slate-700" />
                          <Skeleton className="h-4 w-3/4 bg-slate-700" />
                        </div>
                      ) : history.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No calibration records yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-700">
                                <th className="text-left pb-1.5 font-medium">Date</th>
                                <th className="text-left pb-1.5 font-medium">By</th>
                                <th className="text-left pb-1.5 font-medium">Next Due</th>
                                <th className="text-left pb-1.5 font-medium">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                              {history.map(record => (
                                <tr key={record.id} className="text-slate-300">
                                  <td className="py-1.5 pr-2 whitespace-nowrap">
                                    {formatDate(record.calibratedAt)}
                                  </td>
                                  <td className="py-1.5 pr-2 whitespace-nowrap">
                                    {record.calibratedBy}
                                  </td>
                                  <td className="py-1.5 pr-2 whitespace-nowrap">
                                    {record.nextDueDate ? formatDate(record.nextDueDate) : '—'}
                                  </td>
                                  <td className="py-1.5 text-slate-400 truncate max-w-[100px]">
                                    {record.notes ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
