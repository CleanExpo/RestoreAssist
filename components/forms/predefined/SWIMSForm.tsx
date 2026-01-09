'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormRenderer } from '../renderer/FormRenderer'
import { FormSchema } from '@/lib/forms/form-types'
import { useFormSystem } from '../FormSystemProvider'
import { useToast } from '@/hooks/use-toast'

/**
 * SWIMSForm - Safe Work Information Management System form
 * Captures comprehensive work safety information and management system documentation
 */
export function SWIMSForm({ reportId, onComplete }: { reportId?: string; onComplete?: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const { setContextData } = useFormSystem()
  const [isLoading, setIsLoading] = useState(false)

  // SWIMS form schema
  const swimsSchema: FormSchema = {
    id: 'swims-v1',
    version: 1,
    formType: 'SWIMS',
    sections: [
      {
        id: 'work-information',
        title: 'Work Information',
        description: 'Document the work being performed',
        order: 0,
        fields: [
          {
            id: 'workName',
            type: 'text',
            label: 'Name of Work',
            placeholder: 'Water damage restoration',
            required: true,
            order: 0,
          },
          {
            id: 'workLocation',
            type: 'text',
            label: 'Work Location',
            placeholder: '123 Main Street, Sydney NSW 2000',
            required: true,
            order: 1,
            autoPopulateFrom: { type: 'report', field: 'propertyAddress' },
          },
          {
            id: 'workDate',
            type: 'date',
            label: 'Date of Work',
            required: true,
            order: 2,
          },
          {
            id: 'workDescription',
            type: 'textarea',
            label: 'Description of Work',
            placeholder: 'Detailed description of restoration work...',
            required: true,
            order: 3,
            validation: { minLength: 20 },
          },
        ],
      },
      {
        id: 'hazard-analysis',
        title: 'Hazard Analysis',
        description: 'Identify and assess hazards',
        order: 1,
        fields: [
          {
            id: 'identifiedHazards',
            type: 'textarea',
            label: 'Identified Hazards',
            placeholder: 'List all potential hazards (e.g., electrical, water, chemicals, biological)...',
            required: true,
            order: 0,
            validation: { minLength: 20 },
          },
          {
            id: 'hazardRiskLevel',
            type: 'select',
            label: 'Overall Risk Level',
            required: true,
            order: 1,
            options: [
              { value: 'low', label: 'Low Risk' },
              { value: 'medium', label: 'Medium Risk' },
              { value: 'high', label: 'High Risk' },
              { value: 'extreme', label: 'Extreme Risk' },
            ],
          },
          {
            id: 'affectedPersons',
            type: 'textarea',
            label: 'Persons Who May Be Affected',
            placeholder: 'List employees, contractors, public, site visitors, etc...',
            required: true,
            order: 2,
            validation: { minLength: 10 },
          },
          {
            id: 'environmentalHazards',
            type: 'textarea',
            label: 'Environmental Hazards',
            placeholder: 'Weather, site conditions, noise, vibration, etc...',
            required: false,
            order: 3,
          },
        ],
      },
      {
        id: 'control-measures',
        title: 'Control Measures',
        description: 'Implement controls following hierarchy of controls',
        order: 2,
        fields: [
          {
            id: 'engineeringControls',
            type: 'textarea',
            label: 'Engineering Controls',
            placeholder: 'Physical modifications, ventilation, containment, guarding...',
            required: true,
            order: 0,
            validation: { minLength: 10 },
          },
          {
            id: 'administrativeControls',
            type: 'textarea',
            label: 'Administrative Controls',
            placeholder: 'Work procedures, supervision, training, induction, hot work permits...',
            required: true,
            order: 1,
            validation: { minLength: 10 },
          },
          {
            id: 'ppeRequired',
            type: 'multiselect',
            label: 'Personal Protective Equipment',
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
              { value: 'harness', label: 'Safety Harness' },
              { value: 'knee-pads', label: 'Knee Pads' },
            ],
          },
          {
            id: 'ppeInstructions',
            type: 'textarea',
            label: 'PPE Instructions & Care',
            placeholder: 'How to use, care, inspection, and maintenance of PPE...',
            required: true,
            order: 3,
            validation: { minLength: 10 },
          },
        ],
      },
      {
        id: 'emergency-procedures',
        title: 'Emergency Procedures',
        description: 'Emergency response and evacuation planning',
        order: 3,
        fields: [
          {
            id: 'emergencyProcedures',
            type: 'textarea',
            label: 'Emergency Procedures',
            placeholder: 'Evacuation routes, assembly points, first aid procedures...',
            required: true,
            order: 0,
            validation: { minLength: 20 },
          },
          {
            id: 'firstAidArrangements',
            type: 'textarea',
            label: 'First Aid Arrangements',
            placeholder: 'First aid kits, trained personnel, hospital location, emergency contacts...',
            required: true,
            order: 1,
            validation: { minLength: 20 },
          },
          {
            id: 'isolationProcedures',
            type: 'textarea',
            label: 'Isolation/Lock-Out Procedures',
            placeholder: 'LOTO procedures for equipment, utilities, hazardous energy...',
            required: false,
            order: 2,
          },
          {
            id: 'incidentReporting',
            type: 'textarea',
            label: 'Incident Reporting Procedure',
            placeholder: 'How incidents are reported, recorded, and investigated...',
            required: true,
            order: 3,
            validation: { minLength: 10 },
          },
        ],
      },
      {
        id: 'training-supervision',
        title: 'Training & Supervision',
        description: 'Training and supervision requirements',
        order: 4,
        fields: [
          {
            id: 'trainingRequired',
            type: 'textarea',
            label: 'Training Required',
            placeholder: 'Specific training needed for workers (e.g., confined space, height, machinery)...',
            required: true,
            order: 0,
            validation: { minLength: 10 },
          },
          {
            id: 'supervisionArrangements',
            type: 'textarea',
            label: 'Supervision Arrangements',
            placeholder: 'Who supervises, supervision frequency, responsibilities...',
            required: true,
            order: 1,
            validation: { minLength: 10 },
          },
          {
            id: 'competencyRequirements',
            type: 'textarea',
            label: 'Competency Requirements',
            placeholder: 'Experience, qualifications, certifications required...',
            required: true,
            order: 2,
            validation: { minLength: 10 },
          },
          {
            id: 'inductionTopics',
            type: 'multiselect',
            label: 'Site Induction Topics',
            required: true,
            order: 3,
            options: [
              { value: 'hazards', label: 'Site Hazards' },
              { value: 'access', label: 'Site Access & Restrictions' },
              { value: 'ppe', label: 'PPE Requirements' },
              { value: 'emergency', label: 'Emergency Procedures' },
              { value: 'communication', label: 'Communication Plan' },
              { value: 'parking', label: 'Parking & Traffic' },
              { value: 'incident', label: 'Incident Reporting' },
              { value: 'welfare', label: 'Welfare Facilities' },
              { value: 'supervision', label: 'Supervision Arrangements' },
            ],
          },
        ],
      },
      {
        id: 'communication-coordination',
        title: 'Communication & Coordination',
        description: 'Site communication and coordination',
        order: 5,
        fields: [
          {
            id: 'sitePrincipal',
            type: 'text',
            label: 'Site Principal/Manager',
            placeholder: 'Name',
            required: true,
            order: 0,
          },
          {
            id: 'sitePrincipalContact',
            type: 'phone',
            label: 'Site Principal Contact',
            placeholder: '+61 2 XXXX XXXX',
            required: true,
            order: 1,
          },
          {
            id: 'communicationPlan',
            type: 'textarea',
            label: 'Communication Plan',
            placeholder: 'How information is shared, toolbox talks, meetings, signage...',
            required: true,
            order: 2,
            validation: { minLength: 10 },
          },
          {
            id: 'coordinationWithOtherWork',
            type: 'textarea',
            label: 'Coordination with Other Work',
            placeholder: 'How you coordinate with other contractors, multiple shifts...',
            required: false,
            order: 3,
          },
        ],
      },
      {
        id: 'review-authorization',
        title: 'Review & Authorization',
        description: 'Review and sign off on SWIMS',
        order: 6,
        fields: [
          {
            id: 'preparedBy',
            type: 'text',
            label: 'Prepared By',
            placeholder: 'Name',
            required: true,
            order: 0,
          },
          {
            id: 'preparedDate',
            type: 'date',
            label: 'Date Prepared',
            required: true,
            order: 1,
          },
          {
            id: 'reviewedBy',
            type: 'text',
            label: 'Reviewed By',
            placeholder: 'Safety Officer/Manager Name',
            required: true,
            order: 2,
          },
          {
            id: 'reviewDate',
            type: 'date',
            label: 'Date Reviewed',
            required: true,
            order: 3,
          },
          {
            id: 'additionalNotes',
            type: 'textarea',
            label: 'Additional Notes',
            placeholder: 'Any additional information or special conditions...',
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
          templateId: 'swims-v1',
          formData,
          reportId,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit form')

      const result = await response.json()

      toast({
        title: 'Success',
        description: 'SWIMS submitted successfully',
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
        description: 'Failed to submit SWIMS form',
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
          templateId: 'swims-v1',
          formData,
          reportId,
        }),
      })

      toast({
        title: 'Draft Saved',
        description: 'Your SWIMS draft has been saved',
      })
    } catch (error) {
      console.error('Error saving draft:', error)
    }
  }

  return (
    <FormRenderer
      schema={swimsSchema}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
      isLoading={isLoading}
    />
  )
}
