"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Save, RefreshCw, AlertTriangle } from "lucide-react"

interface PricingData {
  // Callout Fees
  minimalCalloutFee: number
  administrationFee: number

  // Normal Hours Labour Rates
  masterTechnicianRate: number
  qualifiedTechnicianRate: number
  labourerRate: number

  // After Hours - Master Technician
  masterAfterHoursWeekday: number
  masterSaturday: number
  masterSunday: number

  // After Hours - Qualified Technician
  qualifiedAfterHoursWeekday: number
  qualifiedSaturday: number
  qualifiedSunday: number

  // After Hours - Labourer
  labourerAfterHoursWeekday: number
  labourerSaturday: number
  labourerSunday: number

  // Equipment - Dehumidifiers
  dehumidifierLarge: number
  dehumidifierMedium: number
  dehumidifierDesiccant: number

  // Equipment - Air Movers
  airmoverAxial: number
  airmoverCentrifugal: number
  airmoverLayflat: number

  // Equipment - AFDs
  afdExtraLarge: number
  afdLarge500cfm: number

  // Equipment - Extraction
  extractionTruckMounted: number
  extractionElectric: number

  // Thermal Camera
  thermalCameraClaimCost: number

  // Chemicals
  chemicalAntiMicrobial: number
  chemicalMouldRemediation: number
  chemicalBioHazard: number

  // Metadata
  currency: string
  taxRate: number
}

const defaultPricing: PricingData = {
  minimalCalloutFee: 0,
  administrationFee: 0,
  masterTechnicianRate: 0,
  qualifiedTechnicianRate: 0,
  labourerRate: 0,
  masterAfterHoursWeekday: 0,
  masterSaturday: 0,
  masterSunday: 0,
  qualifiedAfterHoursWeekday: 0,
  qualifiedSaturday: 0,
  qualifiedSunday: 0,
  labourerAfterHoursWeekday: 0,
  labourerSaturday: 0,
  labourerSunday: 0,
  dehumidifierLarge: 0,
  dehumidifierMedium: 0,
  dehumidifierDesiccant: 0,
  airmoverAxial: 0,
  airmoverCentrifugal: 0,
  airmoverLayflat: 0,
  afdExtraLarge: 0,
  afdLarge500cfm: 0,
  extractionTruckMounted: 0,
  extractionElectric: 0,
  thermalCameraClaimCost: 0,
  chemicalAntiMicrobial: 1.50,
  chemicalMouldRemediation: 2.50,
  chemicalBioHazard: 4.50,
  currency: "AUD",
  taxRate: 0.10
}

