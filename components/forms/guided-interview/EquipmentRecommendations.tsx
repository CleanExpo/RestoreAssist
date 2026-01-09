/**
 * Equipment Recommendations Component
 * Displays equipment needed based on IICRC classification and job parameters
 */

'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, Zap, Wind, Droplets, Thermometer } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface EquipmentRecommendation {
  type: 'dehumidifier' | 'air_mover' | 'air_scrubber' | 'heater' | 'monitor'
  quantity: number
  specification?: {
    type?: string // 'LGR' vs 'Conventional' for dehumidifiers
    capacity?: number
    wattage?: number
    cfm?: number // Cubic feet per minute
  }
  dailyRentalCost: number
  estimatedDaysNeeded: number
  totalEstimatedCost: number
  reasoning: string
  standardsReference: string
}

interface EquipmentRecommendationsProps {
  iicrcCategory: number // 1=Clean, 2=Grey, 3=Black
  iicrcClass: number // 1-4
  affectedArea: number // Square footage
  ceilingHeight?: number // Feet (default: 8)
  temperatureCelsius?: number
  humidityCurrent?: number
  isUrgent?: boolean // Expedited equipment needs
}

/**
 * Equipment type icon
 */
const getEquipmentIcon = (type: string) => {
  switch (type) {
    case 'dehumidifier':
      return <Droplets className="h-5 w-5 text-blue-600" />
    case 'air_mover':
      return <Wind className="h-5 w-5 text-green-600" />
    case 'air_scrubber':
      return <Zap className="h-5 w-5 text-amber-600" />
    case 'heater':
      return <Thermometer className="h-5 w-5 text-red-600" />
    case 'monitor':
      return <AlertCircle className="h-5 w-5 text-purple-600" />
    default:
      return null
  }
}

/**
 * Calculate equipment recommendations based on IICRC classification
 */
