/**
 * Equipment Cost Calculator Component
 * Interactive calculator for equipment rental costs based on IICRC classification
 */

'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { EquipmentCostCalculator } from '@/lib/forms/calculations'
import { TrendingUp, DollarSign, Calendar, Users } from 'lucide-react'

interface EquipmentCostCalculatorProps {
  iicrcClass: number
  iicrcCategory: number
  initialSquareFootage?: number
  initialCeilingHeight?: number
  initialDurationDays?: number
  initialLaborCostPerDay?: number
  showSummaryOnly?: boolean
}

export function EquipmentCostCalculatorComponent({
  iicrcClass,
  iicrcCategory,
  initialSquareFootage = 100,
  initialCeilingHeight = 2.7,
  initialDurationDays = 5,
  initialLaborCostPerDay = 200,
  showSummaryOnly = false,
}: EquipmentCostCalculatorProps) {
  const [squareFootage, setSquareFootage] = useState(initialSquareFootage)
  const [ceilingHeight, setCeilingHeight] = useState(initialCeilingHeight)
  const [durationDays, setDurationDays] = useState(initialDurationDays)
  const [laborCostPerDay, setLaborCostPerDay] = useState(initialLaborCostPerDay)

  // Calculate costs
  const estimate = useMemo(
    () =>
      EquipmentCostCalculator.calculateEquipmentCosts(
        iicrcClass,
        iicrcCategory,
        squareFootage,
        ceilingHeight,
        durationDays,
        laborCostPerDay
      ),
    [iicrcClass, iicrcCategory, squareFootage, ceilingHeight, durationDays, laborCostPerDay]
  )

  const costRange = useMemo(
    () =>
      EquipmentCostCalculator.getCostEstimateRange(
        iicrcClass,
        iicrcCategory,
        squareFootage,
        ceilingHeight,
        laborCostPerDay
      ),
    [iicrcClass, iicrcCategory, squareFootage, ceilingHeight, laborCostPerDay]
  )

  if (showSummaryOnly) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Estimated Cost
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-50 rounded-lg p-6 text-center">
            <p className="text-sm font-medium text-gray-600 mb-2">Total Estimated Cost</p>
            <p className="text-4xl font-bold text-green-600">
              {EquipmentCostCalculator.formatCost(estimate.total)}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              {estimate.durationDays} days | {estimate.equipment.length} equipment types
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-600">Equipment</p>
              <p className="text-lg font-bold text-gray-900">
                {EquipmentCostCalculator.formatCost(estimate.breakdown.equipmentCost)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-600">Labor</p>
              <p className="text-lg font-bold text-gray-900">
                {EquipmentCostCalculator.formatCost(estimate.breakdown.laborCost)}
              </p>
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">
            <p className="font-medium mb-1">Cost Range</p>
            <p>
              {EquipmentCostCalculator.formatCost(costRange.minCost)} -{' '}
              {EquipmentCostCalculator.formatCost(costRange.maxCost)}
            </p>
            <p className="text-xs">{costRange.minDays}-{costRange.maxDays} day project</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Tabs defaultValue="calculator" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="calculator">Calculator</TabsTrigger>
        <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
      </TabsList>

      {/* Calculator Tab */}
      <TabsContent value="calculator" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Equipment Cost Calculator
            </CardTitle>
            <CardDescription>
              Adjust parameters to get accurate cost estimates for this water damage project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Affected Area */}
            <div className="space-y-2">
              <Label htmlFor="squareFootage">Affected Square Footage</Label>
              <div className="flex gap-2">
                <Input
                  id="squareFootage"
                  type="number"
                  min="1"
                  value={squareFootage}
                  onChange={(e) => setSquareFootage(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1"
                />
                <span className="flex items-center px-3 bg-gray-100 rounded-md text-sm text-gray-600">
                  sq ft
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Cubicage: {Math.round(squareFootage * ceilingHeight)} cubic feet
              </p>
            </div>

            {/* Ceiling Height */}
            <div className="space-y-2">
              <Label htmlFor="ceilingHeight">Ceiling Height</Label>
              <div className="flex gap-2">
                <Input
                  id="ceilingHeight"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={ceilingHeight}
                  onChange={(e) => setCeilingHeight(Math.max(0.1, parseFloat(e.target.value) || 2.7))}
                  className="flex-1"
                />
                <span className="flex items-center px-3 bg-gray-100 rounded-md text-sm text-gray-600">
                  m
                </span>
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label htmlFor="duration">Drying Duration</Label>
              <div className="flex gap-2">
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1"
                />
                <span className="flex items-center px-3 bg-gray-100 rounded-md text-sm text-gray-600">
                  days
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Range: {costRange.minDays}-{costRange.maxDays} days (typical for Class {iicrcClass})
              </p>
            </div>

            {/* Labor Cost */}
            <div className="space-y-2">
              <Label htmlFor="laborCost">Daily Labor Rate</Label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 bg-gray-100 rounded-md text-sm text-gray-600">
                  $
                </span>
                <Input
                  id="laborCost"
                  type="number"
                  min="0"
                  value={laborCostPerDay}
                  onChange={(e) => setLaborCostPerDay(Math.max(0, parseInt(e.target.value) || 0))}
                  className="flex-1"
                />
                <span className="flex items-center px-3 bg-gray-100 rounded-md text-sm text-gray-600">
                  per day
                </span>
              </div>
            </div>

            {/* Cost Summary */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Total Estimated Cost</p>
                  <p className="text-3xl font-bold text-green-600">
                    {EquipmentCostCalculator.formatCost(estimate.total)}
                  </p>
                </div>
                <Badge className="bg-green-600 text-white">
                  {durationDays}d project
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Equipment</p>
                  <p className="font-semibold text-gray-900">
                    {EquipmentCostCalculator.formatCost(estimate.breakdown.equipmentCost)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Labor</p>
                  <p className="font-semibold text-gray-900">
                    {EquipmentCostCalculator.formatCost(estimate.breakdown.laborCost)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Contingency</p>
                  <p className="font-semibold text-gray-900">
                    {EquipmentCostCalculator.formatCost(estimate.contingency)}
                  </p>
                </div>
              </div>
            </div>

            {/* Cost Range Info */}
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                <strong>Typical Cost Range:</strong> {EquipmentCostCalculator.formatCost(costRange.minCost)} -{' '}
                {EquipmentCostCalculator.formatCost(costRange.maxCost)}{' '}
                ({costRange.minDays}-{costRange.maxDays} days)
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Breakdown Tab */}
      <TabsContent value="breakdown" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
            <CardDescription>
              Detailed equipment rental costs for {durationDays}-day project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Equipment Line Items */}
            <div>
              <h3 className="font-semibold mb-3">Equipment Rental ({durationDays} days)</h3>
              <div className="space-y-2">
                {estimate.equipment.map((item, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-600">
                        {EquipmentCostCalculator.formatCost(item.dailyRate)}/day × {durationDays} days
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {EquipmentCostCalculator.formatCost(item.subtotal)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Equipment Subtotal */}
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg mt-3 border border-blue-200">
                <p className="font-semibold text-gray-900">Equipment Subtotal</p>
                <p className="font-bold text-blue-600">
                  {EquipmentCostCalculator.formatCost(estimate.breakdown.equipmentCost)}
                </p>
              </div>
            </div>

            {/* Labor */}
            {estimate.laborCost > 0 && (
              <div>
                <h3 className="font-semibold mb-3 mt-4">Labor</h3>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Technician Labor</p>
                    <p className="text-xs text-gray-600">
                      {EquipmentCostCalculator.formatCost(laborCostPerDay)}/day × {durationDays} days
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {EquipmentCostCalculator.formatCost(estimate.laborCost)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="border-t pt-4 mt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span className="font-semibold">
                    {EquipmentCostCalculator.formatCost(estimate.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Contingency (10%)</span>
                  <span className="font-semibold">
                    {EquipmentCostCalculator.formatCost(estimate.contingency)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 bg-yellow-50 p-3 rounded-lg">
                  <span>Total Estimated Cost</span>
                  <span className="text-green-600">
                    {EquipmentCostCalculator.formatCost(estimate.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Info Alert */}
            <Alert>
              <Users className="h-4 w-4" />
              <AlertDescription>
                Costs are estimates based on IICRC S500 standards. Actual costs may vary based on
                vendor rates, equipment availability, and project complexity.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
