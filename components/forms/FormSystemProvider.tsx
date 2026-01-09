'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { FormContextData, IFormSubmission, IFormTemplate } from '@/lib/forms/form-types'

/**
 * Form System Context
 * Manages global form state, cache, and utilities
 */

interface FormSystemContextType {
  // Auto-population data
  contextData: FormContextData
  setContextData: (data: FormContextData) => void

  // Form templates cache
  formTemplates: Map<string, IFormTemplate>
  cacheFormTemplate: (template: IFormTemplate) => void
  getCachedTemplate: (templateId: string) => IFormTemplate | undefined

  // Form submissions in progress
  draftSubmissions: Map<string, IFormSubmission>
  saveDraftSubmission: (submission: IFormSubmission) => void
  getDraftSubmission: (submissionId: string) => IFormSubmission | undefined
  clearDraftSubmission: (submissionId: string) => void

  // Signature requests tracking
  pendingSignatureRequests: Map<string, { token: string; expiresAt: Date }>
  addSignatureRequest: (submissionId: string, token: string, expiresAt: Date) => void
  getSignatureRequest: (submissionId: string) => { token: string; expiresAt: Date } | undefined
  removeSignatureRequest: (submissionId: string) => void
}

const FormSystemContext = createContext<FormSystemContextType | undefined>(undefined)

/**
 * FormSystemProvider - Wraps application to provide form system context
 */
export function FormSystemProvider({ children }: { children: ReactNode }) {
  const [contextData, setContextData] = useState<FormContextData>({})
  const [formTemplates] = useState<Map<string, IFormTemplate>>(new Map())
  const [draftSubmissions] = useState<Map<string, IFormSubmission>>(new Map())
  const [pendingSignatureRequests] = useState<Map<string, { token: string; expiresAt: Date }>>(new Map())

  const cacheFormTemplate = useCallback((template: IFormTemplate) => {
    formTemplates.set(template.id, template)
  }, [formTemplates])

  const getCachedTemplate = useCallback((templateId: string) => {
    return formTemplates.get(templateId)
  }, [formTemplates])

  const saveDraftSubmission = useCallback((submission: IFormSubmission) => {
    draftSubmissions.set(submission.id, submission)
  }, [draftSubmissions])

  const getDraftSubmission = useCallback((submissionId: string) => {
    return draftSubmissions.get(submissionId)
  }, [draftSubmissions])

  const clearDraftSubmission = useCallback((submissionId: string) => {
    draftSubmissions.delete(submissionId)
  }, [draftSubmissions])

  const addSignatureRequest = useCallback((submissionId: string, token: string, expiresAt: Date) => {
    pendingSignatureRequests.set(submissionId, { token, expiresAt })
  }, [pendingSignatureRequests])

  const getSignatureRequest = useCallback((submissionId: string) => {
    const request = pendingSignatureRequests.get(submissionId)
    if (request && new Date() > request.expiresAt) {
      pendingSignatureRequests.delete(submissionId)
      return undefined
    }
    return request
  }, [pendingSignatureRequests])

  const removeSignatureRequest = useCallback((submissionId: string) => {
    pendingSignatureRequests.delete(submissionId)
  }, [pendingSignatureRequests])

  const value: FormSystemContextType = {
    contextData,
    setContextData,
    formTemplates,
    cacheFormTemplate,
    getCachedTemplate,
    draftSubmissions,
    saveDraftSubmission,
    getDraftSubmission,
    clearDraftSubmission,
    pendingSignatureRequests,
    addSignatureRequest,
    getSignatureRequest,
    removeSignatureRequest,
  }

  return (
    <FormSystemContext.Provider value={value}>
      {children}
    </FormSystemContext.Provider>
  )
}

/**
 * useFormSystem - Hook to access form system context
 */
export function useFormSystem() {
  const context = useContext(FormSystemContext)
  if (!context) {
    throw new Error('useFormSystem must be used within FormSystemProvider')
  }
  return context
}

/**
 * Hook to get context data for auto-population
 */
export function useFormContext() {
  const { contextData } = useFormSystem()
  return contextData
}

/**
 * Hook to manage form draft submissions
 */
export function useDraftSubmission() {
  const { saveDraftSubmission, getDraftSubmission, clearDraftSubmission } = useFormSystem()
  return { saveDraftSubmission, getDraftSubmission, clearDraftSubmission }
}
