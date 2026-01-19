"use client"

import { useRouter, useParams } from "next/navigation"
import AuthorityFormViewer from "@/components/AuthorityFormViewer"

export default function AuthorityFormPage() {
  const router = useRouter()
  const params = useParams()
  const formId = params.formId as string
  const reportId = params.id as string

  const handleClose = () => {
    router.push(`/dashboard/reports/${reportId}?tab=authority`)
  }

  return (
    <div className="min-h-screen">
      <AuthorityFormViewer 
        formId={formId}
        onClose={handleClose}
      />
    </div>
  )
}
