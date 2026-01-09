'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormRenderer } from '../renderer/FormRenderer'
import { FormSchema } from '@/lib/forms/form-types'
import { useFormSystem } from '../FormSystemProvider'
import { useToast } from '@/hooks/use-toast'

/**
 * SiteInductionForm - Site Induction form
 * Records worker induction and acknowledgment of site safety information
 */
export function SiteInductionForm({ reportId, onComplete }: { reportId?: string; onComplete?: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const { setContextData } = useFormSystem()
  const [isLoading, setIsLoading] = useState(false)

  // Site Induction form schema
  const siteInductionSchema: FormSchema = {
    id: 'site-induction-v1',
    version: 1,
    formType: 'SITE_INDUCTION',
    sections: [
      {
        id: 'worker-information',
        title: 'Worker Information',
        description: 'Record worker details and induction date',
        order: 0,
        fields: [
          {
            id: 'workerName',
            type: 'text',
            label: 'Worker Name',
            placeholder: 'Full Name',
            required: true,
            order: 0,
          },
          {
            id: 'workerCompany',
            type: 'text',
            label: 'Company/Contractor',
            placeholder: 'Employer name',
            required: true,
            order: 1,
          },
          {
            id: 'workerRole',
            type: 'text',
            label: 'Position/Role',
            placeholder: 'Job title',
            required: true,
            order: 2,
          },
          {
            id: 'inductionDate',
            type: 'date',
            label: 'Induction Date',
            required: true,
            order: 3,
          },
          {
            id: 'siteAddress',
            type: 'text',
            label: 'Site Address',
            placeholder: '123 Main Street, Sydney NSW 2000',
            required: true,
            order: 4,
            autoPopulateFrom: { type: 'report', field: 'propertyAddress' },
          },
        ],
      },
      {
        id: 'site-hazards',
        title: 'Site Hazards & Safety',
        description: 'Acknowledge understanding of site hazards',
        order: 1,
        fields: [
          {
            id: 'hazardsAcknowledged',
            type: 'checkbox',
            label: 'Site Hazards Acknowledgment',
            required: true,
            order: 0,
            options: [
              {
                value: 'hazards-understood',
                label: 'I have been informed of the site hazards and understand the risks',
              },
            ],
          },
          {
            id: 'hazardSummary',
            type: 'textarea',
            label: 'Summary of Site Hazards',
            placeholder: 'List main hazards present on site (water damage, biological, electrical, chemical, etc)...',
            required: true,
            order: 1,
            validation: { minLength: 20 },
          },
          {
            id: 'chemicalHazards',
            type: 'textarea',
            label: 'Chemical Hazards Present',
            placeholder: 'Any chemicals, SDS sheets available, safe handling procedures...',
            required: false,
            order: 2,
          },
          {
            id: 'biologicalHazards',
            type: 'checkbox',
            label: 'Biological Hazards',
            required: false,
            order: 3,
            options: [
              { value: 'mold-present', label: 'Mold/fungal contamination present' },
              { value: 'sewage', label: 'Sewage contamination present' },
              { value: 'bloodborne', label: 'Bloodborne pathogens possible' },
              { value: 'other-bio', label: 'Other biological hazards' },
            ],
          },
        ],
      },
      {
        id: 'ppe-requirements',
        title: 'PPE Requirements',
        description: 'Confirm PPE requirements and provision',
        order: 2,
        fields: [
          {
            id: 'ppeProvided',
            type: 'checkbox',
            label: 'PPE Provided',
            required: true,
            order: 0,
            options: [
              {
                value: 'ppe-received',
                label: 'I have been provided with required PPE',
              },
            ],
          },
          {
            id: 'ppeItems',
            type: 'multiselect',
            label: 'PPE Items Provided',
            required: true,
            order: 1,
            options: [
              { value: 'safety-helmet', label: 'Safety Helmet' },
              { value: 'safety-glasses', label: 'Safety Glasses' },
              { value: 'gloves', label: 'Gloves' },
              { value: 'respirator', label: 'Respirator' },
              { value: 'safety-boots', label: 'Safety Boots' },
              { value: 'hi-vis-clothing', label: 'Hi-Vis Clothing' },
              { value: 'ear-protection', label: 'Ear Protection' },
              { value: 'face-shield', label: 'Face Shield' },
              { value: 'harness', label: 'Safety Harness' },
              { value: 'knee-pads', label: 'Knee Pads' },
              { value: 'chemical-suit', label: 'Chemical Protective Suit' },
            ],
          },
          {
            id: 'ppeUsingInstructions',
            type: 'textarea',
            label: 'PPE Usage Instructions Provided',
            placeholder: 'How to properly use, fit, maintain and care for PPE provided...',
            required: true,
            order: 2,
            validation: { minLength: 10 },
          },
        ],
      },
      {
        id: 'emergency-procedures',
        title: 'Emergency Procedures',
        description: 'Understand emergency response procedures',
        order: 3,
        fields: [
          {
            id: 'emergencyUnderstood',
            type: 'checkbox',
            label: 'Emergency Procedures Understood',
            required: true,
            order: 0,
            options: [
              {
                value: 'emergency-understood',
                label: 'I understand the emergency procedures and evacuation routes',
              },
            ],
          },
          {
            id: 'evacuationLocation',
            type: 'text',
            label: 'Evacuation Assembly Point',
            placeholder: 'Location of assembly point',
            required: true,
            order: 1,
          },
          {
            id: 'firstAidProvider',
            type: 'text',
            label: 'First Aid Provider Name',
            placeholder: 'Name of trained first aider',
            required: true,
            order: 2,
          },
          {
            id: 'emergencyContact',
            type: 'phone',
            label: 'Emergency Contact Number',
            placeholder: '+61 2 XXXX XXXX or 000',
            required: true,
            order: 3,
          },
        ],
      },
      {
        id: 'site-rules',
        title: 'Site Rules & Expectations',
        description: 'Acknowledge site rules and worker responsibilities',
        order: 4,
        fields: [
          {
            id: 'rulesAcknowledged',
            type: 'checkbox',
            label: 'Site Rules Acknowledgment',
            required: true,
            order: 0,
            options: [
              {
                value: 'rules-understood',
                label: 'I have been informed of site rules and behavioral expectations',
              },
            ],
          },
          {
            id: 'siteRules',
            type: 'textarea',
            label: 'Key Site Rules',
            placeholder: 'No smoking, no alcohol, no mobile phones, parking restrictions, working hours, etc...',
            required: true,
            order: 1,
            validation: { minLength: 20 },
          },
          {
            id: 'accessRestrictions',
            type: 'textarea',
            label: 'Restricted Areas',
            placeholder: 'Areas not to enter, client privacy areas, utility room restrictions...',
            required: true,
            order: 2,
            validation: { minLength: 10 },
          },
          {
            id: 'communicationProtocol',
            type: 'textarea',
            label: 'Communication & Reporting',
            placeholder: 'How to report concerns, incident reporting, contact supervisor...',
            required: true,
            order: 3,
            validation: { minLength: 10 },
          },
        ],
      },
      {
        id: 'supervisor-information',
        title: 'Supervisor Information',
        description: 'Supervisor details and responsibility acknowledgment',
        order: 5,
        fields: [
          {
            id: 'supervisorName',
            type: 'text',
            label: 'Site Supervisor Name',
            placeholder: 'Full Name',
            required: true,
            order: 0,
          },
          {
            id: 'supervisorRole',
            type: 'text',
            label: 'Supervisor Role',
            placeholder: 'Site Manager, Team Leader, etc',
            required: true,
            order: 1,
          },
          {
            id: 'supervisorContact',
            type: 'phone',
            label: 'Supervisor Contact',
            placeholder: '+61 2 XXXX XXXX',
            required: true,
            order: 2,
          },
          {
            id: 'supervisorEmail',
            type: 'email',
            label: 'Supervisor Email',
            placeholder: 'supervisor@company.com',
            required: false,
            order: 3,
          },
        ],
      },
      {
        id: 'worker-acknowledgment',
        title: 'Worker Acknowledgment & Sign-off',
        description: 'Worker confirms induction completion and understanding',
        order: 6,
        fields: [
          {
            id: 'inductionCompleted',
            type: 'checkbox',
            label: 'Induction Completion',
            required: true,
            order: 0,
            options: [
              {
                value: 'induction-completed',
                label: 'I confirm I have completed site induction and understand all requirements',
              },
            ],
          },
          {
            id: 'questionsAsked',
            type: 'checkbox',
            label: 'Questions & Clarification',
            required: true,
            order: 1,
            options: [
              {
                value: 'questions-answered',
                label: 'All my questions have been answered and I have had time to ask for clarification',
              },
            ],
          },
          {
            id: 'competencyAcknowledged',
            type: 'checkbox',
            label: 'Competency Acknowledgment',
            required: true,
            order: 2,
            options: [
              {
                value: 'competent',
                label: 'I am competent to perform work on this site safely',
              },
            ],
          },
          {
            id: 'inductionNotes',
            type: 'textarea',
            label: 'Additional Notes or Concerns',
            placeholder: 'Any specific concerns or additional information...',
            required: false,
            order: 3,
          },
        ],
      },
      {
        id: 'signatures',
        title: 'Signatures',
        description: 'Sign to confirm induction',
        order: 7,
        fields: [
          {
            id: 'workerSignature',
            type: 'signature',
            label: 'Worker Signature',
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
          {
            id: 'supervisorSignature',
            type: 'signature',
            label: 'Supervisor Signature',
            required: true,
            order: 2,
          },
          {
            id: 'supervisorSignatureDate',
            type: 'date',
            label: 'Supervisor Signature Date',
            required: true,
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
          templateId: 'site-induction-v1',
          formData,
          reportId,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit form')

      const result = await response.json()

      toast({
        title: 'Success',
        description: 'Site Induction submitted successfully',
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
        description: 'Failed to submit Site Induction form',
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
          templateId: 'site-induction-v1',
          formData,
          reportId,
        }),
      })

      toast({
        title: 'Draft Saved',
        description: 'Your Site Induction draft has been saved',
      })
    } catch (error) {
      console.error('Error saving draft:', error)
    }
  }

  return (
    <FormRenderer
      schema={siteInductionSchema}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
      isLoading={isLoading}
    />
  )
}
