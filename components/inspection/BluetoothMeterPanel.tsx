'use client'

/**
 * BluetoothMeterPanel
 *
 * Connects P1 BLE field meters (per nir-field-reality-spec.ts) to the
 * inspection data entry flow. Two modes:
 *
 *   mode="moisture"     — pin and non-invasive moisture meters
 *                         (Tramex MEP, Delmhorst BD-2100, Tramex CMEXv5)
 *                         → POSTs to /api/inspections/[id]/moisture
 *
 *   mode="environmental" — thermo-hygrometers
 *                          (Testo 605-H1, Vaisala HM70)
 *                          → POSTs to /api/inspections/[id]/environmental
 *
 * Degrades gracefully on iOS Safari and non-HTTPS environments where
 * Web Bluetooth is unavailable.
 *
 * IMPORTANT: pairDevice() MUST be called inside a direct onClick handler
 * to satisfy the browser's user-gesture requirement for Web Bluetooth.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bluetooth, BluetoothSearching, BluetoothConnected, BluetoothOff, Zap, Check, X, Loader2, Thermometer, Droplets } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  checkBluetoothAvailability,
  pairDevice,
  subscribeToReadings,
  getP1DeviceProfiles,
  type BluetoothAvailability,
  type DeviceKey,
  type DeviceCategory,
  type PairedDevice,
  type MoistureReading,
  type EnvironmentalReading,
  type DeviceReading,
} from '@/lib/nir-bluetooth-service'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MOISTURE_CATEGORIES: DeviceCategory[] = ['pin-moisture-meter', 'non-invasive-moisture-meter']
const ENVIRONMENTAL_CATEGORIES: DeviceCategory[] = ['thermo-hygrometer']

const SURFACE_TYPE_OPTIONS = [
  { value: 'wood', label: 'Timber / Wood' },
  { value: 'drywall', label: 'Plasterboard / Drywall' },
  { value: 'concrete', label: 'Concrete / Masonry' },
  { value: 'carpet', label: 'Carpet' },
  { value: 'vinyl', label: 'Vinyl / LVP' },
  { value: 'tile', label: 'Tile / Grout' },
  { value: 'insulation', label: 'Insulation / Batts' },
  { value: 'generic', label: 'Other / Unknown' },
]

const MOISTURE_LEVEL_COLOR = (pct: number) =>
  pct < 15 ? 'text-emerald-400' :
  pct < 25 ? 'text-amber-400' :
  pct < 40 ? 'text-orange-400' :
             'text-red-400'

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface BluetoothMeterPanelProps {
  inspectionId: string
  roomId?: string
  /** moisture = moisture meters only | environmental = thermo-hygrometers only */
  mode: 'moisture' | 'environmental'
  /** Called after a reading is successfully saved to the API */
  onReadingAccepted?: () => void
  className?: string
}

interface ConnectedDevice {
  paired: PairedDevice
  lastReading: DeviceReading | null
  unsubscribe: (() => void) | null
  isConnecting: boolean
}

// ─── AVAILABILITY BANNER ──────────────────────────────────────────────────────

function AvailabilityBanner({ availability }: { availability: BluetoothAvailability }) {
  if (availability === 'available') return null

  const messages: Record<Exclude<BluetoothAvailability, 'available'>, { title: string; body: string }> = {
    'unavailable-ios-safari': {
      title: 'Bluetooth not supported on iOS Safari',
      body: 'Web Bluetooth requires Chrome on Android or a Chromium-based browser on desktop. Use manual entry on iPhone/iPad.',
    },
    'unavailable-not-https': {
      title: 'HTTPS required for Bluetooth',
      body: 'Web Bluetooth only works on secure connections. Open the app over HTTPS to use BLE meters.',
    },
    'unavailable-no-api': {
      title: 'Bluetooth not available in this browser',
      body: 'Use Google Chrome or Microsoft Edge on a desktop or Android device to connect BLE meters.',
    },
  }

  const msg = messages[availability]
  return (
    <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <BluetoothOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
      <div>
        <p className="text-sm font-medium text-amber-300">{msg.title}</p>
        <p className="mt-0.5 text-xs text-amber-400/80">{msg.body}</p>
      </div>
    </div>
  )
}

// ─── LIVE MOISTURE READING DISPLAY ────────────────────────────────────────────

function MoistureReadingDisplay({ reading }: { reading: MoistureReading }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-800 px-4 py-3">
      <Droplets className="h-5 w-5 text-cyan-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className={cn('text-2xl font-bold tabular-nums', MOISTURE_LEVEL_COLOR(reading.moistureContentPercent))}>
          {reading.moistureContentPercent.toFixed(1)}%
        </span>
        {reading.materialType && (
          <span className="ml-2 text-xs text-slate-400">({reading.materialType})</span>
        )}
      </div>
      <span className="text-xs text-slate-500">
        {new Date(reading.readingTimestamp).toLocaleTimeString('en-AU')}
      </span>
    </div>
  )
}

