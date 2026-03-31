'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle, Eye, FileText, Plus, Search, Star } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface InvoiceTemplate {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  logoUrl: string | null
  usageCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

function TemplateCardSkeleton() {
  return (
    <Card className="border border-slate-200 dark:border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-56 mt-1" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Colour swatch row */}
        <div className="flex gap-2">
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-8 w-full rounded" />
        </div>
        {/* Toggle chips */}
        <div className="flex gap-2 flex-wrap">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 flex-1 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  )
}

function TemplatePreviewModal({
  template,
  open,
  onClose,
}: {
  template: InvoiceTemplate | null
  open: boolean
  onClose: () => void
}) {
  if (!template) return null

  const rows: { label: string; value: string | number | boolean | null | undefined }[] = [
    { label: 'Name', value: template.name },
    { label: 'Description', value: template.description },
    { label: 'Default', value: template.isDefault ? 'Yes' : 'No' },
    { label: 'Primary Colour', value: template.primaryColor },
    { label: 'Secondary Colour', value: template.secondaryColor },
    { label: 'Accent Colour', value: template.accentColor },
    { label: 'Logo URL', value: template.logoUrl },
    { label: 'Usage Count', value: template.usageCount },
    {
      label: 'Last Used',
      value: template.lastUsedAt
        ? new Date(template.lastUsedAt).toLocaleDateString()
        : 'Never',
    },
    { label: 'Created', value: new Date(template.createdAt).toLocaleDateString() },
    { label: 'Updated', value: new Date(template.updatedAt).toLocaleDateString() },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-white">
            {template.name}
          </DialogTitle>
        </DialogHeader>

        {/* Colour swatches preview */}
        <div className="flex gap-2 mb-2">
          {template.primaryColor && (
            <div
              className="h-10 flex-1 rounded"
              style={{ backgroundColor: template.primaryColor }}
              title={`Primary: ${template.primaryColor}`}
            />
          )}
          {template.secondaryColor && (
            <div
              className="h-10 flex-1 rounded"
              style={{ backgroundColor: template.secondaryColor }}
              title={`Secondary: ${template.secondaryColor}`}
            />
          )}
          {template.accentColor && (
            <div
              className="h-10 flex-1 rounded"
              style={{ backgroundColor: template.accentColor }}
              title={`Accent: ${template.accentColor}`}
            />
          )}
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {rows.map(({ label, value }) =>
            value !== null && value !== undefined ? (
              <div
                key={label}
                className="flex justify-between py-2 gap-4"
              >
                <span className="text-slate-500 dark:text-slate-400 shrink-0">
                  {label}
                </span>
                <span className="text-slate-900 dark:text-white text-right font-medium break-all">
                  {String(value)}
                </span>
              </div>
            ) : null
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function InvoiceTemplatesPage() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<InvoiceTemplate | null>(null)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/invoices/templates')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (err) {
      console.error('Failed to fetch templates:', err)
      toast.error('Failed to load invoice templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const handleSetDefault = async (id: string) => {
    setSettingDefaultId(id)
    try {
      const res = await fetch(`/api/invoices/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      if (!res.ok) throw new Error('Failed to set default')
      toast.success('Default template updated')
      await fetchTemplates()
    } catch (err) {
      console.error('Failed to set default template:', err)
      toast.error('Failed to set default template')
    } finally {
      setSettingDefaultId(null)
    }
  }

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Invoice Templates
          </h1>
          {!loading && (
            <Badge
              variant="secondary"
              className="text-sm px-2.5 py-0.5"
            >
              {templates.length}
            </Badge>
          )}
        </div>
        <Link href="/dashboard/invoices/templates/new">
          <Button className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0">
            <Plus className="h-4 w-4" />
            Create New Template
          </Button>
        </Link>
      </div>

      {/* Search bar */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="pl-10"
        />
      </div>

      {/* Loading skeletons */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <TemplateCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-16 w-16 text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">
            {search
              ? 'No templates match your search'
              : 'No templates yet'}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {search
              ? 'Try a different search term.'
              : 'Create your first invoice template to get started.'}
          </p>
          {!search && (
            <Link href="/dashboard/invoices/templates/new">
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </Link>
          )}
        </div>
      ) : (
        /* Template grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onSetDefault={handleSetDefault}
              settingDefaultId={settingDefaultId}
              onPreview={() => setPreviewTemplate(template)}
            />
          ))}
        </div>
      )}

      {/* Preview modal */}
      <TemplatePreviewModal
        template={previewTemplate}
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
    </div>
  )
}

function TemplateCard({
  template,
  onSetDefault,
  settingDefaultId,
  onPreview,
}: {
  template: InvoiceTemplate
  onSetDefault: (id: string) => void
  settingDefaultId: string | null
  onPreview: () => void
}) {
  const isSettingDefault = settingDefaultId === template.id

  return (
    <Card
      className={`border transition-shadow hover:shadow-md ${
        template.isDefault
          ? 'ring-2 ring-cyan-500 border-cyan-500/30'
          : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-bold text-slate-900 dark:text-white leading-tight">
            {template.name}
          </h2>
          {template.isDefault && (
            <Badge className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0 text-xs">
              Default
            </Badge>
          )}
        </div>
        {template.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
            {template.description}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Colour scheme swatches */}
        <div className="flex gap-1.5 h-8">
          {template.primaryColor ? (
            <div
              className="flex-1 rounded"
              style={{ backgroundColor: template.primaryColor }}
              title={`Primary: ${template.primaryColor}`}
            />
          ) : (
            <div className="flex-1 rounded bg-slate-200 dark:bg-slate-700" title="No primary colour" />
          )}
          {template.secondaryColor ? (
            <div
              className="flex-1 rounded"
              style={{ backgroundColor: template.secondaryColor }}
              title={`Secondary: ${template.secondaryColor}`}
            />
          ) : (
            <div className="flex-1 rounded bg-slate-200 dark:bg-slate-700" title="No secondary colour" />
          )}
          {template.accentColor ? (
            <div
              className="flex-1 rounded"
              style={{ backgroundColor: template.accentColor }}
              title={`Accent: ${template.accentColor}`}
            />
          ) : (
            <div className="flex-1 rounded bg-slate-200 dark:bg-slate-700" title="No accent colour" />
          )}
        </div>

        {/* Toggle indicators */}
        <div className="flex flex-wrap gap-1.5">
          {template.logoUrl && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              Logo
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            Terms
          </span>
          {template.usageCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              Used {template.usageCount}x
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onPreview}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Preview
          </Button>

          <Button
            variant={template.isDefault ? 'secondary' : 'outline'}
            size="sm"
            className={`flex-1 ${
              template.isDefault
                ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 cursor-default'
                : ''
            }`}
            onClick={() => !template.isDefault && onSetDefault(template.id)}
            disabled={template.isDefault || isSettingDefault}
          >
            {template.isDefault ? (
              <>
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                Default
              </>
            ) : isSettingDefault ? (
              <span className="inline-block h-3.5 w-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin mr-1.5" />
            ) : (
              <>
                <Star className="h-3.5 w-3.5 mr-1.5" />
                Set Default
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
