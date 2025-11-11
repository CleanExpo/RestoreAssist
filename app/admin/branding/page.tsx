'use client'

import BrandUploader from '@/components/BrandUploader'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AdminBrandingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">Report Branding</h1>
            <p className="text-slate-400 text-sm mt-1">
              Customize the appearance of generated PDF reports
            </p>
          </div>
        </div>

        {/* Admin Notice */}
        <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4 mb-6">
          <p className="text-blue-200 text-sm">
            <strong>🔧 Admin Tool</strong><br />
            Changes made here will apply to all newly generated reports.
            Existing PDFs will not be affected. Configuration is stored in <code className="bg-slate-700 px-1 rounded">public/config/brand.json</code>.
          </p>
        </div>

        {/* Brand Upload Component */}
        <BrandUploader />
      </div>
    </div>
  )
}
