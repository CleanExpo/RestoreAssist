'use client'

import { FieldType } from '@/lib/forms/form-types'
import { Plus, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const FIELD_TYPES: { type: FieldType; label: string; icon: string; description: string }[] = [
  { type: 'text', label: 'Text', icon: '📝', description: 'Single-line text input' },
  { type: 'textarea', label: 'Textarea', icon: '📄', description: 'Multi-line text' },
  { type: 'email', label: 'Email', icon: '✉️', description: 'Email address' },
  { type: 'phone', label: 'Phone', icon: '📱', description: 'Phone number' },
  { type: 'number', label: 'Number', icon: '🔢', description: 'Numeric input' },
  { type: 'date', label: 'Date', icon: '📅', description: 'Date picker' },
  { type: 'datetime', label: 'DateTime', icon: '🕐', description: 'Date and time' },
  { type: 'select', label: 'Select', icon: '▼', description: 'Dropdown menu' },
  { type: 'multiselect', label: 'Multi-Select', icon: '☑️', description: 'Multiple choices' },
  { type: 'checkbox', label: 'Checkbox', icon: '✓', description: 'Single checkbox' },
  { type: 'radio', label: 'Radio', icon: '◉', description: 'Radio button group' },
  { type: 'file', label: 'File', icon: '📎', description: 'File upload' },
  { type: 'signature', label: 'Signature', icon: '✍️', description: 'Digital signature' },
]

interface FormBuilderSidebarProps {
  selectedFieldId?: string
  onFieldSelect?: (fieldId: string) => void
}

export function FormBuilderSidebar({ selectedFieldId, onFieldSelect }: FormBuilderSidebarProps) {
  const handleDragStart = (e: React.DragEvent, fieldType: FieldType) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('fieldType', fieldType)
  }

  return (
    <div className="w-80 border-r bg-slate-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <h2 className="text-lg font-semibold text-slate-900">Form Fields</h2>
        <p className="text-sm text-slate-500 mt-1">Drag fields to canvas</p>
      </div>

      {/* Field Types Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {FIELD_TYPES.map((field) => (
            <div
              key={field.type}
              draggable
              onDragStart={(e) => handleDragStart(e, field.type)}
              className="p-3 bg-white border border-slate-200 rounded-lg cursor-move hover:bg-slate-50 hover:border-slate-300 transition-all hover:shadow-md group"
              title={field.description}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{field.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-slate-900">{field.label}</p>
                  <p className="text-xs text-slate-500 truncate">{field.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Help Footer */}
      <div className="p-4 border-t bg-white text-xs text-slate-500 space-y-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5">💡</span>
          <p>Drag any field type onto the canvas to add it to your form</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5">⚙️</span>
          <p>Click on fields to edit their properties</p>
        </div>
      </div>
    </div>
  )
}