const calculateEquipmentNeeds = (props: EquipmentRecommendationsProps): EquipmentRecommendation[] => {
  const {
    iicrcCategory,
    iicrcClass,
    affectedArea,
    ceilingHeight = 8,
    temperatureCelsius = 20,
    humidityCurrent = 60,
    isUrgent = false,
  } = props

  const recommendations: EquipmentRecommendation[] = []
  const cubicFeet = affectedArea * ceilingHeight

  // Air Movers (LGR fan spec)
  // Per IICRC S500: 1 air mover per 75-200 sq ft depending on class
  const airMoverRatio = iicrcClass <= 2 ? 150 : iicrcClass === 3 ? 100 : 75
  const airMoverCount = Math.ceil(affectedArea / airMoverRatio)

  recommendations.push({
    type: 'air_mover',
    quantity: airMoverCount,
    specification: {
      type: 'High-velocity air mover',
      cfm: 4000,
      wattage: 1200,
    },
    dailyRentalCost: 50 * airMoverCount,
    estimatedDaysNeeded: iicrcClass >= 3 ? 5 : 3,
    totalEstimatedCost: 50 * airMoverCount * (iicrcClass >= 3 ? 5 : 3),
    reasoning: `Class ${iicrcClass} damage requires ${airMoverCount} air movers for optimal air circulation per IICRC S500 s6`,
    standardsReference: 'IICRC S500 Section 6 - Equipment Specifications',
  })

  // Dehumidifiers
  // Per IICRC S500: 1 LGR per 1250 cu ft OR 1 conventional per 600 cu ft
  const lgr = cubicFeet <= 1250
  const dehumidifierCount = lgr ? Math.ceil(cubicFeet / 1250) : Math.ceil(cubicFeet / 600)

  recommendations.push({
    type: 'dehumidifier',
    quantity: dehumidifierCount,
    specification: {
      type: lgr ? 'LGR (Low Grain Refrigerant)' : 'Conventional',
      capacity: lgr ? 200 : 150,
    },
    dailyRentalCost: lgr ? 75 * dehumidifierCount : 50 * dehumidifierCount,
    estimatedDaysNeeded: iicrcClass === 1 ? 3 : iicrcClass === 2 ? 4 : 7,
    totalEstimatedCost: (lgr ? 75 : 50) * dehumidifierCount * (iicrcClass === 1 ? 3 : iicrcClass === 2 ? 4 : 7),
    reasoning: `${lgr ? 'LGR' : 'Conventional'} dehumidifier(s) for ${cubicFeet} cu ft space per IICRC S500 s6. LGR preferred for humid climates.`,
    standardsReference: 'IICRC S500 Section 6 - Dehumidification Equipment',
  })

  // Air Scrubbers (for Category 2 or 3 water only)
  if (iicrcCategory >= 2) {
    // 1 air scrubber per 500 sq ft for contaminated water
    const scrubberCount = Math.ceil(affectedArea / 500)

    recommendations.push({
      type: 'air_scrubber',
      quantity: scrubberCount,
      specification: {
        type: 'HEPA air scrubber',
        cfm: 3000,
      },
      dailyRentalCost: 100 * scrubberCount,
      estimatedDaysNeeded: iicrcCategory === 2 ? 3 : 5,
      totalEstimatedCost: 100 * scrubberCount * (iicrcCategory === 2 ? 3 : 5),
      reasoning: `${iicrcCategory === 2 ? 'Grey' : 'Black'} water contamination requires air scrubbers for safety per IICRC S500 s8 and WHS Act 2011`,
      standardsReference: 'IICRC S500 Section 8 - Contamination Management',
    })
  }

  // Heaters (if temperature is below 21°C)
  if (temperatureCelsius < 21) {
    const heaterCount = affectedArea > 500 ? 2 : 1

    recommendations.push({
      type: 'heater',
      quantity: heaterCount,
      specification: {
        type: 'Industrial drying heater',
        wattage: 5000,
      },
      dailyRentalCost: 75 * heaterCount,
      estimatedDaysNeeded: iicrcClass >= 3 ? 7 : 5,
      totalEstimatedCost: 75 * heaterCount * (iicrcClass >= 3 ? 7 : 5),
      reasoning: `Cool temperature (${temperatureCelsius}°C) reduces evaporation. Heaters will improve drying efficiency per IICRC S500 s7`,
      standardsReference: 'IICRC S500 Section 7 - Environmental Conditions',
    })
  }

  // Monitoring Equipment
  recommendations.push({
    type: 'monitor',
    quantity: 1,
    specification: {
      type: 'Moisture meter and hygrometer',
    },
    dailyRentalCost: 25,
    estimatedDaysNeeded: iicrcClass === 1 ? 3 : iicrcClass === 2 ? 4 : 7,
    totalEstimatedCost: 25 * (iicrcClass === 1 ? 3 : iicrcClass === 2 ? 4 : 7),
    reasoning: `Continuous moisture and humidity monitoring required per IICRC S500 s7 to track drying progress`,
    standardsReference: 'IICRC S500 Section 7 - Monitoring Standards',
  })

  return recommendations
}

/**
 * Equipment Recommendations Component
 */
