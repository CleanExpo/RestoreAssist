'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ChevronRight, Lightbulb, Search, Wand2 } from 'lucide-react'
import {
  AUSTRALIAN_INSPECTION_FIELD_LIBRARY,
  FIELD_CATEGORIES,
  InspectionField
} from '@/lib/forms/field-libraries/australian-inspection-fields'

interface FieldLibraryPaletteProps {
  onFieldsSelected: (selectedFieldIds: string[]) => void
  onGenerateWithAI: (selectedFieldIds: string[], clientType: string) => void
  isGenerating?: boolean
}

export function FieldLibraryPalette({
  onFieldsSelected,
  onGenerateWithAI,
  isGenerating = false
}: FieldLibraryPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set())
  const [clientType, setClientType] = useState<'insurance' | 'client' | 'internal' | 'all'>('all')
  const [expandedCategory, setExpandedCategory] = useState<string>('property_compliance')

  // Get all fields
  const allFields = [
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance
  ]

  // Filter fields based on search
  const filterFields = (fields: InspectionField[]): InspectionField[] => {
    if (!searchQuery) return fields
    const query = searchQuery.toLowerCase()
    return fields.filter(
      f =>
        f.label.toLowerCase().includes(query) ||
        f.description?.toLowerCase().includes(query) ||
        f.id.toLowerCase().includes(query)
    )
  }

  // Handle field checkbox toggle
  const toggleField = (fieldId: string) => {
    const newSelected = new Set(selectedFieldIds)
    if (newSelected.has(fieldId)) {
      newSelected.delete(fieldId)
    } else {
      newSelected.add(fieldId)
    }
    setSelectedFieldIds(newSelected)
    onFieldsSelected(Array.from(newSelected))
  }

  // Handle select all category
  const selectCategory = (categoryId: string) => {
    const categoryKey = categoryId as keyof typeof AUSTRALIAN_INSPECTION_FIELD_LIBRARY
    let fields: InspectionField[] = []

    switch (categoryKey) {
      case 'propertyCompliance':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance
        break
      case 'emergencyServices':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices
        break
      case 'iicrcClassification':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification
        break
      case 'costBreakdown':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown
        break
      case 'standardsCompliance':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance
        break
    }

    const newSelected = new Set(selectedFieldIds)
    fields.forEach(f => newSelected.add(f.id))
    setSelectedFieldIds(newSelected)
    onFieldsSelected(Array.from(newSelected))
  }

  // Handle deselect all category
  const deselectCategory = (categoryId: string) => {
    const categoryKey = categoryId as keyof typeof AUSTRALIAN_INSPECTION_FIELD_LIBRARY
    let fields: InspectionField[] = []

    switch (categoryKey) {
      case 'propertyCompliance':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance
        break
      case 'emergencyServices':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices
        break
      case 'iicrcClassification':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification
        break
      case 'costBreakdown':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown
        break
      case 'standardsCompliance':
        fields = AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance
        break
    }

    const newSelected = new Set(selectedFieldIds)
    fields.forEach(f => newSelected.delete(f.id))
    setSelectedFieldIds(newSelected)
    onFieldsSelected(Array.from(newSelected))
  }

  // Render field checkbox
  const FieldCheckbox = ({ field }: { field: InspectionField }) => (
    <div className="flex items-start space-x-3 p-2 rounded hover:bg-gray-50">
      <Checkbox
        id={field.id}
        checked={selectedFieldIds.has(field.id)}
        onCheckedChange={() => toggleField(field.id)}
        className="mt-1"
      />
      <label htmlFor={field.id} className="flex-1 cursor-pointer">
        <p className="text-sm font-medium text-gray-900">{field.label}</p>
        <p className="text-xs text-gray-600">{field.description}</p>
        <div className="flex gap-1 mt-1 flex-wrap">
          {field.autoCalculate && <Badge className="text-xs bg-blue-50 text-blue-700">Auto-Calc</Badge>}
          {field.conditionalOn && <Badge className="text-xs bg-yellow-50 text-yellow-700">Conditional</Badge>}
          {field.required && <Badge className="text-xs bg-red-50 text-red-700">Required</Badge>}
        </div>
      </label>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header with AI Generate Button */}
      <div className="space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">Australian Inspection Report Builder</h3>
            <p className="text-sm text-gray-600">
              {selectedFieldIds.size > 0 ? `${selectedFieldIds.size} fields selected` : 'Select fields to customize your report'} • 63 total available
            </p>
          </div>
          <Button
            onClick={() => onGenerateWithAI(Array.from(selectedFieldIds), clientType)}
            disabled={selectedFieldIds.size === 0 || isGenerating}
            className="gap-2"
            size="lg"
          >
            <Wand2 className="h-4 w-4" />
            {isGenerating ? 'Generating...' : `AI Generate Report (${selectedFieldIds.size})`}
          </Button>
        </div>

        {/* Alert */}
        <Alert className="bg-blue-50 border-blue-200">
          <Lightbulb className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm">
            1. Select which fields you want in your report  2. Click "AI Generate Report"  3. System AI generates the inspection for your client
          </AlertDescription>
        </Alert>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Client Type Selector */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Report will be generated for:
          </label>
          <div className="flex gap-2">
            {[
              { value: 'all', label: '📋 All 3 PDFs (Insurance + Client + Internal)', desc: 'Generate all three stakeholder reports' },
              { value: 'insurance', label: '🏢 Insurance/Adjuster', desc: 'Technical, detailed report' },
              { value: 'client', label: '👤 Client/Property Owner', desc: 'Simple, non-technical' },
              { value: 'internal', label: '⚙️ Internal/Technician', desc: 'Operational scope of works' }
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setClientType(value as any)}
                className={`px-3 py-2 rounded text-sm font-medium transition ${
                  clientType === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Field Selection Accordion */}
      <Tabs defaultValue="fields" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="fields">Select Fields ({selectedFieldIds.size})</TabsTrigger>
          <TabsTrigger value="templates">Quick Templates</TabsTrigger>
        </TabsList>

        {/* FIELDS TAB */}
        <TabsContent value="fields" className="space-y-4">
          <Accordion type="single" collapsible value={expandedCategory}>
            {/* Property & Compliance */}
            <AccordionItem value="property_compliance">
              <AccordionTrigger onClick={() => setExpandedCategory('property_compliance')}>
                <div className="flex items-center gap-2">
                  <span>🏠 Property & Compliance</span>
                  <Badge variant="secondary" className="text-xs">
                    {Array.from(selectedFieldIds).filter(id =>
                      AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance.some(f => f.id === id)
                    ).length}
                    /{AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-3">
                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => selectCategory('propertyCompliance')}
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deselectCategory('propertyCompliance')}
                  >
                    Deselect All
                  </Button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filterFields(AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance).map(field => (
                    <FieldCheckbox key={field.id} field={field} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Emergency Services */}
            <AccordionItem value="emergency_services">
              <AccordionTrigger onClick={() => setExpandedCategory('emergency_services')}>
                <div className="flex items-center gap-2">
                  <span>🚒 Emergency Services</span>
                  <Badge variant="secondary" className="text-xs">
                    {Array.from(selectedFieldIds).filter(id =>
                      AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices.some(f => f.id === id)
                    ).length}
                    /{AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-3">
                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => selectCategory('emergencyServices')}
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deselectCategory('emergencyServices')}
                  >
                    Deselect All
                  </Button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filterFields(AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices).map(field => (
                    <FieldCheckbox key={field.id} field={field} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* IICRC Classification */}
            <AccordionItem value="iicrc_classification">
              <AccordionTrigger onClick={() => setExpandedCategory('iicrc_classification')}>
                <div className="flex items-center gap-2">
                  <span>💧 IICRC Classification</span>
                  <Badge variant="secondary" className="text-xs">
                    {Array.from(selectedFieldIds).filter(id =>
                      AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification.some(f => f.id === id)
                    ).length}
                    /{AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-3">
                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => selectCategory('iicrcClassification')}
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deselectCategory('iicrcClassification')}
                  >
                    Deselect All
                  </Button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filterFields(AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification).map(field => (
                    <FieldCheckbox key={field.id} field={field} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Cost Breakdown */}
            <AccordionItem value="cost_breakdown">
              <AccordionTrigger onClick={() => setExpandedCategory('cost_breakdown')}>
                <div className="flex items-center gap-2">
                  <span>💰 Cost Breakdown (GST)</span>
                  <Badge variant="secondary" className="text-xs">
                    {Array.from(selectedFieldIds).filter(id =>
                      AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown.some(f => f.id === id)
                    ).length}
                    /{AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-3">
                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => selectCategory('costBreakdown')}
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deselectCategory('costBreakdown')}
                  >
                    Deselect All
                  </Button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filterFields(AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown).map(field => (
                    <FieldCheckbox key={field.id} field={field} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Standards Compliance */}
            <AccordionItem value="standards_compliance">
              <AccordionTrigger onClick={() => setExpandedCategory('standards_compliance')}>
                <div className="flex items-center gap-2">
                  <span>✓ Standards Compliance</span>
                  <Badge variant="secondary" className="text-xs">
                    {Array.from(selectedFieldIds).filter(id =>
                      AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance.some(f => f.id === id)
                    ).length}
                    /{AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-3">
                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => selectCategory('standardsCompliance')}
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deselectCategory('standardsCompliance')}
                  >
                    Deselect All
                  </Button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filterFields(AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance).map(field => (
                    <FieldCheckbox key={field.id} field={field} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>

        {/* TEMPLATES TAB */}
        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-3">
            <Card className="cursor-pointer hover:border-blue-500 transition"
              onClick={() => {
                const basicFields = [
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance.slice(0, 8),
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification,
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown.slice(0, 5)
                ]
                setSelectedFieldIds(new Set(basicFields.map(f => f.id)))
                onFieldsSelected(basicFields.map(f => f.id))
              }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">💧 Basic Water Damage</CardTitle>
                <CardDescription>Property + Water Assessment + Basic Costs</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-600">27 fields • Best for quick assessments</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:border-blue-500 transition"
              onClick={() => {
                const quickFields = [
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance.slice(0, 5),
                  AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices[0],
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification.slice(0, 7),
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown.slice(0, 2)
                ]
                setSelectedFieldIds(new Set(quickFields.map(f => f.id)))
                onFieldsSelected(quickFields.map(f => f.id))
              }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">⚡ Quick Assessment</CardTitle>
                <CardDescription>Minimal fields for rapid on-site capture</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-600">15 fields • ~10 minute completion</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:border-blue-500 transition"
              onClick={() => {
                const insuranceFields = [
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance,
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices,
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification,
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown,
                  ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance.slice(0, 5)
                ]
                setSelectedFieldIds(new Set(insuranceFields.map(f => f.id)))
                onFieldsSelected(insuranceFields.map(f => f.id))
              }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">🏢 Insurance Claim</CardTitle>
                <CardDescription>Optimized for insurance adjuster requirements</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-600">47 fields • Full technical details</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:border-blue-500 transition"
              onClick={() => {
                setSelectedFieldIds(new Set(getAllAustralianFields().map(f => f.id)))
                onFieldsSelected(getAllAustralianFields().map(f => f.id))
              }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">📊 Comprehensive Compliance</CardTitle>
                <CardDescription>All fields including standards & regulations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-600">53 fields • Complete documentation</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Helper to get all fields
function getAllAustralianFields(): InspectionField[] {
  return [
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance
  ]
}
