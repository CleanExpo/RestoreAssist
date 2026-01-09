'use client'

import { useState } from 'react'
import { FormSchema, FormField } from '@/lib/forms/form-types'
import { SignatureCanvas } from '@/components/forms/signature/SignatureCanvas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormProgress } from '@/components/forms/renderer/FormProgress'
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

interface PublicFormViewProps {
  formSchema: FormSchema
  submissionId: string
  signatureToken: string
  signatoryName?: string
  signatoryEmail?: string
  onSubmitSignature: (formData: Record<string, any>, signatureData: string) => Promise<void>
}

export function PublicFormView({
  formSchema,
  submissionId,
  signatureToken,
  signatoryName = '',
  signatoryEmail = '',
  onSubmitSignature,
}: PublicFormViewProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  if (!formSchema.sections || formSchema.sections.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">No form sections available</p>
      </div>
    )
  }

  const currentSection = formSchema.sections[currentStep]

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }))
  }

  const handleSignatureCapture = (signature: string) => {
    setSignatureData(signature)
  }

  const handleSubmit = async () => {
    if (!signatureData) {
      setErrorMessage('Please provide a signature before submitting')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      await onSubmitSignature(formData, signatureData)
      setSubmitStatus('success')
    } catch (error) {
      setSubmitStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit signature')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canProceed = currentSection.fields.every((field) => {
    if (!field.required) return true
    const value = formData[field.id]
    return value !== undefined && value !== null && value !== ''
  })

  if (submitStatus === 'success') {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-green-900 mb-2">Form Signed Successfully</h2>
          <p className="text-green-700">Your signature has been recorded and the form has been submitted.</p>
          <p className="text-green-600 text-sm mt-4">Reference: {submissionId}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Form Signature Required</h1>
          <p className="text-slate-600">Please review the information below and provide your signature</p>
          {signatoryName && <p className="text-sm text-slate-500 mt-2">Signer: {signatoryName}</p>}
          {signatoryEmail && <p className="text-sm text-slate-500">Email: {signatoryEmail}</p>}
        </div>

        {/* Progress */}
        {formSchema.sections.length > 1 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <FormProgress currentStep={currentStep} totalSteps={formSchema.sections.length} />
          </div>
        )}

        {/* Form Section */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">{currentSection.title}</h2>
          {currentSection.description && (
            <p className="text-slate-600 mb-6">{currentSection.description}</p>
          )}

          {/* Fields */}
          <div className="space-y-6">
            {currentSection.fields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>

                {/* Text Input */}
                {field.type === 'text' && (
                  <Input
                    type="text"
                    value={formData[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    disabled={field.disabled}
                    className="w-full"
                  />
                )}

                {/* Textarea */}
                {field.type === 'textarea' && (
                  <Textarea
                    value={formData[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    disabled={field.disabled}
                    rows={3}
                    className="w-full"
                  />
                )}

                {/* Email */}
                {field.type === 'email' && (
                  <Input
                    type="email"
                    value={formData[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    disabled={field.disabled}
                    className="w-full"
                  />
                )}

                {/* Phone */}
                {field.type === 'phone' && (
                  <Input
                    type="tel"
                    value={formData[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    disabled={field.disabled}
                    className="w-full"
                  />
                )}

                {/* Number */}
                {field.type === 'number' && (
                  <Input
                    type="number"
                    value={formData[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    disabled={field.disabled}
                    className="w-full"
                  />
                )}

                {/* Date */}
                {field.type === 'date' && (
                  <Input
                    type="date"
                    value={formData[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    disabled={field.disabled}
                    className="w-full"
                  />
                )}

                {/* Select */}
                {field.type === 'select' && (
                  <select
                    value={formData[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    disabled={field.disabled}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select an option</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}

                {/* Checkbox */}
                {field.type === 'checkbox' && field.options && (
                  <div className="space-y-2">
                    {field.options.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          value={opt.value}
                          checked={(formData[field.id] || []).includes(opt.value)}
                          onChange={(e) => {
                            const current = formData[field.id] || []
                            if (e.target.checked) {
                              handleFieldChange(field.id, [...current, opt.value])
                            } else {
                              handleFieldChange(
                                field.id,
                                current.filter((v: string) => v !== opt.value),
                              )
                            }
                          }}
                          disabled={field.disabled}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Radio */}
                {field.type === 'radio' && field.options && (
                  <div className="space-y-2">
                    {field.options.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={field.id}
                          value={opt.value}
                          checked={formData[field.id] === opt.value}
                          onChange={(e) => handleFieldChange(field.id, e.target.value)}
                          disabled={field.disabled}
                          className="w-4 h-4 rounded-full border-slate-300"
                        />
                        <span className="text-sm text-slate-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {field.description && (
                  <p className="text-xs text-slate-500 mt-1 italic">{field.description}</p>
                )}
              </div>
            ))}
          </div>

          {/* Navigation */}
          {formSchema.sections.length > 1 && (
            <div className="mt-8 flex gap-4">
              <Button
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                variant="outline"
                disabled={currentStep === 0}
                className="flex-1"
              >
                Previous
              </Button>
              <Button
                onClick={() => setCurrentStep(Math.min(formSchema.sections.length - 1, currentStep + 1))}
                disabled={!canProceed || currentStep >= formSchema.sections.length - 1}
                className="flex-1"
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Signature Section */}
        {currentStep === formSchema.sections.length - 1 && (
          <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6">Sign the Form</h2>
            <SignatureCanvas onSignatureSave={handleSignatureCapture} />
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
            <p className="text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* Submit Button */}
        {currentStep === formSchema.sections.length - 1 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <Button
              onClick={handleSubmit}
              disabled={!signatureData || isSubmitting}
              className="w-full gap-2"
              size="lg"
            >
              {isSubmitting && <Loader2 size={20} className="animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Submit Signed Form'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