export function EquipmentRecommendations({
  iicrcCategory,
  iicrcClass,
  affectedArea,
  ceilingHeight,
  temperatureCelsius,
  humidityCurrent,
  isUrgent,
}: EquipmentRecommendationsProps) {
  const recommendations = useMemo(
    () =>
      calculateEquipmentNeeds({
        iicrcCategory,
        iicrcClass,
        affectedArea,
        ceilingHeight,
        temperatureCelsius,
        humidityCurrent,
        isUrgent,
      }),
    [iicrcCategory, iicrcClass, affectedArea, ceilingHeight, temperatureCelsius, humidityCurrent, isUrgent]
  )

  const totalCost = recommendations.reduce((sum, r) => sum + r.totalEstimatedCost, 0)
  const totalDays = Math.max(...recommendations.map((r) => r.estimatedDaysNeeded))

  const equipmentByType = recommendations.reduce(
    (acc, r) => {
      if (!acc[r.type]) {
        acc[r.type] = []
      }
      acc[r.type].push(r)
      return acc
    },
    {} as Record<string, EquipmentRecommendation[]>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Equipment Recommendations
        </CardTitle>
        <CardDescription>
          Based on IICRC S500 classification (Category {iicrcCategory}, Class {iicrcClass})
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Cost Summary */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div>
            <p className="text-sm text-amber-700 font-semibold">Estimated Total Cost</p>
            <p className="text-2xl font-bold text-amber-900">${totalCost.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-amber-700 font-semibold">Estimated Duration</p>
            <p className="text-2xl font-bold text-amber-900">{totalDays} days</p>
          </div>
        </div>

        {/* Urgent Alert */}
        {isUrgent && (
          <Alert className="bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">
              Urgent situation detected. Consider expedited equipment delivery and increased crew deployment.
            </AlertDescription>
          </Alert>
        )}

        {/* Equipment by Category */}
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-4">
            {Object.entries(equipmentByType).map(([type, items]) => (
              <div key={type} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getEquipmentIcon(type)}
                    <div>
                      <h4 className="font-semibold capitalize">{type.replace(/_/g, ' ')}</h4>
                      <p className="text-xs text-muted-foreground">
                        {items.reduce((sum, r) => sum + r.quantity, 0)} unit(s)
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">
                      ${items.reduce((sum, r) => sum + r.totalEstimatedCost, 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.max(...items.map((r) => r.estimatedDaysNeeded))} days
                    </p>
                  </div>
                </div>

                {/* Reasoning */}
                {items.map((item, idx) => (
                  <div key={idx} className="text-sm text-muted-foreground mb-2">
                    <p>• {item.reasoning}</p>
                  </div>
                ))}
              </div>
            ))}
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-4">
            {recommendations.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getEquipmentIcon(item.type)}
                    <div>
                      <h4 className="font-semibold capitalize">{item.type.replace(/_/g, ' ')}</h4>
                      <p className="text-xs text-muted-foreground">{item.specification?.type}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">{item.quantity} unit(s)</Badge>
                </div>

                {/* Specifications */}
                {item.specification && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {item.specification.capacity && (
                      <div>
                        <p className="text-muted-foreground">Capacity</p>
                        <p className="font-semibold">{item.specification.capacity} pints/day</p>
                      </div>
                    )}
                    {item.specification.wattage && (
                      <div>
                        <p className="text-muted-foreground">Wattage</p>
                        <p className="font-semibold">{item.specification.wattage} W</p>
                      </div>
                    )}
                    {item.specification.cfm && (
                      <div>
                        <p className="text-muted-foreground">CFM</p>
                        <p className="font-semibold">{item.specification.cfm}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Costs */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded text-sm">
                  <div>
                    <p className="text-muted-foreground">Daily Cost</p>
                    <p className="font-semibold">${item.dailyRentalCost}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Days Needed</p>
                    <p className="font-semibold">{item.estimatedDaysNeeded}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-semibold">${item.totalEstimatedCost.toLocaleString()}</p>
                  </div>
                </div>

                {/* Reasoning & Standards */}
                <div className="space-y-2">
                  <p className="text-sm">{item.reasoning}</p>
                  <Badge variant="outline" className="text-xs">
                    {item.standardsReference}
                  </Badge>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-4">
            <div className="space-y-3">
              {recommendations.map((item, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {getEquipmentIcon(item.type)}
                    <div className="flex-1">
                      <h4 className="font-semibold capitalize">{item.type.replace(/_/g, ' ')}</h4>
                      <p className="text-sm text-muted-foreground">{item.quantity} unit(s)</p>
                    </div>
                  </div>

                  {/* Timeline bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Day 1</span>
                      <span>Day {item.estimatedDaysNeeded}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(item.estimatedDaysNeeded / totalDays) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs font-semibold text-gray-700">{item.estimatedDaysNeeded} days rental</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Overall project timeline */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-semibold text-blue-900">Overall Project Timeline</p>
              <p className="text-xs text-blue-700 mt-1">
                Total estimated duration: {totalDays} days ({Math.ceil(totalDays / 7)} weeks)
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Standards Reference */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="font-semibold text-sm mb-2">Standards & Compliance</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• All recommendations per IICRC S500 Standard & Reference Guide</li>
            <li>• Equipment meets AS/NZS electrical safety standards</li>
            <li>• Drying procedures comply with NCC 2025 building codes</li>
            <li>• Safety protocols per WHS Act 2011</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
