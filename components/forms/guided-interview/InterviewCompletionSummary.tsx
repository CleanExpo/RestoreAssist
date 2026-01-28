/**
 * Interview Completion Summary Component
 * Displays detailed breakdown of auto-populated fields
 * Shows confidence levels, field categories, and submission readiness
 */

'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertCircle, TrendingUp, Copy, Download } from 'lucide-react'
import type { MergeResult, FormField } from '@/lib/forms/interview-form-merger'

interface InterviewCompletionSummaryProps {
  mergeResult: MergeResult
  onContinue?: () => void
  onExport?: () => void
  showActions?: boolean
}

/**
 * Get badge variant based on confidence level
 */
function getConfidenceBadgeVariant(
  confidence: number
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (confidence >= 90) return 'default'
  if (confidence >= 75) return 'secondary'
  return 'destructive'
}

/**
 * Format confidence percentage
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence)}%`
}

/**
 * Interview Completion Summary Component
 */
export function InterviewCompletionSummary({
  mergeResult,
  onContinue,
  onExport,
  showActions = true,
}: InterviewCompletionSummaryProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const { statistics, mergedFields, addedFields, updatedFields, conflictedFields } = mergeResult

  /**
   * Copy field value to clipboard
   */
  const copyToClipboard = (fieldId: string, value: any) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    navigator.clipboard.writeText(text)
    setCopiedField(fieldId)
    setTimeout(() => setCopiedField(null), 2000)
  }

  /**
   * Get field categories
   */
  const getFieldCategories = (): Record<string, FormField[]> => {
    const categories: Record<string, FormField[]> = {
      'Property Information': [],
      'Technician Details': [],
      'Environmental Conditions': [],
      'Damage Assessment': [],
      'IICRC Classification': [],
      'Other': [],
    }

    // Process mergedFields
    Object.entries(mergedFields).forEach(([fieldId, field]) => {
      const category = categorizeField(fieldId)
      if (!categories[category]) {
        categories[category] = []
      }
      // Ensure field has id property
      const fieldWithId: FormField = {
        ...field,
        id: fieldId,
      }
      categories[category].push(fieldWithId)
    })

    // Also include addedFields that might not be in mergedFields yet
    addedFields.forEach((fieldId) => {
      if (!mergedFields[fieldId]) {
        const category = categorizeField(fieldId)
        if (!categories[category]) {
          categories[category] = []
        }
        // Create a field entry for added fields
        categories[category].push({
          id: fieldId,
          value: 'Auto-populated from interview',
          source: 'interview',
          metadata: {
            interviewConfidence: statistics.averageConfidence,
          },
        })
      }
    })

    return categories
  }

  /**
   * Categorize field by ID
   */
  const categorizeField = (fieldId: string): string => {
    const lowerFieldId = fieldId.toLowerCase()

    // Property Information
    if (
      lowerFieldId.includes('property') ||
      lowerFieldId.includes('address') ||
      lowerFieldId.includes('postcode') ||
      lowerFieldId.includes('location') ||
      lowerFieldId.includes('site') ||
      lowerFieldId.includes('client')
    ) {
      return 'Property Information'
    }
    
    // Technician Details
    if (
      lowerFieldId.includes('technician') ||
      lowerFieldId.includes('inspector') ||
      lowerFieldId.includes('inspectedby') ||
      lowerFieldId.includes('inspected_by') ||
      (lowerFieldId.includes('name') && !lowerFieldId.includes('property')) ||
      (lowerFieldId.includes('date') && !lowerFieldId.includes('damage'))
    ) {
      return 'Technician Details'
    }
    
    // Environmental Conditions
    if (
      lowerFieldId.includes('temperature') ||
      lowerFieldId.includes('humidity') ||
      lowerFieldId.includes('environment') ||
      lowerFieldId.includes('ambient') ||
      lowerFieldId.includes('relative') ||
      lowerFieldId.includes('rh') ||
      lowerFieldId.includes('temp')
    ) {
      return 'Environmental Conditions'
    }
    
    // Damage Assessment
    if (
      lowerFieldId.includes('damage') ||
      lowerFieldId.includes('area') ||
      lowerFieldId.includes('material') ||
      lowerFieldId.includes('moisture') ||
      lowerFieldId.includes('affected') ||
      lowerFieldId.includes('scope') ||
      lowerFieldId.includes('extent')
    ) {
      return 'Damage Assessment'
    }
    
    // IICRC Classification
    if (
      lowerFieldId.includes('iicrc') ||
      lowerFieldId.includes('category') ||
      lowerFieldId.includes('class') ||
      lowerFieldId.includes('watercategory') ||
      lowerFieldId.includes('water_category') ||
      lowerFieldId.includes('classcategory') ||
      lowerFieldId.includes('class_category')
    ) {
      return 'IICRC Classification'
    }

    return 'Other'
  }

  const categories = getFieldCategories()
  const completionPercentage =
    statistics.totalFieldsMerged > 0
      ? Math.round((statistics.totalFieldsMerged / (statistics.totalFieldsMerged + 5)) * 100)
      : 0

  return (
    <div className="space-y-6">
      {/* Overall Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Interview Summary
          </CardTitle>
          <CardDescription>
            Overview of auto-populated fields and form completion status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Completion Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-900">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Fields Merged</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{statistics.totalFieldsMerged}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-900">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">New Fields Added</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{statistics.newFieldsAdded}</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4 border border-amber-200 dark:border-amber-900">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Fields Updated</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{statistics.fieldsUpdated}</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4 border border-purple-200 dark:border-purple-900">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg. Confidence</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatConfidence(statistics.averageConfidence)}
              </p>
            </div>
          </div>

          {/* Completion Progress */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Form Completion</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{completionPercentage}%</p>
            </div>
            <Progress value={completionPercentage} className="h-2" />
          </div>

          {/* Conflicts Alert */}
          {conflictedFields.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">
                    {conflictedFields.length} field conflict{conflictedFields.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    Existing values were preserved. Review and override if needed.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Fields by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Populated Fields</CardTitle>
          <CardDescription>
            Review each field that was auto-populated from the interview
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs 
            defaultValue={Object.entries(categories).find(([_, fields]) => fields.length > 0)?.[0] || Object.keys(categories)[0]} 
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 mb-4">
              {Object.entries(categories).map(([category, fields]) => (
                <TabsTrigger 
                  key={category} 
                  value={category} 
                  className="text-xs"
                  disabled={fields.length === 0}
                >
                  <span className="hidden sm:inline">{category}</span>
                  <span className="sm:hidden">{category.split(' ')[0]}</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {fields.length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {Object.entries(categories).map(([category, fields]) => (
              <TabsContent key={category} value={category} className="space-y-3">
                {fields.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No fields in this category</p>
                  </div>
                ) : (
                  fields.map((field) => (
                    <div
                      key={field.id}
                      className="flex items-start justify-between gap-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">
                          {field.id}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 break-words">
                          {typeof field.value === 'string'
                            ? field.value
                            : typeof field.value === 'object' && field.value !== null
                            ? JSON.stringify(field.value, null, 2)
                            : String(field.value ?? 'N/A')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {field.metadata?.interviewConfidence && (
                          <Badge
                            variant={getConfidenceBadgeVariant(
                              field.metadata.interviewConfidence
                            )}
                            className="whitespace-nowrap"
                          >
                            {formatConfidence(field.metadata.interviewConfidence)}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(field.id, field.value)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Copy to clipboard"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Conflicts Detail */}
      {conflictedFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Field Conflicts</CardTitle>
            <CardDescription>
              These fields had existing values that were preserved during merge
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {conflictedFields.map((conflict) => (
                <div key={conflict.fieldId} className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900 mb-2">{conflict.fieldId}</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Existing Value</p>
                      <p className="font-mono text-gray-900 mt-1 break-words">
                        {conflict.existingValue}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Interview Value</p>
                      <p className="font-mono text-gray-900 mt-1 break-words">
                        {conflict.interviewValue}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {showActions && (
        <div className="flex gap-4 justify-between">
          <Button 
            variant="outline" 
            onClick={onExport || (() => console.warn('Export handler not provided'))} 
            className="gap-2"
            disabled={!onExport}
          >
            <Download className="h-4 w-4" />
            Export Summary
          </Button>
          <Button 
            onClick={onContinue || (() => console.warn('Continue handler not provided'))} 
            className="gap-2"
            disabled={!onContinue}
          >
            <CheckCircle2 className="h-4 w-4" />
            Continue to Form
          </Button>
        </div>
      )}
    </div>
  )
}
