'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormSection, FormField } from '@/lib/forms/form-types'
import { FormBuilderSidebar } from '@/components/forms/builder/FormBuilderSidebar'
import { FormBuilderCanvas } from '@/components/forms/builder/FormBuilderCanvas'
import { FormBuilderFieldEditor } from '@/components/forms/builder/FormBuilderFieldEditor'
import { FormBuilderPreview } from '@/components/forms/builder/FormBuilderPreview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cuid } from '@/lib/utils/cuid'
import { ChevronLeft, Save, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'

type ViewMode = 'edit' | 'preview' | 'split'

export default function FormBuilderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateId = searchParams.get('id')

  // Form state
  const [formName, setFormName] = useState('Untitled Form')
  const [formDescription, setFormDescription] = useState('')
  const [sections, setSections] = useState<FormSection[]>([
    {
      id: cuid(),
      title: 'Section 1',
      description: 'Add your form fields here',
      fields: [],
      order: 0,
    },
  ])

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [selectedField, setSelectedField] = useState<FormField | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(true)
  const [showEditorPanel, setShowEditorPanel] = useState(true)

  // Load template if editing
  useEffect(() => {
    if (templateId) {
      loadTemplate(templateId)
    }
  }, [templateId])

  // Update selected field when selectedFieldId changes
  useEffect(() => {
    if (!selectedFieldId) {
      setSelectedField(null)
      return
    }

    for (const section of sections) {
      const field = section.fields.find((f) => f.id === selectedFieldId)
      if (field) {
        setSelectedField(field)
        return
      }
    }
  }, [selectedFieldId, sections])

  const loadTemplate = async (id: string) => {
    try {
      const response = await fetch(`/api/forms/builder/${id}`)
      if (!response.ok) throw new Error('Failed to load template')

      const template = await response.json()
      setFormName(template.name)
      setFormDescription(template.description || '')

      if (typeof template.formSchema === 'string') {
        const schema = JSON.parse(template.formSchema)
        setSections(schema.sections)
      } else {
        setSections(template.formSchema.sections)
      }
    } catch (error) {
      console.error('Error loading template:', error)
    }
  }

  const handleSaveTemplate = async () => {
    setIsSaving(true)
    try {
      const formSchema = {
        id: `form-${Date.now()}`,
        version: 1,
        formType: 'CUSTOM',
        sections,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const url = templateId ? `/api/forms/builder/${templateId}` : '/api/forms/builder'
      const method = templateId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          formSchema,
          formType: 'CUSTOM',
          category: 'CUSTOM',
          isActive: true,
        }),
      })

      if (!response.ok) throw new Error('Failed to save template')

      setIsSaved(true)
      // Redirect to templates list after save
      setTimeout(() => router.push('/dashboard/forms'), 1500)
    } catch (error) {
      console.error('Error saving template:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddSection = () => {
    const newSection: FormSection = {
      id: cuid(),
      title: `Section ${sections.length + 1}`,
      description: '',
      fields: [],
      order: sections.length,
    }
    setSections([...sections, newSection])
    setIsSaved(false)
  }

  const handleDeleteSection = (sectionId: string) => {
    setSections(sections.filter((s) => s.id !== sectionId))
    if (selectedFieldId && sections.find((s) => s.id === sectionId)?.fields.find((f) => f.id === selectedFieldId)) {
      setSelectedFieldId(null)
    }
    setIsSaved(false)
  }

  const handleFieldDelete = (fieldId: string) => {
    const updatedSections = sections.map((section) => ({
      ...section,
      fields: section.fields.filter((f) => f.id !== fieldId),
    }))
    setSections(updatedSections)
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null)
    }
    setIsSaved(false)
  }

  const handleFieldUpdate = (updatedField: FormField) => {
    const updatedSections = sections.map((section) => ({
      ...section,
      fields: section.fields.map((f) => (f.id === updatedField.id ? updatedField : f)),
    }))
    setSections(updatedSections)
    setSelectedField(updatedField)
    setIsSaved(false)
  }

  return (
    <div className="h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} className="text-slate-300" />
          </button>
          <div>
            <Input
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value)
                setIsSaved(false)
              }}
              className="bg-slate-700 border-slate-600 text-white text-lg font-semibold"
              placeholder="Form name"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex gap-1 bg-slate-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('edit')}
              className={`px-3 py-1 rounded transition-colors text-sm font-medium ${
                viewMode === 'edit' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1 rounded transition-colors text-sm font-medium ${
                viewMode === 'split' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Split
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1 rounded transition-colors text-sm font-medium ${
                viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Preview
            </button>
          </div>

          {/* Save Status */}
          <div className="flex items-center gap-2">
            {!isSaved && <span className="text-xs text-yellow-500">Unsaved changes</span>}
            <Button
              onClick={handleSaveTemplate}
              disabled={isSaving || isSaved}
              className="gap-2"
            >
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Field Palette */}
        {viewMode !== 'preview' && <FormBuilderSidebar />}

        {/* Canvas */}
        {viewMode !== 'preview' && (
          <FormBuilderCanvas
            sections={sections}
            onSectionsChange={(newSections) => {
              setSections(newSections)
              setIsSaved(false)
            }}
            selectedFieldId={selectedFieldId}
            onFieldSelect={setSelectedFieldId}
            onFieldDelete={handleFieldDelete}
          />
        )}

        {/* Preview Panel */}
        {viewMode !== 'edit' && (
          <FormBuilderPreview sections={sections} formName={formName} />
        )}

        {/* Editor Panel */}
        {viewMode === 'split' && showEditorPanel && selectedField && (
          <FormBuilderFieldEditor
            field={selectedField}
            onFieldUpdate={handleFieldUpdate}
            onClose={() => setSelectedFieldId(null)}
          />
        )}
      </div>

      {/* Bottom Toolbar */}
      <div className="bg-slate-800 border-t border-slate-700 px-6 py-3 flex items-center justify-between text-sm text-slate-300">
        <div className="flex gap-4">
          <Button
            onClick={handleAddSection}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Plus size={16} />
            Add Section
          </Button>
          <span className="text-xs px-3 py-1 bg-slate-700 rounded">
            {sections.reduce((acc, s) => acc + s.fields.length, 0)} fields
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Form Builder • {sections.length} section{sections.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
