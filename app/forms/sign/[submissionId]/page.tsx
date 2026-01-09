'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PublicFormView } from '@/components/forms/public/PublicFormView'
import { FormSchema } from '@/lib/forms/form-types'
import { AlertCircle, Loader2 } from 'lucide-react'

interface SignaturePageProps {
  params: { submissionId: string }
}

export default function SignaturePage({ params }: SignaturePageProps) {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [submission, setSubmission] = useState<any>(null)
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Invalid signature link. No token provided.')
      setIsLoading(false)
      return
    }

    loadSubmission()
  }, [params.submissionId, token])

  const loadSubmission = async () => {
    try {
      const response = await fetch(
        `/api/forms/public/${params.submissionId}?token=${encodeURIComponent(token!)}`,
      )

      if (!response.ok) {
        if (response.status === 401) {
          setError('This link is invalid or has expired.')
        } else if (response.status === 404) {
          setError('Form submission not found.')
        } else {
          setError('Failed to load form.')
        }
        return
      }

      const data = await response.json()
      setSubmission(data.submission)

      // Parse form schema
      const schema =
        typeof data.formSchema === 'string'
          ? JSON.parse(data.formSchema)
          : data.formSchema

      setFormSchema(schema)
    } catch (err) {
      console.error('Error loading submission:', err)
      setError('Failed to load form. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitSignature = async (formData: Record<string, any>, signatureData: string) => {
    try {
      const response = await fetch('/api/forms/signatures/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureToken: token,
          signatureData,
          formData,
          ipAddress: await getClientIp(),
          userAgent: navigator.userAgent,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to submit signature')
      }

      // Success - PublicFormView will handle showing success state
    } catch (err) {
      throw err
    }
  }

  const getClientIp = async (): Promise<string> => {
    try {
      const response = await fetch('https://api.ipify.org?format=json')
      if (response.ok) {
        const data = await response.json()
        return data.ip
      }
    } catch {
      // Fallback
    }
    return ''
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <p className="text-slate-600">Loading form...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="flex gap-4 mb-4">
            <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-red-900">Unable to Load Form</h2>
              <p className="text-red-700 mt-2">{error}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-6">
            Please check the link and try again. If the problem persists, contact the sender.
          </p>
        </div>
      </div>
    )
  }

  if (!formSchema || !submission) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600">Form not available</p>
        </div>
      </div>
    )
  }

  return (
    <PublicFormView
      formSchema={formSchema}
      submissionId={params.submissionId}
      signatureToken={token!}
      signatoryName={submission.signatoryName}
      signatoryEmail={submission.signatoryEmail}
      onSubmitSignature={handleSubmitSignature}
    />
  )
}
