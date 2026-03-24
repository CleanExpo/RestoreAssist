"use client"

import { useState } from "react"
import { Droplets, Flame, Wind, Bug, FlaskConical, Calculator, Printer, RotateCcw } from "lucide-react"
import toast from "react-hot-toast"

/* ─── Types ─── */

interface QuoteLineItem {
  description: string
  qty: number
  unit: string
  rate: number
  subtotal: number
}

interface QuoteResponse {
  quoteNumber: string
  quoteDate: string
  jobType: string
  standardApplied: string
  applicableStandards: string[]
  contractor: {
    businessName: string
    abn: string
    address: string
    phone: string
    email: string
    logo: string
  }
  client: { name: string; address: string; phone: string; email: string }
  lineItems: QuoteLineItem[]
  subtotalExGST: number
  gst: number
  totalIncGST: number
  minimumApplied: boolean
  minimumChargeAmount: number
  jobDescription: string
}

/* ─── Job Type Definitions ─── */

const JOB_TYPES = [
  { id: "water",    label: "Water Damage",       icon: Droplets,     standard: "AS-IICRC S500:2025",                color: "text-blue-500" },
  { id: "mould",    label: "Mould Remediation",  icon: FlaskConical, standard: "IICRC S520",                        color: "text-green-500" },
  { id: "fire",     label: "Fire & Smoke",       icon: Flame,        standard: "BSR/IICRC S700",                    color: "text-orange-500" },
  { id: "storm",    label: "Storm Damage",       icon: Wind,         standard: "AS-IICRC S500:2025",                color: "text-cyan-500" },
  { id: "bioclean", label: "Biohazard",          icon: Bug,          standard: "IICRC S540",                        color: "text-red-500" },
] as const

/* ─── Default Form State ─── */

const DEFAULT_FORM = {
  affectedAreaM2: 45,
  numberOfRooms: 3,
  dryingDays: 4,
  labourHours: 16,
  labourTier: "qualifiedTechnician" as string,
  labourPeriod: "NormalHours" as string,
  airMoversAxial: 4,
  airMoversCentrifugal: 0,
  dehumidifiersLGR: 2,
  dehumidifiersDesiccant: 0,
  afdUnitsLarge: 0,
  extractionTruckMountedHours: 2,
  extractionElectricHours: 0,
  injectionDryingDays: 0,
  includeCallOut: true,
  includeAdminFee: true,
  includeThermalCamera: false,
  clientName: "",
  clientAddress: "",
  clientPhone: "",
  clientEmail: "",
  jobDescription: "",
}

/* ─── Component ─── */

