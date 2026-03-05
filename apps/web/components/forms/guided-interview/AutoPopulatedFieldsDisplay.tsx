/**
 * Auto-Populated Fields Display Component
 * Shows which form fields were automatically populated from interview answers
 * Includes confidence scores and field values
 */

'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FieldPopulation {
  value: any
  confidence: number
}

interface AutoPopulatedFieldsDisplayProps {
  fields: Map<string, FieldPopulation>
  compact?: boolean
  maxFields?: number
}

/**
 * Get confidence color
 */
const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 95) return 'bg-green-50 border-green-200'
  if (confidence >= 85) return 'bg-blue-50 border-blue-200'
  if (confidence >= 70) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

/**
 * Get confidence badge color
 */
const getConfidenceBadgeColor = (confidence: number): 'default' | 'secondary' | 'destructive' => {
  if (confidence >= 95) return 'default'
  if (confidence >= 85) return 'secondary'
  return 'destructive'
}

/**
 * Format field value for display
 */
const formatFieldValue = (value: any): string => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Auto-Populated Fields Display Component
 */
export function AutoPopulatedFieldsDisplay({
  fields,
  compact = false,
  maxFields = Infinity,
}: AutoPopulatedFieldsDisplayProps) {
  const [expanded, setExpanded] = useState(!compact)

  const sortedFields = useMemo(() => {
    const arr = Array.from(fields.entries())
      .sort((a, b) => b[1].confidence - a[1].confidence)
      .slice(0, maxFields)
    return arr
  }, [fields, maxFields])

  const stats = useMemo(() => {
    const all = Array.from(fields.values())
    const avgConfidence =
      all.length > 0 ? Math.round(all.reduce((sum, f) => sum + f.confidence, 0) / all.length) : 0
    const highConfidence = all.filter((f) => f.confidence >= 90).length
    const mediumConfidence = all.filter((f) => f.confidence >= 75 && f.confidence < 90).length
    const lowConfidence = all.filter((f) => f.confidence < 75).length

    return {
      total: all.length,
      avgConfidence,
      highConfidence,
      mediumConfidence,
      lowConfidence,
    }
  }, [fields])

  if (sortedFields.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            No fields auto-populated yet. Answer questions to populate form fields.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Auto-Populated Fields
            </CardTitle>
            <CardDescription>
              {stats.total} field{stats.total !== 1 ? 's' : ''} populated with {stats.avgConfidence}
              % average confidence
            </CardDescription>
          </div>

          {compact && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="gap-1"
            >
              {expanded ? 'Hide' : 'Show'}
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`} />
            </Button>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Confidence summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-2xl font-bold text-green-700">{stats.highConfidence}</p>
              <p className="text-xs text-green-600">High (≥90%)</p>
            </div>
            <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-2xl font-bold text-blue-700">{stats.mediumConfidence}</p>
              <p className="text-xs text-blue-600">Medium (75-89%)</p>
            </div>
            <div className="text-center p-3 bg-amber-50 border border-amber-200 rounded">
              <p className="text-2xl font-bold text-amber-700">{stats.lowConfidence}</p>
              <p className="text-xs text-amber-600">Low (&lt;75%)</p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Fields list */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {sortedFields.map(([fieldId, field]) => (
              <div
                key={fieldId}
                className={`border rounded p-3 ${getConfidenceColor(field.confidence)}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs font-semibold text-gray-700 break-all">
                      {fieldId}
                    </p>
                  </div>
                  <Badge variant={getConfidenceBadgeColor(field.confidence)} className="shrink-0">
                    {field.confidence}%
                  </Badge>
                </div>

                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-900 break-words">
                    {formatFieldValue(field.value)}
                  </p>
                </div>

                <Progress value={field.confidence} className="h-1.5" />
              </div>
            ))}
          </div>

          {/* Show more button if truncated */}
          {fields.size > maxFields && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                // In real implementation, would expand to show all
              }}
            >
              Show all {fields.size} fields
            </Button>
          )}

          {/* Legend */}
          <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
            <p className="text-xs font-semibold text-gray-700 mb-2">Confidence Guide:</p>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>
                <span className="font-mono bg-white border border-green-200 px-2 py-0.5 rounded mr-2">
                  95-100%
                </span>
                Direct answer or high-confidence match
              </li>
              <li>
                <span className="font-mono bg-white border border-blue-200 px-2 py-0.5 rounded mr-2">
                  85-94%
                </span>
                Derived from answer or light transformation
              </li>
              <li>
                <span className="font-mono bg-white border border-amber-200 px-2 py-0.5 rounded mr-2">
                  70-84%
                </span>
                Uncertain answer or complex derivation
              </li>
              <li>
                <span className="font-mono bg-white border border-red-200 px-2 py-0.5 rounded mr-2">
                  &lt;70%
                </span>
                Review recommended before submitting
              </li>
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
