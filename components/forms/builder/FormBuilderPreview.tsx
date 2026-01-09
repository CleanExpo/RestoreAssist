'use client'

import { FormSection } from '@/lib/forms/form-types'
import { FormRenderer } from '@/components/forms/renderer/FormRenderer'
import { FormProgress } from '@/components/forms/renderer/FormProgress'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface FormBuilderPreviewProps {
  sections: FormSection[]
  formName?: string
}

export function FormBuilderPreview({ sections, formName }: FormBuilderPreviewProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<Record<string, any>>({})

  if (sections.length === 0) {
    return (
      <div className="w-96 bg-white border-l border-slate-200 p-6 flex items-center justify-center h-full">
        <p className="text-slate-500 text-center">Add fields to preview form</p>
      </div>
    )
  }

  const currentSection = sections[currentStep]

  return (
    <div className="w-96 bg-white border-l border-slate-200 overflow-y-auto flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-slate-50 sticky top-0">
        <h3 className="font-semibold text-slate-900">Preview</h3>
        {formName && <p className="text-xs text-slate-500 mt-1">{formName}</p>}
      </div>

      {/* Progress Indicator */}
      {sections.length > 1 && (
        <div className="p-4 border-b">
          <FormProgress currentStep={currentStep} totalSteps={sections.length} />
        </div>
      )}

      {/* Form Content */}
      <div className="flex-1 p-4 space-y-4">
        {/* Section Header */}
        <div>
          <h4 className="text-lg font-semibold text-slate-900">{currentSection.title}</h4>
          {currentSection.description && (
            <p className="text-sm text-slate-600 mt-1">{currentSection.description}</p>
          )}
        </div>

        {/* Fields */}
        <div className="space-y-4">
          {currentSection.fields.map((field) => (
            <div key={field.id} className="space-y-1">
              <label className="text-sm font-medium text-slate-900">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {/* Field Preview Based on Type */}
              {field.type === 'text' && (
                <input
                  type="text"
                  placeholder={field.placeholder}
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                />
              )}

              {field.type === 'textarea' && (
                <textarea
                  placeholder={field.placeholder}
                  disabled
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                />
              )}

              {field.type === 'email' && (
                <input
                  type="email"
                  placeholder={field.placeholder}
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                />
              )}

              {field.type === 'phone' && (
                <input
                  type="tel"
                  placeholder={field.placeholder}
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                />
              )}

              {field.type === 'number' && (
                <input
                  type="number"
                  placeholder={field.placeholder}
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                />
              )}

              {field.type === 'date' && (
                <input
                  type="date"
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                />
              )}

              {field.type === 'datetime' && (
                <input
                  type="datetime-local"
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                />
              )}

              {field.type === 'select' && (
                <select disabled className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-sm text-slate-500 cursor-not-allowed">
                  <option>-- Select --</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {field.type === 'multiselect' && (
                <select multiple disabled className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-sm text-slate-500 cursor-not-allowed h-20">
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {field.type === 'checkbox' && field.options && (
                <div className="space-y-2">
                  {field.options.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" disabled className="w-4 h-4 rounded border-slate-300" />
                      <span className="text-sm text-slate-600">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {field.type === 'radio' && field.options && (
                <div className="space-y-2">
                  {field.options.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name={field.id} disabled className="w-4 h-4 rounded-full border-slate-300" />
                      <span className="text-sm text-slate-600">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {field.type === 'file' && (
                <div className="border-2 border-dashed border-slate-300 rounded-md p-4 text-center">
                  <p className="text-xs text-slate-500">File upload disabled in preview</p>
                </div>
              )}

              {field.type === 'signature' && (
                <div className="border-2 border-dashed border-slate-300 rounded-md p-6 text-center">
                  <p className="text-xs text-slate-500">Signature canvas disabled in preview</p>
                </div>
              )}

              {field.description && (
                <p className="text-xs text-slate-500 italic">{field.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      {sections.length > 1 && (
        <div className="p-4 border-t bg-slate-50 flex gap-2 sticky bottom-0">
          <Button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            variant="outline"
            disabled={currentStep === 0}
            className="flex-1"
          >
            Previous
          </Button>
          <Button
            onClick={() => setCurrentStep(Math.min(sections.length - 1, currentStep + 1))}
            variant="outline"
            disabled={currentStep >= sections.length - 1}
            className="flex-1"
          >
            Next
          </Button>
        </div>
      )}

      {/* Single Step Navigation */}
      {sections.length === 1 && (
        <div className="p-4 border-t bg-slate-50 sticky bottom-0">
          <Button className="w-full" disabled>
            Submit Form
          </Button>
        </div>
      )}
    </div>
  )
}
