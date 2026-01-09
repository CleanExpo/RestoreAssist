'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DollarSign, TrendingUp } from 'lucide-react'

/**
 * Cost breakdown interface
 * All values in AUD dollars
 */
export interface CostBreakdown {
  labourCost?: number
  equipmentRentalCost?: number
  materialsCost?: number
  subcontractorCost?: number
  travelLogisticsCost?: number
  wasteRemovalCost?: number
}

interface GSTBreakdownCardProps {
  /** Cost breakdown data */
  costs: CostBreakdown
  /** Optional title override */
  title?: string
  /** Show detailed breakdown or compact view */
  detailed?: boolean
  /** GST rate (default 10% for Australia) */
  gstRate?: number
  /** Optional callback when total changes */
  onTotalChange?: (total: number) => void
  /** Show currency symbol (default true) */
  showCurrencySymbol?: boolean
  /** Highlight the total */
  highlightTotal?: boolean
}

/**
 * GST Breakdown Card Component
 *
 * Displays cost breakdown for Australian inspection reports with automatic
 * GST calculation (10% for Australia).
 *
 * Features:
 * - Auto-calculates subtotal from all cost categories
 * - Auto-calculates GST (10% standard Australian rate)
 * - Auto-calculates total (subtotal + GST)
 * - Mobile-responsive design
 * - AUD currency formatting
 * - Detailed or compact view
 * - Color-coded rows
 */
