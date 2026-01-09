'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormRenderer } from '../renderer/FormRenderer'
import { FormSchema } from '@/lib/forms/form-types'
import { useFormSystem } from '../FormSystemProvider'
import { useToast } from '@/hooks/use-toast'

/**
 * SDSForm - Safety Data Sheet form
 * Captures chemical product safety information
 */
export function SDSForm({ reportId, onComplete }: { reportId?: string; onComplete?: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const { setContextData } = useFormSystem()
  const [isLoading, setIsLoading] = useState(false)

  // Safety Data Sheet form schema
  const sdsSchema: FormSchema = {
    id: 'sds-v1',
    version: 1,
    formType: 'SDS',
    sections: [
      {
        id: 'product-identification',
        title: 'Product Identification',
        description: 'Identify the chemical product',
        order: 0,
        fields: [
          {
            id: 'productName',
            type: 'text',
            label: 'Product Name',
            placeholder: 'Chemical product name',
            required: true,
            order: 0,
          },
          {
            id: 'productCode',
            type: 'text',
            label: 'Product Code/Number',
            placeholder: 'Manufacturer code',
            required: true,
            order: 1,
          },
          {
            id: 'manufacturerName',
            type: 'text',
            label: 'Manufacturer/Supplier Name',
            placeholder: 'Company name',
            required: true,
            order: 2,
          },
          {
            id: 'manufacturerPhone',
            type: 'phone',
            label: 'Manufacturer Contact Phone',
            placeholder: '+61 2 XXXX XXXX',
            required: true,
            order: 3,
          },
          {
            id: 'emergencyNumber',
            type: 'phone',
            label: 'Emergency Contact Number',
            placeholder: '+61 2 XXXX XXXX',
            required: true,
            order: 4,
          },
        ],
      },
      {
        id: 'hazard-identification',
        title: 'Hazard Identification',
        description: 'Identify hazards of the product',
        order: 1,
        fields: [
          {
            id: 'hazardClassification',
            type: 'multiselect',
            label: 'Hazard Classification',
            required: true,
            order: 0,
            options: [
              { value: 'acute-toxicity', label: 'Acute Toxicity' },
              { value: 'chronic-toxicity', label: 'Chronic Toxicity' },
              { value: 'skin-irritation', label: 'Skin Irritation' },
              { value: 'eye-irritation', label: 'Eye Irritation' },
              { value: 'respiratory-sensitizer', label: 'Respiratory Sensitizer' },
              { value: 'flammable', label: 'Flammable' },
              { value: 'oxidizing', label: 'Oxidizing' },
              { value: 'carcinogenic', label: 'Carcinogenic' },
              { value: 'mutagenic', label: 'Mutagenic' },
              { value: 'reproductive-hazard', label: 'Reproductive Hazard' },
              { value: 'environmental-hazard', label: 'Environmental Hazard' },
            ],
          },
          {
            id: 'signalWord',
            type: 'select',
            label: 'Signal Word',
            required: true,
            order: 1,
            options: [
              { value: 'danger', label: 'Danger' },
              { value: 'warning', label: 'Warning' },
              { value: 'caution', label: 'Caution' },
            ],
          },
          {
            id: 'hazardStatements',
            type: 'textarea',
            label: 'Hazard Statements',
            placeholder: 'List all applicable hazard statements (H-codes)...',
            required: true,
            order: 2,
            validation: { minLength: 10 },
          },
          {
            id: 'precautionarySummary',
            type: 'textarea',
            label: 'Precautionary Statement Summary',
            placeholder: 'Summary of prevention, response, storage, disposal...',
            required: true,
            order: 3,
            validation: { minLength: 10 },
          },
        ],
      },
      {
        id: 'composition-information',
        title: 'Composition/Information on Ingredients',
        description: 'Chemical composition details',
        order: 2,
        fields: [
          {
            id: 'activeIngredients',
            type: 'textarea',
            label: 'Active Ingredients',
            placeholder: 'List active chemical ingredients and percentages...',
            required: true,
            order: 0,
            validation: { minLength: 10 },
          },
          {
            id: 'hazardousComponents',
            type: 'textarea',
            label: 'Hazardous Components',
            placeholder: 'Identify hazardous components with their CAS numbers...',
            required: true,
            order: 1,
            validation: { minLength: 10 },
          },
          {
            id: 'concentrationPercentage',
            type: 'number',
            label: 'Concentration (%)',
            placeholder: '50',
            required: false,
            order: 2,
            validation: { min: 0, max: 100 },
          },
        ],
      },
      {
        id: 'first-aid-measures',
        title: 'First Aid Measures',
        description: 'Emergency response procedures',
        order: 3,
        fields: [
          {
            id: 'inhalationResponse',
            type: 'textarea',
            label: 'Inhalation Response',
            placeholder: 'Steps to take if product is inhaled...',
            required: true,
            order: 0,
            validation: { minLength: 10 },
          },
          {
            id: 'skinContactResponse',
            type: 'textarea',
            label: 'Skin Contact Response',
            placeholder: 'Steps to take for skin contact...',
            required: true,
            order: 1,
            validation: { minLength: 10 },
          },
          {
            id: 'eyeContactResponse',
            type: 'textarea',
            label: 'Eye Contact Response',
            placeholder: 'Steps to take for eye contact...',
            required: true,
            order: 2,
            validation: { minLength: 10 },
          },
          {
            id: 'ingestionResponse',
            type: 'textarea',
            label: 'Ingestion Response',
            placeholder: 'Steps to take if product is swallowed...',
            required: true,
            order: 3,
            validation: { minLength: 10 },
          },
        ],
      },
      {
        id: 'storage-disposal',
        title: 'Storage & Disposal',
        description: 'Safe storage and disposal information',
        order: 4,
        fields: [
          {
            id: 'storageConditions',
            type: 'textarea',
            label: 'Storage Conditions',
            placeholder: 'Temperature, humidity, ventilation requirements...',
            required: true,
            order: 0,
            validation: { minLength: 10 },
          },
          {
            id: 'disposalMethod',
            type: 'textarea',
            label: 'Disposal Method',
            placeholder: 'Safe disposal procedures and requirements...',
            required: true,
            order: 1,
            validation: { minLength: 10 },
          },
          {
            id: 'incompatibleMaterials',
            type: 'textarea',
            label: 'Incompatible Materials',
            placeholder: 'Materials to keep away from this product...',
            required: false,
            order: 2,
          },
        ],
      },
      {
        id: 'review-authorization',
        title: 'Review & Authorization',
        description: 'Review and sign off on SDS',
        order: 5,
        fields: [
          {
            id: 'reviewedBy',
            type: 'text',
            label: 'Reviewed By',
            placeholder: 'Safety Officer Name',
            required: true,
            order: 0,
          },
          {
            id: 'reviewDate',
            type: 'date',
            label: 'Review Date',
            required: true,
            order: 1,
          },
          {
            id: 'sdsRevisionNumber',
            type: 'text',
            label: 'SDS Revision Number',
            placeholder: 'Version 1.0',
            required: true,
            order: 2,
          },
          {
            id: 'additionalNotes',
            type: 'textarea',
            label: 'Additional Notes',
            placeholder: 'Any additional safety information or notes...',
            required: false,
            order: 3,
          },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  async function handleSubmit(formData: Record<string, any>) {
    setIsLoading(true)
    try {
      const response = await fetch('/api/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: 'sds-v1',
          formData,
          reportId,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit form')

      const result = await response.json()

      toast({
        title: 'Success',
        description: 'Safety Data Sheet submitted successfully',
      })

      if (onComplete) {
        onComplete()
      } else {
        router.push(`/dashboard/forms/${result.submissionId}`)
      }
    } catch (error) {
      console.error('Error submitting form:', error)
      toast({
        title: 'Error',
        description: 'Failed to submit SDS form',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSaveDraft(formData: Record<string, any>) {
    try {
      await fetch('/api/forms/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: 'sds-v1',
          formData,
          reportId,
        }),
      })

      toast({
        title: 'Draft Saved',
        description: 'Your SDS draft has been saved',
      })
    } catch (error) {
      console.error('Error saving draft:', error)
    }
  }

  return (
    <FormRenderer
      schema={sdsSchema}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
      isLoading={isLoading}
    />
  )
}
