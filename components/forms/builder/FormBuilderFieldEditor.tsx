'use client'

import { useState } from 'react'
import { FormField, FormFieldOption, FieldValidation } from '@/lib/forms/form-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { X, Plus } from 'lucide-react'

interface FormBuilderFieldEditorProps {
  field: FormField | null
  onFieldUpdate: (field: FormField) => void
  onClose: () => void
}

export function FormBuilderFieldEditor({ field, onFieldUpdate, onClose }: FormBuilderFieldEditorProps) {
  const [editField, setEditField] = useState<FormField | null>(field)
  const [showValidation, setShowValidation] = useState(false)
  const [showOptions, setShowOptions] = useState(false)

  if (!editField) {
    return (
      <div className="w-96 bg-white border-l border-slate-200 flex items-center justify-center h-full">
        <p className="text-slate-500 text-center">Select a field to edit</p>
      </div>
    )
  }

  const handleFieldChange = (key: keyof FormField, value: any) => {
    setEditField({ ...editField, [key]: value })
  }

  const handleValidationChange = (key: keyof FieldValidation, value: any) => {
    setEditField({
      ...editField,
      validation: { ...editField.validation, [key]: value },
    })
  }

  const handleAddOption = () => {
    setEditField({
      ...editField,
      options: [...(editField.options || []), { value: '', label: '' }],
    })
  }

  const handleUpdateOption = (index: number, key: keyof FormFieldOption, value: string) => {
    const newOptions = [...(editField.options || [])]
    newOptions[index] = { ...newOptions[index], [key]: value }
    setEditField({ ...editField, options: newOptions })
  }

  const handleRemoveOption = (index: number) => {
    const newOptions = (editField.options || []).filter((_, i) => i !== index)
    setEditField({ ...editField, options: newOptions })
  }

  const needsOptions = ['select', 'multiselect', 'checkbox', 'radio'].includes(editField.type)

  return (
    <div className="w-96 bg-white border-l border-slate-200 overflow-y-auto flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-slate-50 flex items-center justify-between sticky top-0">
        <h3 className="font-semibold text-slate-900">Edit Field</h3>
        <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded transition-colors">
          <X size={18} className="text-slate-600" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-6">
        {/* Basic Properties */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-900">Basic Properties</h4>

          <div>
            <label className="text-sm font-medium text-slate-700">Field Label</label>
            <Input
              value={editField.label}
              onChange={(e) => handleFieldChange('label', e.target.value)}
              placeholder="e.g., Customer Name"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Field Type</label>
            <p className="text-xs text-slate-500 mt-1 p-2 bg-slate-100 rounded">
              {editField.type} (cannot be changed)
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Placeholder</label>
            <Input
              value={editField.placeholder || ''}
              onChange={(e) => handleFieldChange('placeholder', e.target.value)}
              placeholder="e.g., John Doe"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Description</label>
            <Textarea
              value={editField.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Help text for users"
              className="mt-1 h-20"
            />
          </div>
        </div>

        {/* Flags */}
        <div className="space-y-3 p-3 bg-slate-50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={editField.required}
              onCheckedChange={(checked) => handleFieldChange('required', checked)}
            />
            <span className="text-sm font-medium text-slate-700">Required field</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={editField.disabled || false}
              onCheckedChange={(checked) => handleFieldChange('disabled', checked)}
            />
            <span className="text-sm font-medium text-slate-700">Disabled</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={editField.hidden || false}
              onCheckedChange={(checked) => handleFieldChange('hidden', checked)}
            />
            <span className="text-sm font-medium text-slate-700">Hidden</span>
          </label>
        </div>

        {/* Field Options (for select, radio, etc.) */}
        {needsOptions && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Options</h4>
              <Button
                onClick={handleAddOption}
                size="sm"
                variant="outline"
                className="gap-1 h-8 text-xs"
              >
                <Plus size={14} />
                Add Option
              </Button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(editField.options || []).map((option, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={option.value}
                    onChange={(e) => handleUpdateOption(idx, 'value', e.target.value)}
                    placeholder="Value"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={option.label}
                    onChange={(e) => handleUpdateOption(idx, 'label', e.target.value)}
                    placeholder="Label"
                    className="h-8 text-xs"
                  />
                  <button
                    onClick={() => handleRemoveOption(idx)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation Rules */}
        <div className="space-y-3 border-t pt-4">
          <button
            onClick={() => setShowValidation(!showValidation)}
            className="text-sm font-semibold text-slate-900 hover:text-slate-700 transition-colors"
          >
            {showValidation ? '▼' : '▶'} Validation Rules
          </button>

          {showValidation && (
            <div className="space-y-3 p-3 bg-slate-50 rounded-lg">
              {editField.type === 'text' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-slate-700">Min Length</label>
                    <Input
                      type="number"
                      value={editField.validation?.minLength || ''}
                      onChange={(e) => handleValidationChange('minLength', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="0"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700">Max Length</label>
                    <Input
                      type="number"
                      value={editField.validation?.maxLength || ''}
                      onChange={(e) => handleValidationChange('maxLength', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="255"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </>
              )}

              {editField.type === 'number' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-slate-700">Min Value</label>
                    <Input
                      type="number"
                      value={editField.validation?.min || ''}
                      onChange={(e) => handleValidationChange('min', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="0"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700">Max Value</label>
                    <Input
                      type="number"
                      value={editField.validation?.max || ''}
                      onChange={(e) => handleValidationChange('max', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="999999"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-medium text-slate-700">Regex Pattern</label>
                <Input
                  value={editField.validation?.pattern || ''}
                  onChange={(e) => handleValidationChange('pattern', e.target.value || undefined)}
                  placeholder="e.g., ^[A-Z0-9]+$"
                  className="mt-1 h-8 text-xs font-mono text-xs"
                />
                <p className="text-xs text-slate-500 mt-1">Optional regex for validation</p>
              </div>
            </div>
          )}
        </div>

        {/* File Upload Settings */}
        {editField.type === 'file' && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold text-slate-900">File Upload Settings</h4>
            <div>
              <label className="text-xs font-medium text-slate-700">Max File Size (bytes)</label>
              <Input
                type="number"
                value={editField.maxFileSize || ''}
                onChange={(e) => handleFieldChange('maxFileSize', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="5242880"
                className="mt-1 h-8 text-xs"
              />
              <p className="text-xs text-slate-500 mt-1">Default: 5MB</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Accepted Formats</label>
              <Input
                value={(editField.acceptedFormats || []).join(',')}
                onChange={(e) => handleFieldChange('acceptedFormats', e.target.value.split(',').map((s) => s.trim()))}
                placeholder="pdf,doc,docx"
                className="mt-1 h-8 text-xs"
              />
              <p className="text-xs text-slate-500 mt-1">Comma-separated file extensions</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-slate-50 flex gap-2 sticky bottom-0">
        <Button
          onClick={() => onFieldUpdate(editField)}
          className="flex-1"
        >
          Save Changes
        </Button>
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
