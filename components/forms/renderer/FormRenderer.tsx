'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FormSchema, FormSection, FormField, FormContextData } from '@/lib/forms/form-types'
import { FormFieldRenderer } from './FormField'
import { FormProgress } from './FormProgress'
import { useFormContext } from '../FormSystemProvider'

interface FormRendererProps {
  schema: FormSchema
  onSubmit: (data: Record<string, any>) => Promise<void>
  onSaveDraft?: (data: Record<string, any>) => Promise<void>
  initialData?: Record<string, any>
  autoPopulateData?: FormContextData
  isLoading?: boolean
}

/**
 * FormRenderer - Main form rendering component
 * Handles multi-step forms with validation, auto-population, and field rendering
 */
export function FormRenderer({
  schema,
  onSubmit,
  onSaveDraft,
  initialData = {},
  autoPopulateData,
  isLoading = false,
}: FormRendererProps) {
  const contextData = useFormContext()
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const populationData = autoPopulateData || contextData

  // Sort sections by order
  const sections = useMemo(
    () => [...schema.sections].sort((a, b) => a.order - b.order),
    [schema.sections]
  )

  // Get visible sections based on conditions
  const visibleSections = useMemo(() => {
    return sections.filter((section) => {
      if (!section.conditional) return true

      const fieldValue = formValues[section.conditional.fieldId]
      return evaluateCondition(fieldValue, section.conditional)
    })
  }, [sections])

  const currentSection = visibleSections[currentStep]

  // Build dynamic schema from current section
  const sectionSchema = useMemo(() => {
    if (!currentSection) return z.object({})

    const shape: Record<string, any> = {}
    for (const field of currentSection.fields) {
      shape[field.id] = buildFieldSchema(field)
    }
    return z.object(shape)
  }, [currentSection])

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm({
    resolver: zodResolver(sectionSchema),
    defaultValues: { ...initialData, ...autoPopulateInitialData(currentSection, populationData) },
    mode: 'onBlur',
  })

  const formValues = watch()

  // Auto-populate field values
  function autoPopulateInitialData(
    section: FormSection | undefined,
    context: FormContextData
  ): Record<string, any> {
    if (!section) return {}

    const data: Record<string, any> = {}
    for (const field of section.fields) {
      if (field.autoPopulateFrom) {
        const value = getAutoPopulateValue(field.autoPopulateFrom, context)
        if (value) {
          data[field.id] = value
        }
      }
    }
    return data
  }

  // Build Zod schema for a field based on type and validation
  function buildFieldSchema(field: FormField): z.ZodType<any> {
    let schema: z.ZodType<any> = z.any()

    switch (field.type) {
      case 'text':
      case 'textarea':
        schema = z.string()
        if (field.validation?.minLength) schema = (schema as z.ZodString).min(field.validation.minLength)
        if (field.validation?.maxLength) schema = (schema as z.ZodString).max(field.validation.maxLength)
        if (field.validation?.pattern) schema = (schema as z.ZodString).regex(new RegExp(field.validation.pattern))
        break

      case 'email':
        schema = z.string().email()
        break

      case 'phone':
        schema = z.string().regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number')
        break

      case 'number':
        schema = z.number()
        if (field.validation?.min) schema = (schema as z.ZodNumber).min(field.validation.min)
        if (field.validation?.max) schema = (schema as z.ZodNumber).max(field.validation.max)
        break

      case 'date':
        schema = z.string().datetime()
        break

      case 'select':
      case 'radio':
        schema = z.string().refine(
          (val) => field.options?.some((opt) => opt.value === val),
          'Invalid selection'
        )
        break

      case 'multiselect':
      case 'checkbox':
        schema = z.array(z.string())
        break

      case 'file':
        schema = z.instanceof(File).optional()
        break

      case 'signature':
        schema = z.string().optional()
        break
    }

    if (field.required) {
      schema = schema.refine((val) => val !== null && val !== undefined && val !== '', {
        message: `${field.label} is required`,
      })
    } else {
      schema = schema.optional()
    }

    return schema
  }

  // Handle next step
  const handleNext = async () => {
    if (currentStep < visibleSections.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  // Handle previous step
  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Handle save draft
  const handleSaveDraft = async () => {
    if (onSaveDraft) {
      try {
        await onSaveDraft(formValues)
      } catch (error) {
        console.error('Failed to save draft:', error)
      }
    }
  }

  // Handle form submission
  const handleFormSubmit: SubmitHandler<Record<string, any>> = async (data) => {
    if (currentStep < visibleSections.length - 1) {
      await handleNext()
    } else {
      setIsSubmitting(true)
      try {
        await onSubmit(data)
      } catch (error) {
        console.error('Form submission failed:', error)
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  if (!currentSection) {
    return <div className="text-center py-8 text-gray-500">No form sections available</div>
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress indicator */}
      <FormProgress currentStep={currentStep} totalSteps={visibleSections.length} />

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
        {/* Section header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{currentSection.title}</h2>
          {currentSection.description && (
            <p className="mt-2 text-gray-600">{currentSection.description}</p>
          )}
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          {currentSection.fields
            .sort((a, b) => a.order - b.order)
            .map((field) => (
              <FormFieldRenderer
                key={field.id}
                field={field}
                register={register}
                error={errors[field.id]}
                value={formValues[field.id]}
              />
            ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0 || isLoading || isSubmitting}
          >
            Previous
          </Button>

          {onSaveDraft && (
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isLoading || isSubmitting}
            >
              Save Draft
            </Button>
          )}

          <div className="flex-1" />

          <Button
            type="submit"
            disabled={isLoading || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : currentStep === visibleSections.length - 1 ? 'Submit' : 'Next'}
          </Button>
        </div>
      </form>
    </div>
  )
}

/**
 * Helper: Evaluate conditional visibility
 */
function evaluateCondition(fieldValue: any, condition: any): boolean {
  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value
    case 'notEquals':
      return fieldValue !== condition.value
    case 'contains':
      return String(fieldValue).includes(String(condition.value))
    case 'greaterThan':
      return Number(fieldValue) > Number(condition.value)
    case 'lessThan':
      return Number(fieldValue) < Number(condition.value)
    default:
      return true
  }
}

/**
 * Helper: Get auto-populate value from context
 */
function getAutoPopulateValue(source: any, context: FormContextData): any {
  switch (source.type) {
    case 'user':
      return (context.user as any)?.[source.field]
    case 'client':
      return (context.client as any)?.[source.field]
    case 'report':
      return (context.report as any)?.[source.field]
    case 'business':
      return (context.user as any)?.[`business${source.field.charAt(0).toUpperCase()}${source.field.slice(1)}`]
    default:
      return undefined
  }
}