export default function QuotePage() {
  const [selectedJobType, setSelectedJobType] = useState<string | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [quoteResult, setQuoteResult] = useState<QuoteResponse | null>(null)
  const [calculating, setCalculating] = useState(false)

  const updateField = (field: string, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCalculate = async () => {
    if (!selectedJobType) return
    setCalculating(true)
    setQuoteResult(null)
    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType: selectedJobType, ...form }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || "Calculation failed")
        return
      }
      const data: QuoteResponse = await res.json()
      setQuoteResult(data)
      toast.success("Quote calculated successfully")
    } catch {
      toast.error("Network error — please try again")
    } finally {
      setCalculating(false)
    }
  }

  const handleReset = () => {
    setSelectedJobType(null)
    setForm(DEFAULT_FORM)
    setQuoteResult(null)
  }

  const handlePrint = () => {
    window.print()
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-AU", { style: "currency", currency: "AUD" })

  /* ─── Render ─── */
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Quote Generator</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Generate NRPG-rated quotes using your saved pricing configuration
          </p>
        </div>
        {(selectedJobType || quoteResult) && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Start Over
          </button>
        )}
      </div>

      {/* Step 1: Job Type Selector */}
      {!quoteResult && (
        <div>
          <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-3">
            1. Select Job Type
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {JOB_TYPES.map((jt) => {
              const Icon = jt.icon
              const isSelected = selectedJobType === jt.id
              return (
                <button
                  key={jt.id}
                  onClick={() => setSelectedJobType(jt.id)}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-md"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <Icon className={`w-8 h-8 ${isSelected ? "text-blue-500" : jt.color}`} />
                  <span className={`text-sm font-medium text-center ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"}`}>
                    {jt.label}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 text-center leading-tight">
                    {jt.standard}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Step 2: Job Inputs Form */}
      {selectedJobType && !quoteResult && (
        <div className="space-y-6">
          <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200">
            2. Enter Job Details
          </h2>

          {/* Client Details */}
          <Section title="Client Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Client Name" value={form.clientName} onChange={(v) => updateField("clientName", v)} />
              <InputField label="Client Phone" value={form.clientPhone} onChange={(v) => updateField("clientPhone", v)} />
              <InputField label="Client Email" value={form.clientEmail} onChange={(v) => updateField("clientEmail", v)} className="sm:col-span-2" />
              <InputField label="Client Address" value={form.clientAddress} onChange={(v) => updateField("clientAddress", v)} className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Job Description</label>
                <textarea
                  value={form.jobDescription}
                  onChange={(e) => updateField("jobDescription", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </Section>

          {/* Area & Duration */}
          <Section title="Area & Duration">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumberField label="Affected Area (m²)" value={form.affectedAreaM2} onChange={(v) => updateField("affectedAreaM2", v)} min={1} />
              <NumberField label="Number of Rooms" value={form.numberOfRooms} onChange={(v) => updateField("numberOfRooms", v)} min={1} step={1} />
              <NumberField label="Drying Days" value={form.dryingDays} onChange={(v) => updateField("dryingDays", v)} min={1} step={1} />
            </div>
          </Section>

          {/* Labour */}
          <Section title="Labour">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumberField label="Labour Hours" value={form.labourHours} onChange={(v) => updateField("labourHours", v)} min={0} />
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Labour Tier</label>
                <select
                  value={form.labourTier}
                  onChange={(e) => updateField("labourTier", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="masterQualified">Master Qualified Technician</option>
                  <option value="qualifiedTechnician">Qualified Technician</option>
                  <option value="labourer">Labourer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Time Period</label>
                <select
                  value={form.labourPeriod}
                  onChange={(e) => updateField("labourPeriod", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="NormalHours">Normal Hours</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select>
              </div>
            </div>
          </Section>

          {/* Equipment */}
          <Section title="Equipment">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <NumberField label="Air Movers (Axial)" value={form.airMoversAxial} onChange={(v) => updateField("airMoversAxial", v)} min={0} step={1} />
              <NumberField label="Air Movers (Centrifugal)" value={form.airMoversCentrifugal} onChange={(v) => updateField("airMoversCentrifugal", v)} min={0} step={1} />
              <NumberField label="Dehumidifiers (LGR)" value={form.dehumidifiersLGR} onChange={(v) => updateField("dehumidifiersLGR", v)} min={0} step={1} />
              <NumberField label="Dehumidifiers (Desiccant)" value={form.dehumidifiersDesiccant} onChange={(v) => updateField("dehumidifiersDesiccant", v)} min={0} step={1} />
              <NumberField label="AFD Units (Large)" value={form.afdUnitsLarge} onChange={(v) => updateField("afdUnitsLarge", v)} min={0} step={1} />
              <NumberField label="Injection Drying (days)" value={form.injectionDryingDays} onChange={(v) => updateField("injectionDryingDays", v)} min={0} step={1} />
            </div>
          </Section>

          {/* Extraction */}
          <Section title="Extraction">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberField label="Truck-Mounted (hours)" value={form.extractionTruckMountedHours} onChange={(v) => updateField("extractionTruckMountedHours", v)} min={0} />
              <NumberField label="Electric/Portable (hours)" value={form.extractionElectricHours} onChange={(v) => updateField("extractionElectricHours", v)} min={0} />
            </div>
          </Section>

          {/* Options */}
          <Section title="Additional Items">
            <div className="flex flex-wrap gap-6">
              <CheckboxField label="Call-Out Fee" checked={form.includeCallOut} onChange={(v) => updateField("includeCallOut", v)} />
              <CheckboxField label="Administration Fee" checked={form.includeAdminFee} onChange={(v) => updateField("includeAdminFee", v)} />
              <CheckboxField label="Thermal Camera Assessment" checked={form.includeThermalCamera} onChange={(v) => updateField("includeThermalCamera", v)} />
            </div>
          </Section>

          {/* Calculate Button */}
          <button
            onClick={handleCalculate}
            disabled={calculating}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 text-white font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-lg shadow-blue-500/20"
          >
            <Calculator className="w-5 h-5" />
            {calculating ? "Calculating..." : "Calculate Quote"}
          </button>
        </div>
      )}

      {/* Step 3: Quote Result (Printable) */}
      {quoteResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200">
              Quote Generated
            </h2>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-800 dark:bg-white dark:text-slate-800 rounded-lg hover:opacity-90 transition-opacity"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
          </div>

          <div
            id="quote-print-content"
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 space-y-6 print:border-none print:shadow-none print:rounded-none print:p-0"
          >
            {/* Contractor Header */}
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 pb-6">
              <div>
                {quoteResult.contractor.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={quoteResult.contractor.logo} alt="Logo" className="h-12 mb-2" />
                )}
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {quoteResult.contractor.businessName || "Your Business"}
                </h3>
                {quoteResult.contractor.abn && (
                  <p className="text-sm text-slate-500">ABN: {quoteResult.contractor.abn}</p>
                )}
                {quoteResult.contractor.address && (
                  <p className="text-sm text-slate-500">{quoteResult.contractor.address}</p>
                )}
                <div className="text-sm text-slate-500 space-x-3">
                  {quoteResult.contractor.phone && <span>{quoteResult.contractor.phone}</span>}
                  {quoteResult.contractor.email && <span>{quoteResult.contractor.email}</span>}
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold text-blue-600">QUOTE</h2>
                <p className="text-sm text-slate-500 mt-1">{quoteResult.quoteNumber}</p>
                <p className="text-sm text-slate-500">
                  {new Date(quoteResult.quoteDate).toLocaleDateString("en-AU", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* Client & Job Info */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Client</h4>
                {quoteResult.client.name && <p className="text-sm font-medium text-slate-900 dark:text-white">{quoteResult.client.name}</p>}
                {quoteResult.client.address && <p className="text-sm text-slate-500">{quoteResult.client.address}</p>}
                {quoteResult.client.phone && <p className="text-sm text-slate-500">{quoteResult.client.phone}</p>}
                {quoteResult.client.email && <p className="text-sm text-slate-500">{quoteResult.client.email}</p>}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Job Details</h4>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{quoteResult.jobType}</p>
                <p className="text-sm text-slate-500">Standard: {quoteResult.standardApplied}</p>
                {quoteResult.jobDescription && (
                  <p className="text-sm text-slate-500 mt-1">{quoteResult.jobDescription}</p>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 dark:border-slate-600">
                    <th className="text-left py-2 pr-4 font-semibold text-slate-700 dark:text-slate-300">Description</th>
                    <th className="text-right py-2 px-2 font-semibold text-slate-700 dark:text-slate-300 w-16">Qty</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-700 dark:text-slate-300 w-20">Unit</th>
                    <th className="text-right py-2 px-2 font-semibold text-slate-700 dark:text-slate-300 w-24">Rate</th>
                    <th className="text-right py-2 pl-2 font-semibold text-slate-700 dark:text-slate-300 w-28">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteResult.lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{item.description}</td>
                      <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{item.qty}</td>
                      <td className="py-2 px-2 text-center text-slate-600 dark:text-slate-400">{item.unit}</td>
                      <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{fmt(item.rate)}</td>
                      <td className="py-2 pl-2 text-right font-medium text-slate-800 dark:text-slate-200">{fmt(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-72 space-y-2">
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Subtotal (ex GST)</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{fmt(quoteResult.subtotalExGST)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>GST (10%)</span>
                  <span>{fmt(quoteResult.gst)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t-2 border-slate-300 dark:border-slate-600 pt-2 text-slate-900 dark:text-white">
                  <span>Total (inc GST)</span>
                  <span>{fmt(quoteResult.totalIncGST)}</span>
                </div>
              </div>
            </div>

            {/* Minimum charge notice */}
            {quoteResult.minimumApplied && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
                A minimum charge of {fmt(quoteResult.minimumChargeAmount)} (ex GST) has been applied in accordance with industry minimum engagement standards.
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 text-xs text-slate-400 space-y-1">
              <p>This quote is valid for 30 days from the date of issue. Rates are based on the National Restoration Pricing Guide (NRPG) framework.</p>
              <p>All work performed in accordance with {quoteResult.standardApplied} and applicable Australian Standards.</p>
              <p>Prices are in Australian Dollars (AUD) and include GST where indicated.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Reusable Sub-components ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

function InputField({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )
}

function NumberField({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        step={step}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
    </label>
  )
}
