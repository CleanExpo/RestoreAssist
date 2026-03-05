"use client"

import { useState } from "react"
import { Edit2, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import toast from "react-hot-toast"

interface EditableReportSectionProps {
  section: string
  fields: Record<string, {
    label: string
    type: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'boolean'
    value: any
    options?: string[]
    multiline?: boolean
  }>
  onSave: (section: string, data: Record<string, any>) => Promise<void>
}

export default function EditableReportSection({ section, fields, onSave }: EditableReportSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {}
    Object.keys(fields).forEach(key => {
      initial[key] = fields[key].value
    })
    return initial
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    try {
      setSaving(true)
      await onSave(section, formData)
      setIsEditing(false)
      toast.success(`${section} updated successfully`)
    } catch (error) {
      console.error("Error saving section:", error)
      toast.error("Failed to save changes")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset form data to original values
    const reset: Record<string, any> = {}
    Object.keys(fields).forEach(key => {
      reset[key] = fields[key].value
    })
    setFormData(reset)
    setIsEditing(false)
  }

  const updateField = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
      <div className="flex items-center justify-between p-6 border-b border-slate-700">
        <h2 className="text-xl font-semibold capitalize">{section}</h2>
        {!isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="text-slate-400 hover:text-white"
          >
            <Edit2 size={16} className="mr-2" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="text-slate-400 hover:text-white"
            >
              <X size={16} className="mr-2" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              <Save size={16} className="mr-2" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-4">
        {Object.entries(fields).map(([key, field]) => (
          <div key={key}>
            <Label className="text-sm text-slate-400 mb-2 block">{field.label}</Label>
            {isEditing ? (
              <>
                {field.type === 'textarea' && (
                  <Textarea
                    value={formData[key] || ''}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white"
                    rows={field.multiline ? 4 : 2}
                  />
                )}
                {field.type === 'text' && (
                  <Input
                    type="text"
                    value={formData[key] || ''}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                )}
                {field.type === 'number' && (
                  <Input
                    type="number"
                    value={formData[key] || ''}
                    onChange={(e) => updateField(key, parseFloat(e.target.value) || 0)}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                )}
                {field.type === 'date' && (
                  <Input
                    type="datetime-local"
                    value={formData[key] || ''}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                )}
                {field.type === 'select' && field.options && (
                  <Select
                    value={formData[key] || ''}
                    onValueChange={(value) => updateField(key, value)}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {field.options.map((option) => (
                        <SelectItem key={option} value={option} className="text-white">
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.type === 'boolean' && (
                  <Select
                    value={formData[key] ? 'Yes' : 'No'}
                    onValueChange={(value) => updateField(key, value === 'Yes')}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="Yes" className="text-white">Yes</SelectItem>
                      <SelectItem value="No" className="text-white">No</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </>
            ) : (
              <p className="text-white font-medium">
                {field.type === 'boolean' 
                  ? (formData[key] ? 'Yes' : 'No')
                  : (formData[key] || 'N/A')
                }
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

