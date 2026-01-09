'use client'

import React from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { WorkOrderForm } from '@/components/forms/predefined/WorkOrderForm'
import { AuthorityForm } from '@/components/forms/predefined/AuthorityForm'
import { JSAForm } from '@/components/forms/predefined/JSAForm'
import { SDSForm } from '@/components/forms/predefined/SDSForm'
import { SWIMSForm } from '@/components/forms/predefined/SWIMSForm'
import { SiteInductionForm } from '@/components/forms/predefined/SiteInductionForm'

/**
 * Pre-defined Form Page
 * Route: /dashboard/forms/predefined/[formId]
 */
export default function PredefinedFormPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const formId = params.formId as string
  const reportId = searchParams.get('reportId') || undefined

  const formComponents: Record<string, React.ReactNode> = {
    'work-order': <WorkOrderForm reportId={reportId} />,
    'authority': <AuthorityForm reportId={reportId} />,
    'jsa': <JSAForm reportId={reportId} />,
    'sds': <SDSForm reportId={reportId} />,
    'swims': <SWIMSForm reportId={reportId} />,
    'site-induction': <SiteInductionForm reportId={reportId} />,
  }

  const formNames: Record<string, string> = {
    'work-order': 'Work Order',
    'authority': 'Authority to Proceed',
    'jsa': 'Job Safety Analysis',
    'sds': 'Safety Data Sheet',
    'swims': 'Safe Work Information Management System',
    'site-induction': 'Site Induction',
  }

  const component = formComponents[formId]
  const formName = formNames[formId]

  if (!component) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Form Not Found</h1>
        <p className="text-gray-600">The form "{formId}" does not exist.</p>
      </div>
    )
  }

  return (
    <div className="py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{formName}</h1>
        {reportId && (
          <p className="mt-2 text-sm text-gray-600">
            Linked to Report: <span className="font-medium">{reportId}</span>
          </p>
        )}
      </div>
      <div className="bg-white rounded-lg shadow">{component}</div>
    </div>
  )
}
