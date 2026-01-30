'use client'

import { X, PenTool, Eye, FileText, Download } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface Signature {
  id: string
  signatoryName: string
  signatoryRole: string
  signatoryEmail: string | null
  signatureData: string | null
  signedAt: Date | null
}

interface FormData {
  id: string
  template: {
    id: string
    name: string
    code: string
    description: string | null
  }
  companyName: string
  companyLogo: string | null
  companyABN: string | null
  companyPhone: string | null
  companyEmail: string | null
  companyWebsite: string | null
  companyAddress: string | null
  clientName: string
  clientAddress: string
  incidentBrief: string | null
  incidentDate: Date | null
  authorityDescription: string
  status: string
  signatures: Signature[]
  createdAt: string
}

interface FormPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: FormData
  onSign?: () => void
  onDownload?: () => void
}

/**
 * FormPreviewModal - Full form preview before signing
 *
 * Shows complete authority form with all sections in a read-only view.
 * User can review the entire form before proceeding to sign.
 */
export function FormPreviewModal({
  open,
  onOpenChange,
  form,
  onSign,
  onDownload,
}: FormPreviewModalProps) {
  const canSign = form && ['DRAFT', 'PENDING_SIGNATURES', 'PARTIALLY_SIGNED'].includes(form.status) &&
    form.signatures.some(s => !s.signedAt)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Eye className="h-5 w-5 text-cyan-500" />
                Form Preview
              </DialogTitle>
              <DialogDescription className="mt-1">
                {form.template.name} — Review before signing
              </DialogDescription>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Form Content - Scrollable */}
        <ScrollArea className="h-[calc(90vh-180px)]">
          <div className="px-6 py-6">
            {/* Company Header */}
            <div className="border-b-2 border-gray-300 dark:border-slate-700 pb-6 mb-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {form.companyLogo && (
                    <img
                      src={form.companyLogo}
                      alt={form.companyName}
                      className="h-14 mb-3"
                    />
                  )}
                  <h2 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">
                    {form.companyName}
                  </h2>
                  {form.companyABN && (
                    <p className="text-sm text-muted-foreground">ABN: {form.companyABN}</p>
                  )}
                  {form.companyAddress && (
                    <p className="text-sm text-muted-foreground mt-1">{form.companyAddress}</p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                    {form.companyPhone && <span>Phone: {form.companyPhone}</span>}
                    {form.companyEmail && <span>Email: {form.companyEmail}</span>}
                    {form.companyWebsite && <span>Website: {form.companyWebsite}</span>}
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>Form ID: {form.id.slice(-8)}</p>
                  <p>Date: {new Date(form.createdAt).toLocaleDateString('en-AU', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })}</p>
                </div>
              </div>
            </div>

            {/* Form Title */}
            <div className="mb-6">
              <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">
                {form.template.name}
              </h3>
              {form.template.description && (
                <p className="text-muted-foreground">{form.template.description}</p>
              )}
            </div>

            {/* Client Details */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-5 mb-6">
              <h4 className="text-base font-semibold mb-3 text-slate-900 dark:text-white">
                Client Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Client Name</p>
                  <p className="font-medium mt-0.5">{form.clientName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Property Address</p>
                  <p className="font-medium mt-0.5">{form.clientAddress}</p>
                </div>
                {form.incidentDate && (
                  <div>
                    <p className="text-muted-foreground">Incident Date</p>
                    <p className="font-medium mt-0.5">
                      {new Date(form.incidentDate).toLocaleDateString('en-AU', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                )}
                {form.incidentBrief && (
                  <div className="md:col-span-2">
                    <p className="text-muted-foreground">Incident Brief</p>
                    <p className="font-medium mt-0.5">{form.incidentBrief}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Authority Description */}
            <div className="mb-6">
              <h4 className="text-base font-semibold mb-3 text-slate-900 dark:text-white">
                Authority Granted
              </h4>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-5">
                <p className="whitespace-pre-wrap leading-relaxed text-sm">
                  {form.authorityDescription}
                </p>
              </div>
            </div>

            {/* Signatures Section */}
            <div className="border-t-2 border-gray-300 dark:border-slate-700 pt-6">
              <h4 className="text-base font-semibold mb-4 text-slate-900 dark:text-white">
                Required Signatures ({form.signatures.filter(s => s.signedAt).length} of {form.signatures.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {form.signatures.map((signature) => (
                  <div
                    key={signature.id}
                    className={cn(
                      "border-2 rounded-lg p-4 transition-colors",
                      signature.signedAt
                        ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20"
                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    )}
                  >
                    <div className="mb-3 min-h-[100px] flex items-center justify-center bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                      {signature.signatureData ? (
                        <img
                          src={signature.signatureData.includes(',')
                            ? signature.signatureData
                            : `data:image/png;base64,${signature.signatureData}`}
                          alt="Signature"
                          className="max-w-full max-h-[90px] object-contain"
                        />
                      ) : (
                        <div className="text-muted-foreground text-xs py-4">Signature pending</div>
                      )}
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                      <p className="font-semibold text-sm">{signature.signatoryName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{signature.signatoryRole}</p>
                      {signature.signedAt && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                          ✓ Signed {new Date(signature.signedAt).toLocaleDateString('en-AU')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-muted-foreground">
              <p>Generated by RestoreAssist</p>
              {form.companyWebsite && (
                <p className="mt-1">{form.companyWebsite}</p>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <FileText className="h-4 w-4 inline mr-1.5" />
            {form.template.name}
          </div>
          <div className="flex items-center gap-3">
            {onDownload && (
              <button
                onClick={onDownload}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>
            )}
            {canSign && onSign && (
              <button
                onClick={onSign}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
              >
                <PenTool className="h-4 w-4" />
                Sign This Form
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
