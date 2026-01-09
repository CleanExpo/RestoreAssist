'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormRenderer } from '../renderer/FormRenderer'
import { FormSchema } from '@/lib/forms/form-types'
import { useFormSystem } from '../FormSystemProvider'
import { useToast } from '@/hooks/use-toast'

/**
 * WorkOrderForm - Pre-defined Work Order form
 * Captures job assignment details and resource allocation
 */
export function WorkOrderForm({ reportId, onComplete }: { reportId?: string; onComplete?: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const { setContextData } = useFormSystem()
  const [isLoading, setIsLoading] = useState(false)

  // Work Order form schema
  const workOrderSchema: FormSchema = {
    id: 'work-order-v1',
    version: 1,
    formType: 'WORK_ORDER',
    sections: [
      {
        id: 'job-details',
        title: 'Job Details',
        description: 'Enter the basic job information',
        order: 0,
        fields: [
          {
            id: 'jobNumber',
            type: 'text',
            label: 'Job Number',
            placeholder: 'JOB-2026-001',
            required: true,
            order: 0,
            autoPopulateFrom: { type: 'report', field: 'reportNumber' },
          },
          {
            id: 'jobType',
            type: 'select',
            label: 'Job Type',
            required: true,
            order: 1,
            options: [
              { value: 'water-damage', label: 'Water Damage' },
              { value: 'fire-damage', label: 'Fire Damage' },
              { value: 'mold-remediation', label: 'Mold Remediation' },
              { value: 'carpet-cleaning', label: 'Carpet Cleaning' },
              { value: 'construction-cleaning', label: 'Construction Cleaning' },
              { value: 'other', label: 'Other' },
            ],
            autoPopulateFrom: { type: 'report', field: 'jobType' },
          },
          {
            id: 'propertyAddress',
            type: 'text',
            label: 'Property Address',
            placeholder: '123 Main Street, Sydney NSW 2000',
            required: true,
            order: 2,
            autoPopulateFrom: { type: 'report', field: 'propertyAddress' },
          },
          {
            id: 'jobStartDate',
            type: 'date',
            label: 'Scheduled Start Date',
            required: true,
            order: 3,
          },
        ],
      },
      {
        id: 'resource-allocation',
        title: 'Resource Allocation',
        description: 'Assign team members and equipment',
        order: 1,
        fields: [
          {
            id: 'techniciansRequired',
            type: 'number',
            label: 'Number of Technicians',
            placeholder: '1',
            required: true,
            order: 0,
            validation: { min: 1, max: 10 },
          },
          {
            id: 'estimatedDuration',
            type: 'number',
            label: 'Estimated Duration (hours)',
            placeholder: '8',
            required: true,
            order: 1,
            validation: { min: 1, max: 168 },
          },
          {
            id: 'equipmentNeeded',
            type: 'multiselect',
            label: 'Equipment Required',
            required: true,
            order: 2,
            options: [
              { value: 'water-extraction', label: 'Water Extraction Unit' },
              { value: 'dehumidifier', label: 'Dehumidifier' },
              { value: 'air-scrubber', label: 'Air Scrubber' },
              { value: 'thermal-imaging', label: 'Thermal Imaging Camera' },
              { value: 'moisture-meter', label: 'Moisture Meter' },
              { value: 'drying-mat', label: 'Drying Mat' },
            ],
          },
          {
            id: 'specialRequirements',
            type: 'textarea',
            label: 'Special Requirements or Notes',
            placeholder: 'Any special instructions or requirements for this job...',
            required: false,
            order: 3,
          },
        ],
      },
      {
        id: 'contact-information',
        title: 'Contact Information',
        description: 'Client and site contact details',
        order: 2,
        fields: [
          {
            id: 'clientName',
            type: 'text',
            label: 'Client Name',
            placeholder: 'John Smith',
            required: true,
            order: 0,
            autoPopulateFrom: { type: 'client', field: 'name' },
          },
          {
            id: 'clientPhone',
            type: 'phone',
            label: 'Client Phone Number',
            placeholder: '+61 2 XXXX XXXX',
            required: true,
            order: 1,
            autoPopulateFrom: { type: 'client', field: 'phone' },
          },
          {
            id: 'clientEmail',
            type: 'email',
            label: 'Client Email',
            placeholder: 'john@example.com',
            required: true,
            order: 2,
            autoPopulateFrom: { type: 'client', field: 'email' },
          },
          {
            id: 'siteContactName',
            type: 'text',
            label: 'Site Contact Name',
            placeholder: 'Jane Doe',
            required: false,
            order: 3,
          },
          {
            id: 'siteContactPhone',
            type: 'phone',
            label: 'Site Contact Phone',
            placeholder: '+61 2 XXXX XXXX',
            required: false,
            order: 4,
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
          templateId: 'work-order-v1',
          formData,
          reportId,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit form')

      const result = await response.json()

      toast({
        title: 'Success',
        description: 'Work Order created successfully',
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
        description: 'Failed to submit Work Order',
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
          templateId: 'work-order-v1',
          formData,
          reportId,
        }),
      })

      toast({
        title: 'Draft Saved',
        description: 'Your Work Order draft has been saved',
      })
    } catch (error) {
      console.error('Error saving draft:', error)
    }
  }

  return (
    <FormRenderer
      schema={workOrderSchema}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
      isLoading={isLoading}
    />
  )
}