export default function PricingPage() {
  const { data: session } = useSession()
  const [pricing, setPricing] = useState<PricingData>(defaultPricing)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null)
  const [pricingExists, setPricingExists] = useState(false)

  useEffect(() => {
    fetchPricing()
  }, [])

  const fetchPricing = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/pricing")
      const data = await response.json()

      if (data.exists && data.pricing) {
        setPricingExists(true)
        setPricing({
          minimalCalloutFee: data.pricing.minimalCalloutFee || 0,
          administrationFee: data.pricing.administrationFee || 0,
          masterTechnicianRate: data.pricing.masterTechnicianRate || 0,
          qualifiedTechnicianRate: data.pricing.qualifiedTechnicianRate || 0,
          labourerRate: data.pricing.labourerRate || 0,
          masterAfterHoursWeekday: data.pricing.masterAfterHoursWeekday || 0,
          masterSaturday: data.pricing.masterSaturday || 0,
          masterSunday: data.pricing.masterSunday || 0,
          qualifiedAfterHoursWeekday: data.pricing.qualifiedAfterHoursWeekday || 0,
          qualifiedSaturday: data.pricing.qualifiedSaturday || 0,
          qualifiedSunday: data.pricing.qualifiedSunday || 0,
          labourerAfterHoursWeekday: data.pricing.labourerAfterHoursWeekday || 0,
          labourerSaturday: data.pricing.labourerSaturday || 0,
          labourerSunday: data.pricing.labourerSunday || 0,
          dehumidifierLarge: data.pricing.dehumidifierLarge || 0,
          dehumidifierMedium: data.pricing.dehumidifierMedium || 0,
          dehumidifierDesiccant: data.pricing.dehumidifierDesiccant || 0,
          airmoverAxial: data.pricing.airmoverAxial || 0,
          airmoverCentrifugal: data.pricing.airmoverCentrifugal || 0,
          airmoverLayflat: data.pricing.airmoverLayflat || 0,
          afdExtraLarge: data.pricing.afdExtraLarge || 0,
          afdLarge500cfm: data.pricing.afdLarge500cfm || 0,
          extractionTruckMounted: data.pricing.extractionTruckMounted || 0,
          extractionElectric: data.pricing.extractionElectric || 0,
          thermalCameraClaimCost: data.pricing.thermalCameraClaimCost || 0,
          chemicalAntiMicrobial: data.pricing.chemicalAntiMicrobial || 1.50,
          chemicalMouldRemediation: data.pricing.chemicalMouldRemediation || 2.50,
          chemicalBioHazard: data.pricing.chemicalBioHazard || 4.50,
          currency: data.pricing.currency || "AUD",
          taxRate: data.pricing.taxRate || 0.10
        })
      } else {
        setPricingExists(false)
      }
    } catch (error) {
      console.error("Error fetching pricing:", error)
      setMessage({ type: "error", text: "Failed to load pricing structure" })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)

      const response = await fetch("/api/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricing)
      })

      const data = await response.json()

      if (response.ok) {
        setPricingExists(true)
        setMessage({ type: "success", text: "Pricing structure saved successfully" })
        setTimeout(() => setMessage(null), 5000)
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save pricing structure" })
      }
    } catch (error) {
      console.error("Error saving pricing:", error)
      setMessage({ type: "error", text: "An error occurred while saving" })
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field: keyof PricingData, value: string) => {
    setPricing(prev => ({
      ...prev,
      [field]: parseFloat(value) || 0
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Company Pricing Structure</h1>
        <p className="text-muted-foreground">
          Configure your company's pricing for accurate cost estimation in reports
        </p>
      </div>

      {!pricingExists && (
        <Alert className="mb-6 border-orange-500 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            No pricing structure configured. Please set up your pricing to enable accurate cost estimation.
          </AlertDescription>
        </Alert>
      )}

      {message && (
        <Alert className={`mb-6 ${message.type === "success" ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"}`}>
          <AlertDescription className={message.type === "success" ? "text-green-800" : "text-red-800"}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {/* Callout Fees */}
        <Card>
          <CardHeader>
            <CardTitle>Callout Fees</CardTitle>
            <CardDescription>Standard callout and administration fees</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PriceInput
              label="Minimal Callout Fee"
              value={pricing.minimalCalloutFee}
              onChange={(val) => updateField("minimalCalloutFee", val)}
              currency={pricing.currency}
            />
            <PriceInput
              label="Administration Fee"
              value={pricing.administrationFee}
              onChange={(val) => updateField("administrationFee", val)}
              currency={pricing.currency}
            />
          </CardContent>
        </Card>

        {/* Normal Hours Labour Rates */}
        <Card>
          <CardHeader>
            <CardTitle>Normal Hours Labour Rates</CardTitle>
            <CardDescription>Hourly rates for standard business hours</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PriceInput
              label="Master Qualified Technician"
              value={pricing.masterTechnicianRate}
              onChange={(val) => updateField("masterTechnicianRate", val)}
              currency={pricing.currency}
              unit="per hour"
            />
            <PriceInput
              label="Qualified Technician"
              value={pricing.qualifiedTechnicianRate}
              onChange={(val) => updateField("qualifiedTechnicianRate", val)}
              currency={pricing.currency}
              unit="per hour"
            />
            <PriceInput
              label="Labourer"
              value={pricing.labourerRate}
              onChange={(val) => updateField("labourerRate", val)}
              currency={pricing.currency}
              unit="per hour"
            />
          </CardContent>
        </Card>

        {/* After Hours - Master Technician */}
        <Card>
          <CardHeader>
            <CardTitle>After Hours - Master Qualified Technician</CardTitle>
            <CardDescription>Hourly rates for after hours work</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PriceInput
              label="Mon-Fri After 4pm"
              value={pricing.masterAfterHoursWeekday}
              onChange={(val) => updateField("masterAfterHoursWeekday", val)}
              currency={pricing.currency}
              unit="per hour"
            />
            <PriceInput
              label="Saturday"
              value={pricing.masterSaturday}
              onChange={(val) => updateField("masterSaturday", val)}
              currency={pricing.currency}
              unit="per hour"
            />
            <PriceInput
              label="Sunday"
              value={pricing.masterSunday}
              onChange={(val) => updateField("masterSunday", val)}
              currency={pricing.currency}
              unit="per hour"
            />
          </CardContent>
        </Card>

        {/* After Hours - Qualified Technician */}
        <Card>
          <CardHeader>
            <CardTitle>After Hours - Qualified Technician</CardTitle>
            <CardDescription>Hourly rates for after hours work</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PriceInput
              label="Mon-Fri After 4pm"
              value={pricing.qualifiedAfterHoursWeekday}
              onChange={(val) => updateField("qualifiedAfterHoursWeekday", val)}
              currency={pricing.currency}
              unit="per hour"
            />
            <PriceInput
              label="Saturday"
              value={pricing.qualifiedSaturday}
              onChange={(val) => updateField("qualifiedSaturday", val)}
              currency={pricing.currency}
              unit="per hour"
            />
            <PriceInput
              label="Sunday"
              value={pricing.qualifiedSunday}
              onChange={(val) => updateField("qualifiedSunday", val)}
              currency={pricing.currency}
              unit="per hour"
            />
          </CardContent>
        </Card>

        {/* After Hours - Labourer */}
        <Card>
          <CardHeader>
            <CardTitle>After Hours - Labourer</CardTitle>
            <CardDescription>Hourly rates for after hours work</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PriceInput
              label="Mon-Fri After 4pm"
              value={pricing.labourerAfterHoursWeekday}
              onChange={(val) => updateField("labourerAfterHoursWeekday", val)}
              currency={pricing.currency}
              unit="per hour"
            />
            <PriceInput
              label="Saturday"
              value={pricing.labourerSaturday}
              onChange={(val) => updateField("labourerSaturday", val)}
              currency={pricing.currency}
              unit="per hour"
            />
            <PriceInput
              label="Sunday"
              value={pricing.labourerSunday}
              onChange={(val) => updateField("labourerSunday", val)}
              currency={pricing.currency}
              unit="per hour"
            />
          </CardContent>
        </Card>

        {/* Equipment - Dehumidifiers */}
        <Card>
          <CardHeader>
            <CardTitle>Equipment - Dehumidifiers</CardTitle>
            <CardDescription>Daily rates for dehumidifier equipment</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PriceInput
              label="Large"
              value={pricing.dehumidifierLarge}
              onChange={(val) => updateField("dehumidifierLarge", val)}
              currency={pricing.currency}
              unit="per day"
            />
            <PriceInput
              label="Medium"
              value={pricing.dehumidifierMedium}
              onChange={(val) => updateField("dehumidifierMedium", val)}
              currency={pricing.currency}
              unit="per day"
            />
            <PriceInput
              label="Desiccant"
              value={pricing.dehumidifierDesiccant}
              onChange={(val) => updateField("dehumidifierDesiccant", val)}
              currency={pricing.currency}
              unit="per day"
            />
          </CardContent>
        </Card>

        {/* Equipment - Air Movers */}
        <Card>
          <CardHeader>
            <CardTitle>Equipment - Air Movers</CardTitle>
            <CardDescription>Daily rates for air mover equipment</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PriceInput
              label="Axial"
              value={pricing.airmoverAxial}
              onChange={(val) => updateField("airmoverAxial", val)}
              currency={pricing.currency}
              unit="per day"
            />
            <PriceInput
              label="Centrifugal"
              value={pricing.airmoverCentrifugal}
              onChange={(val) => updateField("airmoverCentrifugal", val)}
              currency={pricing.currency}
              unit="per day"
            />
            <PriceInput
              label="Layflat"
              value={pricing.airmoverLayflat}
              onChange={(val) => updateField("airmoverLayflat", val)}
              currency={pricing.currency}
              unit="per day"
            />
          </CardContent>
        </Card>

        {/* Equipment - AFDs */}
        <Card>
          <CardHeader>
            <CardTitle>Equipment - Air Filtration Devices (AFDs)</CardTitle>
            <CardDescription>Daily rates for air filtration units</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PriceInput
              label="Extra Large"
              value={pricing.afdExtraLarge}
              onChange={(val) => updateField("afdExtraLarge", val)}
              currency={pricing.currency}
              unit="per day"
            />
            <PriceInput
              label="Large (500 CFM)"
              value={pricing.afdLarge500cfm}
              onChange={(val) => updateField("afdLarge500cfm", val)}
              currency={pricing.currency}
              unit="per day"
            />
          </CardContent>
        </Card>

        {/* Equipment - Extraction Units */}
        <Card>
          <CardHeader>
            <CardTitle>Equipment - Extraction Units</CardTitle>
            <CardDescription>Hourly rates for extraction equipment</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PriceInput
              label="Truck Mounted Unit"
              value={pricing.extractionTruckMounted}
              onChange={(val) => updateField("extractionTruckMounted", val)}
              currency={pricing.currency}
              unit="per hour"
            />
            <PriceInput
              label="Electric Unit"
              value={pricing.extractionElectric}
              onChange={(val) => updateField("extractionElectric", val)}
              currency={pricing.currency}
              unit="per hour"
            />
          </CardContent>
        </Card>

        {/* Thermal Camera */}
        <Card>
          <CardHeader>
            <CardTitle>Thermal Camera</CardTitle>
            <CardDescription>Cost for thermal camera use in claims</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PriceInput
              label="Claim Use Cost"
              value={pricing.thermalCameraClaimCost}
              onChange={(val) => updateField("thermalCameraClaimCost", val)}
              currency={pricing.currency}
            />
          </CardContent>
        </Card>

        {/* Chemicals */}
        <Card>
          <CardHeader>
            <CardTitle>Chemical Costs</CardTitle>
            <CardDescription>Cost per square meter for chemical applications</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PriceInput
              label="Anti-Microbial"
              value={pricing.chemicalAntiMicrobial}
              onChange={(val) => updateField("chemicalAntiMicrobial", val)}
              currency={pricing.currency}
              unit="per sqm"
            />
            <PriceInput
              label="Mould Remediation"
              value={pricing.chemicalMouldRemediation}
              onChange={(val) => updateField("chemicalMouldRemediation", val)}
              currency={pricing.currency}
              unit="per sqm"
            />
            <PriceInput
              label="Bio-Hazard"
              value={pricing.chemicalBioHazard}
              onChange={(val) => updateField("chemicalBioHazard", val)}
              currency={pricing.currency}
              unit="per sqm"
            />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end">
          <Button
            variant="outline"
            onClick={fetchPricing}
            disabled={saving}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Pricing
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PriceInput({
  label,
  value,
  onChange,
  currency = "AUD",
  unit
}: {
  label: string
  value: number
  onChange: (value: string) => void
  currency?: string
  unit?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pl-7"
          />
        </div>
        {unit && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">{unit}</span>
        )}
      </div>
    </div>
  )
}