export function GSTBreakdownCard({
  costs,
  title = 'Cost Breakdown',
  detailed = true,
  gstRate = 0.10, // 10% Australian GST
  onTotalChange,
  showCurrencySymbol = true,
  highlightTotal = true,
}: GSTBreakdownCardProps) {
  // Calculate subtotal from all cost categories
  const subtotalExGST =
    (costs.labourCost ?? 0) +
    (costs.equipmentRentalCost ?? 0) +
    (costs.materialsCost ?? 0) +
    (costs.subcontractorCost ?? 0) +
    (costs.travelLogisticsCost ?? 0) +
    (costs.wasteRemovalCost ?? 0)

  // Calculate GST (10% for Australia)
  const gstAmount = subtotalExGST * gstRate

  // Calculate total including GST
  const totalIncGST = subtotalExGST + gstAmount

  // Notify parent component of total change if callback provided
  React.useEffect(() => {
    if (onTotalChange) {
      onTotalChange(totalIncGST)
    }
  }, [totalIncGST, onTotalChange])

  /**
   * Format number as AUD currency
   */
  const formatAUD = (value: number): string => {
    const formatter = new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return formatter.format(value)
  }

  /**
   * Format as compact currency if showCurrencySymbol is false
   */
  const formatAmount = (value: number): string => {
    if (showCurrencySymbol) {
      return formatAUD(value)
    }
    return value.toLocaleString('en-AU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  /**
   * Render cost row
   */
  const CostRow = ({
    label,
    amount,
    icon: Icon,
    className = '',
    isSubtotal = false,
    isTaxRow = false,
    isTotal = false,
  }: {
    label: string
    amount: number
    icon?: React.ComponentType<{ className?: string }>
    className?: string
    isSubtotal?: boolean
    isTaxRow?: boolean
    isTotal?: boolean
  }) => {
    const bgColor = isTotal
      ? 'bg-green-50'
      : isTaxRow
        ? 'bg-orange-50'
        : isSubtotal
          ? 'bg-gray-100'
          : 'bg-white'

    const borderColor = isTotal ? 'border-t-2 border-green-300' : isSubtotal ? 'border-t border-gray-300' : ''

    const textWeight = isTotal || isSubtotal ? 'font-semibold' : 'font-medium'

    const textColor = isTotal ? 'text-green-700' : isTaxRow ? 'text-orange-700' : 'text-gray-900'

    return (
      <div className={`flex items-center justify-between py-3 px-4 ${bgColor} ${borderColor} ${className}`}>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-gray-600" />}
          <span className={`text-sm ${textWeight} ${textColor}`}>{label}</span>
        </div>
        <span className={`text-sm ${textWeight} ${textColor} tabular-nums`}>{formatAmount(amount)}</span>
      </div>
    )
  }

  return (
    <Card className="w-full">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              {title}
            </CardTitle>
            {detailed && (
              <CardDescription>Australian costs with 10% GST included</CardDescription>
            )}
          </div>
          {subtotalExGST > 0 && (
            <Badge variant="outline" className="bg-green-50 text-green-700">
              {showCurrencySymbol ? formatAUD(totalIncGST) : 'Total calculated'}
            </Badge>
          )}
        </div>
      </CardHeader>

      {/* Cost Breakdown Table */}
      <CardContent className="p-0">
        <div className="divide-y divide-gray-200">
          {/* Labour */}
          {detailed && (costs.labourCost ?? 0) > 0 && (
            <CostRow
              label="Labour Costs"
              amount={costs.labourCost ?? 0}
              className="hover:bg-gray-50 transition"
            />
          )}

          {/* Equipment Rental */}
          {detailed && (costs.equipmentRentalCost ?? 0) > 0 && (
            <CostRow
              label="Equipment Rental"
              amount={costs.equipmentRentalCost ?? 0}
              className="hover:bg-gray-50 transition"
            />
          )}

          {/* Materials */}
          {detailed && (costs.materialsCost ?? 0) > 0 && (
            <CostRow
              label="Materials"
              amount={costs.materialsCost ?? 0}
              className="hover:bg-gray-50 transition"
            />
          )}

          {/* Subcontractor */}
          {detailed && (costs.subcontractorCost ?? 0) > 0 && (
            <CostRow
              label="Subcontractor Costs"
              amount={costs.subcontractorCost ?? 0}
              className="hover:bg-gray-50 transition"
            />
          )}

          {/* Travel & Logistics */}
          {detailed && (costs.travelLogisticsCost ?? 0) > 0 && (
            <CostRow
              label="Travel & Logistics"
              amount={costs.travelLogisticsCost ?? 0}
              className="hover:bg-gray-50 transition"
            />
          )}

          {/* Waste Removal */}
          {detailed && (costs.wasteRemovalCost ?? 0) > 0 && (
            <CostRow
              label="Waste Removal"
              amount={costs.wasteRemovalCost ?? 0}
              className="hover:bg-gray-50 transition"
            />
          )}

          {/* Subtotal (Ex GST) */}
          {subtotalExGST > 0 && (
            <CostRow
              label="Subtotal (Ex GST)"
              amount={subtotalExGST}
              isSubtotal={true}
              className="font-semibold"
            />
          )}

          {/* GST (10%) */}
          {gstAmount > 0 && (
            <CostRow
              label={`GST (${(gstRate * 100).toFixed(0)}%)`}
              amount={gstAmount}
              icon={TrendingUp}
              isTaxRow={true}
              className="bg-orange-50"
            />
          )}

          {/* Total (Inc GST) */}
          {totalIncGST > 0 && (
            <CostRow
              label="Total (Inc GST)"
              amount={totalIncGST}
              isTotal={highlightTotal}
              className={highlightTotal ? 'border-t-2 border-b' : 'border-t'}
            />
          )}

          {/* Empty State */}
          {subtotalExGST === 0 && (
            <div className="py-8 px-4 text-center text-gray-500">
              <p className="text-sm">No costs entered yet</p>
            </div>
          )}
        </div>
      </CardContent>

      {/* Footer with info */}
      {detailed && subtotalExGST > 0 && (
        <div className="px-4 py-3 bg-gray-50 text-xs text-gray-600 border-t">
          <p>
            💡 GST calculated at <strong>{(gstRate * 100).toFixed(0)}%</strong> on subtotal of{' '}
            <strong>{formatAmount(subtotalExGST)}</strong>
          </p>
        </div>
      )}
    </Card>
  )
}

/**
 * Compact variant - minimal display
 * Useful for reports where space is limited
 */
export function GSTBreakdownCardCompact(props: GSTBreakdownCardProps) {
  return <GSTBreakdownCard {...props} detailed={false} />
}

/**
 * Summary statistics helper
 * Returns calculated totals for cost breakdown
 */
export function calculateCostBreakdownTotals(costs: CostBreakdown, gstRate: number = 0.10) {
  const subtotalExGST =
    (costs.labourCost ?? 0) +
    (costs.equipmentRentalCost ?? 0) +
    (costs.materialsCost ?? 0) +
    (costs.subcontractorCost ?? 0) +
    (costs.travelLogisticsCost ?? 0) +
    (costs.wasteRemovalCost ?? 0)

  const gstAmount = subtotalExGST * gstRate
  const totalIncGST = subtotalExGST + gstAmount

  return {
    subtotalExGST,
    gstAmount,
    totalIncGST,
    gstRate,
    formattedSubtotal: new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(subtotalExGST),
    formattedGST: new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(gstAmount),
    formattedTotal: new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(totalIncGST),
  }
}

export default GSTBreakdownCard
