'use client'

import { useState } from 'react'
import { FormField, FormSection } from '@/lib/forms/form-types'
import { Trash2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cuid } from '@/lib/utils/cuid'

interface FormBuilderCanvasProps {
  sections: FormSection[]
  onSectionsChange: (sections: FormSection[]) => void
  selectedFieldId?: string
  onFieldSelect: (fieldId: string) => void
  onFieldDelete: (fieldId: string) => void
}

export function FormBuilderCanvas({
  sections,
  onSectionsChange,
  selectedFieldId,
  onFieldSelect,
  onFieldDelete,
}: FormBuilderCanvasProps) {
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(sections.map((s) => s.id)))

  const handleDragOver = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOverSectionId(sectionId)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) {
      setDragOverSectionId(null)
    }
  }

  const handleDrop = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverSectionId(null)

    const fieldType = e.dataTransfer.getData('fieldType')
    if (!fieldType) return

    // Find section and add field
    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        const newField: FormField = {
          id: cuid(),
          type: fieldType as any,
          label: `New ${fieldType} field`,
          placeholder: '',
          required: false,
          order: section.fields.length,
        }
        return {
          ...section,
          fields: [...section.fields, newField],
        }
      }
      return section
    })

    onSectionsChange(updatedSections)
  }

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId)
    } else {
      newExpanded.add(sectionId)
    }
    setExpandedSections(newExpanded)
  }

  const moveFieldUp = (sectionId: string, fieldIndex: number) => {
    if (fieldIndex === 0) return

    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        const newFields = [...section.fields]
        ;[newFields[fieldIndex], newFields[fieldIndex - 1]] = [newFields[fieldIndex - 1], newFields[fieldIndex]]
        return { ...section, fields: newFields }
      }
      return section
    })
    onSectionsChange(updatedSections)
  }

  const moveFieldDown = (sectionId: string, fieldIndex: number, totalFields: number) => {
    if (fieldIndex >= totalFields - 1) return

    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        const newFields = [...section.fields]
        ;[newFields[fieldIndex], newFields[fieldIndex + 1]] = [newFields[fieldIndex + 1], newFields[fieldIndex]]
        return { ...section, fields: newFields }
      }
      return section
    })
    onSectionsChange(updatedSections)
  }

  return (
    <div className="flex-1 bg-white p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-6">
        {sections.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center">
            <p className="text-slate-500">No sections yet. Create a section to get started.</p>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.id} className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full p-4 bg-slate-100 hover:bg-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-slate-900">{section.title}</h3>
                  {section.description && <p className="text-sm text-slate-600 mt-1">{section.description}</p>}
                </div>
                <ChevronDown
                  size={20}
                  className={`text-slate-600 transition-transform ${
                    expandedSections.has(section.id) ? '' : '-rotate-90'
                  }`}
                />
              </button>

              {/* Section Content */}
              {expandedSections.has(section.id) && (
                <div
                  onDragOver={(e) => handleDragOver(e, section.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, section.id)}
                  className={`p-4 space-y-3 min-h-48 transition-colors ${
                    dragOverSectionId === section.id ? 'bg-blue-50 border-t-2 border-blue-300' : 'bg-slate-50'
                  }`}
                >
                  {section.fields.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-300 rounded p-8 text-center">
                      <p className="text-slate-500 text-sm">Drag fields here to add them</p>
                    </div>
                  ) : (
                    section.fields.map((field, index) => (
                      <div
                        key={field.id}
                        onClick={() => onFieldSelect(field.id)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedFieldId === field.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Drag Handle */}
                          <div className="mt-1 text-slate-400 hover:text-slate-600">
                            <GripVertical size={18} />
                          </div>

                          {/* Field Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900">{field.label}</span>
                              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">
                                {field.type}
                              </span>
                              {field.required && <span className="text-red-500 text-sm">*</span>}
                            </div>
                            {field.placeholder && (
                              <p className="text-xs text-slate-500 mt-1">Placeholder: {field.placeholder}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                moveFieldUp(section.id, index)
                              }}
                              disabled={index === 0}
                              className="p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                              title="Move up"
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                moveFieldDown(section.id, index, section.fields.length)
                              }}
                              disabled={index >= section.fields.length - 1}
                              className="p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                              title="Move down"
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onFieldDelete(field.id)
                              }}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Delete field"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
