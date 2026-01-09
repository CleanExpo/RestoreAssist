'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormRenderer } from '../renderer/FormRenderer'
import { FormSchema } from '@/lib/forms/form-types'
import { useFormSystem } from '../FormSystemProvider'
import { useToast } from '@/hooks/use-toast'

/**
 * AuthorityForm - Authority to Proceed form
 * Captures client authorization for work commencement
 */
export function AuthorityForm({ reportId, onComplete }: { reportId?: string; onComplete?: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const { setContextData } = useFormSystem()
  const [isLoading, setIsLoading] = useState(false)

  // Authority to Proceed form schema
  const authoritySchema: FormSchema = {
    id: 'authority-to-proceed-v1',
    version: 1,
    formType: 'AUTHORITY_TO_COMMENCE',
    sections: [
      {
        id: 'document-info',
        title: 'Document Information',
        description: 'Capture authorization for work commencement',
        order: 0,
        fields: [
          {
            id: 'authorizationDate',
            type: 'date',
            label: 'Authorization Date',
            required: true,
            order: 0,
          },
          {
            id: 'jobNumber',
            type: 'text',
            label: 'Job/Reference Number',
            placeholder: 'JOB-2026-001',
            required: true,
            order: 1,
            autoPopulateFrom: { type: 'report', field: 'reportNumber' },
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
        ],
      },
      {
        id: 'scope-of-work',
        title: 'Scope of Work',
        description: 'Describe the work to be performed',
        order: 1,
        fields: [
          {
            id: 'workDescription',
            type: 'textarea',
            label: 'Description of Work to be Performed',
            placeholder: 'Detailed description of restoration work...',
            required: true,
            order: 0,
            validation: { minLength: 10 },
          },
          {
            id: 'estimatedStartDate',
            type: 'date',
            label: 'Estimated Start Date',
            required: true,
            order: 1,
          },
          {
            id: 'estimatedCompletionDate',
            type: 'date',
            label: 'Estimated Completion Date',
            required: true,
            order: 2,
          },
          {
            id: 'costEstimate',
            type: 'number',
            label: 'Cost Estimate (AUD)',
            placeholder: '5000',
            required: true,
            order: 3,
            validation: { min: 0 },
          },
          {
            id: 'insuranceRequired',
            type: 'checkbox',
            label: 'Insurance',
            required: false,
            order: 4,
            options: [
              { value: 'has-insurance', label: 'Client has building insurance for this work' },
            ],
          },
        ],
      },
      {
        id: 'authorization',
        title: 'Authorization',
        description: 'Obtain client authorization to proceed',
        order: 2,
        fields: [
          {
            id: 'authorizationName',
            type: 'text',
            label: 'Authorized Person Name',
            placeholder: 'John Smith',
            required: true,
            order: 0,
            autoPopulateFrom: { type: 'client', field: 'contactPerson' },
          },
          {
            id: 'authorizationTitle',
            type: 'text',
            label: 'Position/Title',
            placeholder: 'Property Owner',
            required: true,
            order: 1,
          },
          {
            id: 'authorizationDate',
            type: 'date',
            label: 'Authorization Date',
            required: true,
            order: 2,
          },
          {
            id: 'termsAccepted',
            type: 'checkbox',
            label: 'Terms & Conditions',
            required: true,
            order: 3,
            options: [
              {
                value: 'terms-agreed',
                label: 'I authorize the commencement of the above work and accept the terms and conditions',
              },
            ],
          },
          {
            id: 'additionalNotes',
            type: 'textarea',
            label: 'Additional Notes or Special Instructions',
            placeholder: 'Any special requests or conditions...',
            required: false,
            order: 4,
          },
        ],
      },
      {
        id: 'signature',
        title: 'Signature',
        description: 'Sign to confirm authorization',
        order: 3,
        fields: [
          {
            id: 'clientSignature',
            type: 'signature',
            label: 'Client Signature',
            required: true,
            order: 0,
          },
          {
            id: 'signatureDate',
            type: 'date',
            label: 'Signature Date',
            required: true,
            order: 1,
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
          templateId: 'authority-to-proceed-v1',
          formData,
          reportId,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit form')

      const result = await response.json()

      toast({
        title: 'Success',
        description: 'Authority to Proceed form submitted successfully',
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
        description: 'Failed to submit Authority form',
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
          templateId: 'authority-to-proceed-v1',
          formData,
          reportId,
        }),
      })

      toast({
        title: 'Draft Saved',
        description: 'Your Authority form draft has been saved',
      })
    } catch (error) {
      console.error('Error saving draft:', error)
    }
  }

  return (
    <FormRenderer
      schema={authoritySchema}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
      isLoading={isLoading}
    />
  )
}
