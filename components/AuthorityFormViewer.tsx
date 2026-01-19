"use client"

import { useState, useEffect } from "react"
import { Printer, X, CheckCircle, Clock, AlertCircle } from "lucide-react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"

interface AuthorityFormViewerProps {
  formId: string
  onClose?: () => void
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
  signatures: Array<{
    id: string
    signatoryName: string
    signatoryRole: string
    signatureData: string | null
    signedAt: Date | null
  }>
  createdAt: string
  completedAt: string | null
}

export default function AuthorityFormViewer({ formId, onClose }: AuthorityFormViewerProps) {
  const [form, setForm] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchForm()
  }, [formId])

  const fetchForm = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/authority-forms/${formId}`)
      if (response.ok) {
        const data = await response.json()
        setForm(data.form)
      } else {
        toast.error("Failed to load authority form")
      }
    } catch (error) {
      console.error("Error fetching authority form:", error)
      toast.error("Failed to load authority form")
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: { label: "Draft", color: "bg-slate-500", icon: Clock },
      PENDING_SIGNATURES: { label: "Pending Signatures", color: "bg-yellow-500", icon: Clock },
      PARTIALLY_SIGNED: { label: "Partially Signed", color: "bg-orange-500", icon: AlertCircle },
      COMPLETED: { label: "Completed", color: "bg-green-500", icon: CheckCircle },
      CANCELLED: { label: "Cancelled", color: "bg-red-500", icon: X }
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT
    const Icon = config.icon

    return (
      <span className={cn(
        "px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2",
        config.color,
        "text-white"
      )}>
        <Icon size={14} />
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Form not found</p>
      </div>
    )
  }

  const signedCount = form.signatures.filter(s => s.signedAt).length
  const totalSignatures = form.signatures.length

  return (
    <>
      <div className="bg-slate-900 min-h-screen print:bg-white">
        {/* Action Bar - Hidden when printing */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 print:hidden">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold">{form.template.name}</h2>
              {getStatusBadge(form.status)}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
              >
                <Printer size={18} />
                Print
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          </div>
        </div>

      {/* Form Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white text-black rounded-lg shadow-lg p-8 print:shadow-none print:rounded-none">
          {/* Company Header */}
          <div className="border-b-2 border-gray-300 pb-6 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {form.companyLogo && (
                  <img 
                    src={form.companyLogo} 
                    alt={form.companyName}
                    className="h-16 mb-4 print:h-12"
                  />
                )}
                <h1 className="text-3xl font-bold mb-2">{form.companyName}</h1>
                {form.companyABN && (
                  <p className="text-sm text-gray-600">ABN: {form.companyABN}</p>
                )}
                {form.companyAddress && (
                  <p className="text-sm text-gray-600 mt-1">{form.companyAddress}</p>
                )}
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                  {form.companyPhone && <span>Phone: {form.companyPhone}</span>}
                  {form.companyEmail && <span>Email: {form.companyEmail}</span>}
                  {form.companyWebsite && <span>Website: {form.companyWebsite}</span>}
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>Form ID: {formId.slice(-8)}</p>
                <p>Date: {new Date(form.createdAt).toLocaleDateString('en-AU', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}</p>
              </div>
            </div>
          </div>

          {/* Form Title */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2">{form.template.name}</h2>
            {form.template.description && (
              <p className="text-gray-600">{form.template.description}</p>
            )}
          </div>

          {/* Client Details */}
          <div className="bg-gray-50 p-6 rounded-lg mb-8">
            <h3 className="text-lg font-semibold mb-4">Client Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Client Name</p>
                <p className="font-medium">{form.clientName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Property Address</p>
                <p className="font-medium">{form.clientAddress}</p>
              </div>
              {form.incidentDate && (
                <div>
                  <p className="text-sm text-gray-600">Incident Date</p>
                  <p className="font-medium">
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
                  <p className="text-sm text-gray-600">Incident Brief</p>
                  <p className="font-medium">{form.incidentBrief}</p>
                </div>
              )}
            </div>
          </div>

          {/* Authority Description */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">Authority Granted</h3>
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="whitespace-pre-wrap leading-relaxed">{form.authorityDescription}</p>
            </div>
          </div>

          {/* Signatures Section */}
          <div className="mt-12 border-t-2 border-gray-300 pt-8">
            <h3 className="text-lg font-semibold mb-6">Signatures</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {form.signatures.map((signature, index) => (
                <div key={signature.id} className="border-2 border-gray-300 rounded-lg p-6">
                  <div className="mb-4 min-h-[120px] flex items-center justify-center bg-gray-50 rounded">
                    {signature.signatureData ? (
                      <img 
                        src={signature.signatureData.includes(',') 
                          ? signature.signatureData 
                          : `data:image/png;base64,${signature.signatureData}`}
                        alt="Signature"
                        className="max-w-full max-h-[100px] object-contain"
                      />
                    ) : (
                      <div className="text-gray-400 text-sm">Signature pending</div>
                    )}
                  </div>
                  <div className="border-t border-gray-300 pt-4 mt-4">
                    <p className="font-semibold mb-1">{signature.signatoryName}</p>
                    <p className="text-sm text-gray-600 mb-2">{signature.signatoryRole}</p>
                    {signature.signedAt && (
                      <p className="text-xs text-gray-500">
                        Signed: {new Date(signature.signedAt).toLocaleDateString('en-AU', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {totalSignatures > 0 && (
              <div className="mt-6 text-sm text-gray-600 text-center">
                Signatures: {signedCount} of {totalSignatures} completed
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-300 text-center text-sm text-gray-500">
            <p>Generated by Restore Assist</p>
            {form.companyWebsite && (
              <p className="mt-1">{form.companyWebsite}</p>
            )}
          </div>
        </div>
      </div>

      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 0.5in;
            size: letter;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          
          body > *:not(.print-content) {
            display: none !important;
          }
          
          .print\\:hidden {
            display: none !important;
            visibility: hidden !important;
          }
          
          .print\\:block {
            display: block !important;
            visibility: visible !important;
          }
          
          .print\\:mb-8 {
            margin-bottom: 2rem !important;
          }
          
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          
          .print\\:rounded-none {
            border-radius: 0 !important;
          }
          
          .print\\:h-12 {
            height: 3rem !important;
          }
          
          .print\\:bg-white {
            background: white !important;
          }
          
          /* Ensure form content is visible */
          [class*="bg-white"] {
            background: white !important;
          }
          
          [class*="text-black"] {
            color: black !important;
          }
          
          [class*="text-gray"] {
            color: #374151 !important;
          }
        }
      `}</style>
    </>
  )
}
