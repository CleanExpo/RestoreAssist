'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { MapPin, Plus, Trash2, X, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ServiceArea {
  id: string
  postcode: string
  suburb: string | null
  state: string
  radius: number | null
  isActive: boolean
  priority: number
  createdAt: string
  updatedAt: string
}

const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'] as const

const STATE_LABELS: Record<string, string> = {
  ACT: 'Australian Capital Territory',
  NSW: 'New South Wales',
  NT: 'Northern Territory',
  QLD: 'Queensland',
  SA: 'South Australia',
  TAS: 'Tasmania',
  VIC: 'Victoria',
  WA: 'Western Australia',
}

// priority is Int: 0 = low, 1 = medium, 2 = high
function priorityLabel(priority: number): string {
  if (priority >= 2) return 'HIGH'
  if (priority === 1) return 'MEDIUM'
  return 'LOW'
}

function priorityBadgeVariant(priority: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (priority >= 2) return 'default'
  if (priority === 1) return 'secondary'
  return 'outline'
}

function priorityValue(label: string): number {
  if (label === 'HIGH') return 2
  if (label === 'MEDIUM') return 1
  return 0
}

export default function ServiceAreasPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Add form state
  const [formSuburb, setFormSuburb] = useState('')
  const [formPostcode, setFormPostcode] = useState('')
  const [formState, setFormState] = useState('')
  const [formIsActive, setFormIsActive] = useState(true)
  const [formPriority, setFormPriority] = useState('LOW')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSaving, setFormSaving] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchServiceAreas()
    }
  }, [status])

  async function fetchServiceAreas() {
    setLoading(true)
    try {
      const res = await fetch('/api/contractors/service-areas')
      if (res.ok) {
        const data = await res.json()
        setServiceAreas(data.serviceAreas ?? [])
      }
    } catch (err) {
      console.error('Failed to fetch service areas:', err)
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive(area: ServiceArea) {
    setSavingId(area.id)
    try {
      const res = await fetch(`/api/contractors/service-areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !area.isActive }),
      })
      if (res.ok) {
        const data = await res.json()
        setServiceAreas(prev =>
          prev.map(a => (a.id === area.id ? { ...a, isActive: data.serviceArea.isActive } : a))
        )
      }
    } catch (err) {
      console.error('Failed to update service area:', err)
    } finally {
      setSavingId(null)
    }
  }

  async function deleteArea(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/contractors/service-areas/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setServiceAreas(prev => prev.filter(a => a.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete service area:', err)
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  function resetForm() {
    setFormSuburb('')
    setFormPostcode('')
    setFormState('')
    setFormIsActive(true)
    setFormPriority('LOW')
    setFormError(null)
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!formPostcode.trim() || !formState) {
      setFormError('Postcode and state are required.')
      return
    }
    if (!/^\d{4}$/.test(formPostcode.trim())) {
      setFormError('Postcode must be exactly 4 digits.')
      return
    }

    setFormSaving(true)
    try {
      const res = await fetch('/api/contractors/service-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suburb: formSuburb.trim() || undefined,
          postcode: formPostcode.trim(),
          state: formState,
          isActive: formIsActive,
          priority: priorityValue(formPriority),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setServiceAreas(prev => [...prev, data.serviceArea])
        resetForm()
        setShowAddForm(false)
      } else {
        const data = await res.json()
        setFormError(data.error ?? 'Failed to add service area.')
      }
    } catch (err) {
      setFormError('An unexpected error occurred.')
    } finally {
      setFormSaving(false)
    }
  }

  // Group by state, sorted by state label
  const grouped = serviceAreas.reduce<Record<string, ServiceArea[]>>((acc, area) => {
    if (!acc[area.state]) acc[area.state] = []
    acc[area.state].push(area)
    return acc
  }, {})

  const sortedStates = Object.keys(grouped).sort()

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>

        {/* Group skeletons */}
        {[0, 1, 2].map(g => (
          <div key={g} className="mb-8">
            <Skeleton className="h-5 w-48 mb-3" />
            <Separator className="mb-4" />
            <div className="space-y-3">
              {[0, 1, 2].map(r => (
                <div
                  key={r}
                  className="flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-10 rounded-full" />
                    <Skeleton className="h-8 w-8 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white">Service Areas</h1>
          </div>
          <Badge variant="secondary" className="text-sm">
            {serviceAreas.length}
          </Badge>
        </div>
        {!showAddForm && (
          <Button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            <Plus className="h-4 w-4" />
            Add Service Area
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="mb-8 p-6 bg-slate-800/30 border border-slate-700 rounded-lg">
          <h2 className="text-lg font-semibold text-white mb-5">New Service Area</h2>
          <form onSubmit={handleAddSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label htmlFor="suburb" className="text-slate-300">
                  Suburb
                </Label>
                <Input
                  id="suburb"
                  value={formSuburb}
                  onChange={e => setFormSuburb(e.target.value)}
                  placeholder="e.g. Fortitude Valley"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="postcode" className="text-slate-300">
                  Postcode <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="postcode"
                  value={formPostcode}
                  onChange={e => setFormPostcode(e.target.value)}
                  placeholder="e.g. 4006"
                  maxLength={4}
                  className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="state" className="text-slate-300">
                  State <span className="text-red-400">*</span>
                </Label>
                <Select value={formState} onValueChange={setFormState}>
                  <SelectTrigger
                    id="state"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  >
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {AU_STATES.map(s => (
                      <SelectItem key={s} value={s} className="text-white hover:bg-slate-700">
                        {s} — {STATE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="priority" className="text-slate-300">
                  Priority
                </Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger
                    id="priority"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="HIGH" className="text-white hover:bg-slate-700">HIGH</SelectItem>
                    <SelectItem value="MEDIUM" className="text-white hover:bg-slate-700">MEDIUM</SelectItem>
                    <SelectItem value="LOW" className="text-white hover:bg-slate-700">LOW</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-5">
              <Switch
                id="isActive"
                checked={formIsActive}
                onCheckedChange={setFormIsActive}
              />
              <Label htmlFor="isActive" className="text-slate-300 cursor-pointer">
                Active
              </Label>
            </div>

            {formError && (
              <p className="text-sm text-red-400 mb-4">{formError}</p>
            )}

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={formSaving}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {formSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm()
                  setShowAddForm(false)
                }}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Empty state */}
      {serviceAreas.length === 0 && !showAddForm && (
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-12 text-center">
          <MapPin className="h-10 w-10 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400 text-base">
            No service areas configured. Add the postcodes and suburbs you cover.
          </p>
          <Button
            onClick={() => setShowAddForm(true)}
            className="mt-5 bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Service Area
          </Button>
        </div>
      )}

      {/* Grouped list */}
      {sortedStates.length > 0 && (
        <div className="space-y-8">
          {sortedStates.map(state => {
            const areas = grouped[state]
            return (
              <div key={state}>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {STATE_LABELS[state] ?? state}{' '}
                  <span className="text-slate-500 normal-case tracking-normal font-normal">
                    ({areas.length})
                  </span>
                </h2>
                <Separator className="mb-4 bg-slate-700" />

                <div className="space-y-2">
                  {areas.map(area => (
                    <div
                      key={area.id}
                      className="flex items-center justify-between px-4 py-3 bg-slate-800/30 border border-slate-700 rounded-lg"
                    >
                      {/* Left: suburb + postcode + priority badge */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-white font-medium truncate">
                          {area.suburb ? `${area.suburb}, ` : ''}
                          {area.state} {area.postcode}
                        </span>
                        <Badge variant={priorityBadgeVariant(area.priority)} className="shrink-0 text-xs">
                          {priorityLabel(area.priority)}
                        </Badge>
                      </div>

                      {/* Right: active toggle + delete */}
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={area.isActive}
                            disabled={savingId === area.id}
                            onCheckedChange={() => toggleActive(area)}
                            aria-label={`Toggle active for ${area.suburb ?? area.postcode}`}
                          />
                          <span className="text-xs text-slate-400 w-14">
                            {area.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        {/* Delete with inline confirm */}
                        {confirmDeleteId === area.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-400 mr-1">Remove?</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deletingId === area.id}
                              onClick={() => deleteArea(area.id)}
                              className="h-7 px-2 text-xs"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Yes
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmDeleteId(null)}
                              className="h-7 px-2 text-xs border-slate-600 text-slate-300 hover:bg-slate-700"
                            >
                              <X className="h-3 w-3 mr-1" />
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(area.id)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                            aria-label={`Delete ${area.suburb ?? area.postcode}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
