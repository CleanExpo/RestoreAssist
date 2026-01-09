'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormRenderer } from '../renderer/FormRenderer'
import { FormSchema } from '@/lib/forms/form-types'
import { useFormSystem } from '../FormSystemProvider'
import { useToast } from '@/hooks/use-toast'

/**
 * JSAForm - Job Safety Analysis form
 * Identifies hazards and implements safety controls
 */
export function JSAForm({ reportId, onComplete }: { reportId?: string; onComplete?: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const { setContextData } = useFormSystem()
  const [isLoading, setIsLoading] = useState(false)

  // Job Safety Analysis form schema
  const jsaSchema: FormSchema = {
    id: 'jsa-v1',
    version: 1,
    formType: 'JSA',
    sections: [
      {
        id: 'job-identification',
        title: 'Job Identification',
        description: 'Identify the job and location',
        order: 0,
        fields: [
          {
            id: 'jobName',
            type: 'text',
            label: 'Job Name',
            placeholder: 'Water Damage Restoration',
            required: true,
            order: 0,
          },
          {
            id: 'jobLocation',
            type: 'text',
            label: 'Location',
            placeholder: '123 Main Street, Sydney NSW 2000',
            required: true,
            order: 1,
            autoPopulateFrom: { type: 'report', field: 'propertyAddress' },
          },
          {
            id: 'date',
            type: 'date',
            label: 'Date of JSA',
            required: true,
            order: 2,
          },
          {
            id: 'analyzedBy',
            type: 'text',
            label: 'JSA Prepared By',
            placeholder: 'Employee Name',
            required: true,
            order: 3,
          },
        ],
      },
      {
        id: 'hazard-identification',
        title: 'Hazard Identification',
        description: 'Identify potential hazards for each task',
        order: 1,
        fields: [
          {
            id: 'primaryTask',
            type: 'textarea',
            label: 'Primary Task/Procedure',
            placeholder: 'Describe the main task to be performed...',
            required: true,
            order: 0,
            validation: { minLength: 10 },
          },
          {
            id: 'hazards',
            type: 'textarea',
            label: 'Identified Hazards',
            placeholder: 'List all potential hazards (e.g., electrical, chemical, physical)...',
            required: true,
            order: 1,
            validation: { minLength: 10 },
          },
          {
            id: 'hazardCategories',
            type: 'multiselect',
            label: 'Hazard Categories',
            required: true,
            order: 2,
            options: [
              { value: 'physical', label: 'Physical Hazards' },
              { value: 'chemical', label: 'Chemical Hazards' },
              { value: 'biological', label: 'Biological Hazards' },
              { value: 'electrical', label: 'Electrical Hazards' },
              { value: 'ergonomic', label: 'Ergonomic Hazards' },
              { value: 'psychological', label: 'Psychological Hazards' },
              { value: 'environmental', label: 'Environmental Hazards' },
            ],
          },
          {
            id: 'riskLevel',
            type: 'select',
            label: 'Overall Risk Level',
            required: true,
            order: 3,
            options: [
              { value: 'low', label: 'Low Risk' },
              { value: 'medium', label: 'Medium Risk' },
              { value: 'high', label: 'High Risk' },
              { value: 'extreme', label: 'Extreme Risk' },
            ],
          },
        ],
      },
      {
        id: 'control-measures',
        title: 'Control Measures',
        description: 'Implement controls to minimize risk',
        order: 2,
        fields: [
          {
            id: 'engineeringControls',
            type: 'textarea',
            label: 'Engineering Controls',
            placeholder: 'Physical modifications to eliminate/reduce hazards...',
            required: true,
            order: 0,
            validation: { minLength: 5 },
          },
          {
            id: 'administrativeControls',
            type: 'textarea',
            label: 'Administrative Controls',
            placeholder: 'Work procedures, training, supervision...',
            required: true,
            order: 1,
            validation: { minLength: 5 },
          },
          {
            id: 'personalProtection',
            type: 'multiselect',
            label: 'Personal Protective Equipment (PPE)',
            required: true,
            order: 2,
            options: [
              { value: 'safety-helmet', label: 'Safety Helmet' },
              { value: 'safety-glasses', label: 'Safety Glasses' },
              { value: 'gloves', label: 'Gloves' },
              { value: 'respirator', label: 'Respirator' },
              { value: 'safety-boots', label: 'Safety Boots' },
              { value: 'hi-vis-clothing', label: 'Hi-Vis Clothing' },
              { value: 'ear-protection', label: 'Ear Protection' },
              { value: 'face-shield', label: 'Face Shield' },
            ],
          },
          {
            id: 'firstAid',
            type: 'textarea',
            label: 'First Aid Provisions',
            placeholder: 'First aid facilities and procedures...',
            required: true,
            order: 3,
            validation: { minLength: 5 },
          },
        ],
      },
      {
        id: 'authorization',
        title: 'Authorization & Review',
        description: 'Authorize and sign off on the JSA',
        order: 3,
        fields: [
          {
            id: 'supervisorName',
            type: 'text',
            label: 'Supervisor Name',
            placeholder: 'Supervisor Full Name',
            required: true,
            order: 0,
          },
          {
            id: 'supervisorSignature',
            type: 'signature',
            label: 'Supervisor Signature',
            required: true,
            order: 1,
          },
          {
            id: 'signatureDate',
            type: 'date',
            label: 'Date of Authorization',
            required: true,
            order: 2,
          },
          {
            id: 'reviewComments',
            type: 'textarea',
            label: 'Additional Comments or Notes',
            placeholder: 'Any additional information for the JSA...',
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
          templateId: 'jsa-v1',
          formData,
          reportId,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit form')

      const result = await response.json()

      toast({
        title: 'Success',
        description: 'Job Safety Analysis submitted successfully',
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
        description: 'Failed to submit JSA form',
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
          templateId: 'jsa-v1',
          formData,
          reportId,
        }),
      })

      toast({
        title: 'Draft Saved',
        description: 'Your JSA draft has been saved',
      })
    } catch (error) {
      console.error('Error saving draft:', error)
    }
  }

  return (
    <FormRenderer
      schema={jsaSchema}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
      isLoading={isLoading}
    />
  )
}