// ─── LIVE ENVIRONMENTAL READING DISPLAY ───────────────────────────────────────

function EnvironmentalReadingDisplay({ reading }: { reading: EnvironmentalReading }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'RH', value: `${reading.relativeHumidityPercent.toFixed(1)}%`, icon: Droplets, color: 'text-cyan-400' },
        { label: 'Temp', value: `${reading.temperatureCelsius.toFixed(1)}°C`, icon: Thermometer, color: 'text-orange-400' },
        { label: 'Dew', value: `${reading.dewPointCelsius.toFixed(1)}°C`, icon: Thermometer, color: 'text-blue-400' },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="flex flex-col items-center rounded-lg bg-slate-800 px-2 py-3">
          <Icon className={cn('h-4 w-4 mb-1', color)} />
          <span className={cn('text-lg font-bold tabular-nums', color)}>{value}</span>
          <span className="text-xs text-slate-500">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── ACCEPT MOISTURE MODAL ────────────────────────────────────────────────────

interface AcceptMoistureFormProps {
  reading: MoistureReading
  inspectionId: string
  roomId?: string
  onAccepted: () => void
  onCancel: () => void
}

function AcceptMoistureForm({ reading, inspectionId, roomId, onAccepted, onCancel }: AcceptMoistureFormProps) {
  const [location, setLocation] = useState('')
  const [surfaceType, setSurfaceType] = useState(reading.materialType ?? 'generic')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!location.trim()) { setError('Location is required'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/moisture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: location.trim(),
          surfaceType,
          moistureLevel: reading.moistureContentPercent,
          depth: 'Surface',
          notes: `Recorded via BLE from ${reading.deviceName}`,
          ...(roomId ? { roomId } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Save failed')
      }
      onAccepted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reading')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <p className="text-sm font-medium text-white">
        Accept {reading.moistureContentPercent.toFixed(1)}% reading from {reading.deviceName}
      </p>

      <div className="space-y-2">
        <label className="block">
          <span className="text-xs text-slate-400">Location *</span>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="e.g. North wall, behind cabinet"
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            autoFocus
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-400">Surface type</span>
          <select
            value={surfaceType}
            onChange={e => setSurfaceType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
          >
            {SURFACE_TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save reading'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center justify-center rounded-lg border border-slate-600 px-3 py-2 text-slate-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function BluetoothMeterPanel({
  inspectionId,
  roomId,
  mode,
  onReadingAccepted,
  className,
}: BluetoothMeterPanelProps) {
  const [availability, setAvailability] = useState<BluetoothAvailability | null>(null)
  const [connected, setConnected] = useState<Map<DeviceKey, ConnectedDevice>>(new Map())
  const [accepting, setAccepting] = useState<{ key: DeviceKey; reading: DeviceReading } | null>(null)
  const [savingEnv, setSavingEnv] = useState(false)
  const [savedEnv, setSavedEnv] = useState(false)
  const [pairingKey, setPairingKey] = useState<DeviceKey | null>(null)

  // Keep a ref to connected map for use inside subscriptions
  const connectedRef = useRef(connected)
  connectedRef.current = connected

  const relevantCategories = mode === 'moisture' ? MOISTURE_CATEGORIES : ENVIRONMENTAL_CATEGORIES
  const profiles = getP1DeviceProfiles().filter(p => relevantCategories.includes(p.category))

  // ── Availability check ──────────────────────────────────────────────────────

  useEffect(() => {
    checkBluetoothAvailability().then(setAvailability)
  }, [])

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      connectedRef.current.forEach(device => {
        device.unsubscribe?.()
        device.paired.disconnect().catch(() => {})
      })
    }
  }, [])

  // ── Pair device ─────────────────────────────────────────────────────────────

  // Must be called directly from onClick — Web Bluetooth requires a user gesture
  const handlePair = async (key: DeviceKey) => {
    setPairingKey(key)
    try {
      const paired = await pairDevice(key)

      const unsubscribe = await subscribeToReadings(
        paired,
        (reading) => {
          setConnected(prev => {
            const next = new Map(prev)
            const existing = next.get(key)
            if (existing) {
              next.set(key, { ...existing, lastReading: reading })
            }
            return next
          })
        },
        (err) => {
          console.warn(`[BLE] ${key} reading error:`, err)
        }
      )

      setConnected(prev => {
        const next = new Map(prev)
        next.set(key, { paired, lastReading: null, unsubscribe, isConnecting: false })
        return next
      })
    } catch (err) {
      // User cancelled picker or connection failed — don't show error
      console.info(`[BLE] Pair cancelled or failed for ${key}:`, err)
    } finally {
      setPairingKey(null)
    }
  }

  // ── Disconnect device ───────────────────────────────────────────────────────

  const handleDisconnect = useCallback(async (key: DeviceKey) => {
    const device = connectedRef.current.get(key)
    if (!device) return
    device.unsubscribe?.()
    await device.paired.disconnect().catch(() => {})
    setConnected(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    if (accepting?.key === key) setAccepting(null)
  }, [accepting?.key])

  // ── Accept environmental reading ────────────────────────────────────────────

  const handleAcceptEnvironmental = async (key: DeviceKey, reading: EnvironmentalReading) => {
    setSavingEnv(true)
    setSavedEnv(false)
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/environmental`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ambientTemperature: reading.temperatureCelsius,
          humidityLevel: reading.relativeHumidityPercent,
          dewPoint: reading.dewPointCelsius,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSavedEnv(true)
      onReadingAccepted?.()
      setTimeout(() => setSavedEnv(false), 3000)
    } catch {
      // Non-fatal — toast would be nice but keep dep-free
    } finally {
      setSavingEnv(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (availability === null) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-slate-500', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking Bluetooth…
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Availability warning */}
      <AvailabilityBanner availability={availability} />

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bluetooth className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-medium text-white">
          {mode === 'moisture' ? 'Moisture Meters' : 'Environmental Meters'} — BLE
        </span>
      </div>

      {/* Device list */}
      <div className="space-y-2">
        {profiles.map(profile => {
          const device = connected.get(profile.key)
          const isPairing = pairingKey === profile.key
          const isConnected = !!device
          const lastReading = device?.lastReading ?? null

          return (
            <div
              key={profile.key}
              className={cn(
                'rounded-xl border p-4 transition-colors',
                isConnected
                  ? 'border-cyan-500/40 bg-cyan-500/5'
                  : 'border-slate-700/50 bg-slate-800/50'
              )}
            >
              {/* Device header row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {isConnected ? (
                    <BluetoothConnected className="h-4 w-4 flex-shrink-0 text-cyan-400" />
                  ) : (
                    <BluetoothSearching className="h-4 w-4 flex-shrink-0 text-slate-500" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{profile.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{profile.category.replace(/-/g, ' ')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isConnected ? (
                    <button
                      onClick={() => handleDisconnect(profile.key)}
                      className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs text-slate-400 hover:border-red-500/50 hover:text-red-400"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePair(profile.key)}
                      disabled={isPairing || availability !== 'available'}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50"
                    >
                      {isPairing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                      {isPairing ? 'Pairing…' : 'Pair'}
                    </button>
                  )}
                </div>
              </div>

              {/* Live reading */}
              {isConnected && (
                <div className="mt-3 space-y-2">
                  {lastReading === null ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Waiting for reading…
                    </div>
                  ) : mode === 'moisture' ? (
                    <>
                      <MoistureReadingDisplay reading={lastReading as MoistureReading} />
                      {accepting?.key === profile.key ? (
                        <AcceptMoistureForm
                          reading={lastReading as MoistureReading}
                          inspectionId={inspectionId}
                          roomId={roomId}
                          onAccepted={() => {
                            setAccepting(null)
                            onReadingAccepted?.()
                          }}
                          onCancel={() => setAccepting(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setAccepting({ key: profile.key, reading: lastReading })}
                          className="w-full rounded-lg bg-cyan-600/20 border border-cyan-500/30 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-600/30"
                        >
                          Accept reading
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <EnvironmentalReadingDisplay reading={lastReading as EnvironmentalReading} />
                      <button
                        onClick={() => handleAcceptEnvironmental(profile.key, lastReading as EnvironmentalReading)}
                        disabled={savingEnv}
                        className={cn(
                          'w-full rounded-lg border py-2 text-xs font-medium transition-colors',
                          savedEnv
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-cyan-500/30 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30'
                        )}
                      >
                        {savingEnv ? (
                          <span className="flex items-center justify-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>
                        ) : savedEnv ? (
                          <span className="flex items-center justify-center gap-1.5"><Check className="h-3 w-3" />Applied to inspection</span>
                        ) : (
                          'Apply to inspection'
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* UUID validation notice */}
      <p className="text-xs text-slate-600">
        ⚠ GATT UUIDs are pending manufacturer validation. Contact Tramex, Delmhorst, Testo, or Vaisala for final BLE SDK documentation before pilot deployment.
      </p>
    </div>
  )
}
