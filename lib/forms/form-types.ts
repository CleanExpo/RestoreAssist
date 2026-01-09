/**
 * Form System Type Definitions
 * Defines all TypeScript interfaces for the forms system
 */

import { FormType, FormCategory, FormTemplateStatus, FormSubmissionStatus, SignatureType, SignatoryRole } from '@prisma/client'

/**
 * Field type definitions for form builder
 */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'signature'

/**
 * Base field definition
 */
export interface FormField {
  id: string
  type: FieldType
  label: string
  placeholder?: string
  description?: string
  required: boolean
  disabled?: boolean
  hidden?: boolean
  order: number

  // Validation
  validation?: FieldValidation

  // Options for select/multiselect/checkbox/radio
  options?: FormFieldOption[]

  // Auto-population
  autoPopulateFrom?: AutoPopulateSource

  // File upload settings
  maxFileSize?: number // bytes
  acceptedFormats?: string[] // e.g., ['pdf', 'doc']
}

/**
 * Field validation rules
 */
export interface FieldValidation {
  minLength?: number
  maxLength?: number
  pattern?: string // regex
  min?: number
  max?: number
  match?: string // field id to match against
  custom?: string // custom validation function name
}

/**
 * Option for select/checkbox/radio fields
 */
export interface FormFieldOption {
  value: string
  label: string
  description?: string
}

/**
 * Auto-populate source
 */
export type AutoPopulateSource =
  | { type: 'user'; field: string }
  | { type: 'client'; field: string }
  | { type: 'report'; field: string }
  | { type: 'business'; field: string }

/**
 * Form section (for multi-step forms)
 */
export interface FormSection {
  id: string
  title: string
  description?: string
  fields: FormField[]
  order: number
  conditional?: SectionCondition
}

/**
 * Section visibility condition
 */
export interface SectionCondition {
  fieldId: string
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan'
  value: string | number | boolean
}

/**
 * Form schema (stored as JSON in database)
 */
export interface FormSchema {
  id: string
  version: number
  formType: FormType
  sections: FormSection[]
  createdAt: string
  updatedAt: string
}

/**
 * Form template
 */
export interface IFormTemplate {
  id: string
  userId: string
  formType: FormType
  name: string
  description?: string
  category: FormCategory
  status: FormTemplateStatus
  version: number
  isSystemTemplate: boolean
  isActive: boolean
  formSchema: FormSchema
  requiresSignatures: boolean
  signatureConfig?: SignatureConfig
  createdAt: Date
  updatedAt: Date
  createdBy: string
}

/**
 * Signature configuration for forms
 */
export interface SignatureConfig {
  requireSignatures: boolean
  signatories: SignatoryConfig[]
  signatureFieldsLocations?: Map<string, { x: number; y: number; page: number }>
}

/**
 * Signatory configuration
 */
export interface SignatoryConfig {
  id: string
  role: SignatoryRole
  isRequired: boolean
  label: string
}

/**
 * Form submission
 */
export interface IFormSubmission {
  id: string
  templateId: string
  userId: string
  reportId?: string
  submissionNumber: string
  status: FormSubmissionStatus
  formData: Record<string, any>
  completenessScore?: number
  validationErrors?: Record<string, string[]>
  startedAt: Date
  submittedAt?: Date
  lastSavedAt: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * Form signature
 */
export interface IFormSignature {
  id: string
  submissionId: string
  signatureFieldId: string
  signatureType: SignatureType
  signatureData?: string // Base64-encoded PNG
  signatureUrl?: string // Cloudinary URL
  signatoryName: string
  signatoryRole: SignatoryRole
  signatoryEmail?: string
  signatureRequestSent: boolean
  signatureRequestSentAt?: Date
  signedAt?: Date
  ipAddress?: string
  userAgent?: string
  gpsLocation?: string
  createdAt: Date
}

/**
 * Form submission with related data
 */
export interface FormSubmissionWithRelations extends IFormSubmission {
  template: IFormTemplate
  signatures: IFormSignature[]
}

/**
 * Form context for auto-population
 */
export interface FormContextData {
  user?: {
    id: string
    businessName?: string
    businessAddress?: string
    businessPhone?: string
    businessEmail?: string
    businessABN?: string
    businessLogo?: string
  }
  client?: {
    id: string
    name: string
    email?: string
    phone?: string
    address?: string
    contactPerson?: string
  }
  report?: {
    id: string
    propertyAddress?: string
    reportNumber?: string
    jobType?: string
    serviceType?: string
  }
}

/**
 * Form field error
 */
export interface FormFieldError {
  fieldId: string
  message: string
  type: 'required' | 'validation' | 'custom'
}

/**
 * Form validation result
 */
export interface FormValidationResult {
  isValid: boolean
  errors: FormFieldError[]
  warnings?: string[]
}

/**
 * Form submission request
 */
export interface FormSubmissionRequest {
  templateId: string
  formData: Record<string, any>
  reportId?: string
  signatures?: FormSignatureData[]
}

/**
 * Form signature data for submission
 */
export interface FormSignatureData {
  signatureFieldId: string
  signatureType: SignatureType
  signatureData?: string // Base64-encoded PNG
  signatoryName: string
  signatoryRole: SignatoryRole
  signatoryEmail?: string
}
