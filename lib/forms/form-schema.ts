/**
 * Zod Validation Schemas for Form System
 */

import { z } from 'zod'
import { FormType, FormCategory, SignatureType, SignatoryRole } from '@prisma/client'

/**
 * Field validation schema
 */
export const FieldValidationSchema = z.object({
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  match: z.string().optional(),
  custom: z.string().optional(),
})

/**
 * Form field option schema
 */
export const FormFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  description: z.string().optional(),
})

/**
 * Auto-populate source schema
 */
export const AutoPopulateSourceSchema = z.union([
  z.object({ type: z.literal('user'), field: z.string() }),
  z.object({ type: z.literal('client'), field: z.string() }),
  z.object({ type: z.literal('report'), field: z.string() }),
  z.object({ type: z.literal('business'), field: z.string() }),
])

/**
 * Form field schema
 */
export const FormFieldSchema = z.object({
  id: z.string().cuid(),
  type: z.enum([
    'text',
    'textarea',
    'email',
    'phone',
    'number',
    'date',
    'datetime',
    'select',
    'multiselect',
    'checkbox',
    'radio',
    'file',
    'signature',
  ]),
  label: z.string().min(1),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean(),
  disabled: z.boolean().optional(),
  hidden: z.boolean().optional(),
  order: z.number().int(),
  validation: FieldValidationSchema.optional(),
  options: z.array(FormFieldOptionSchema).optional(),
  autoPopulateFrom: AutoPopulateSourceSchema.optional(),
  maxFileSize: z.number().optional(),
  acceptedFormats: z.array(z.string()).optional(),
})

/**
 * Section condition schema
 */
export const SectionConditionSchema = z.object({
  fieldId: z.string(),
  operator: z.enum(['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan']),
  value: z.union([z.string(), z.number(), z.boolean()]),
})

/**
 * Form section schema
 */
export const FormSectionSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(FormFieldSchema),
  order: z.number().int(),
  conditional: SectionConditionSchema.optional(),
})

/**
 * Form schema (overall)
 */
export const FormSchemaSchema = z.object({
  id: z.string().cuid(),
  version: z.number().int(),
  formType: z.nativeEnum(FormType),
  sections: z.array(FormSectionSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

/**
 * Signatory config schema
 */
export const SignatoryConfigSchema = z.object({
  id: z.string().cuid(),
  role: z.nativeEnum(SignatoryRole),
  isRequired: z.boolean(),
  label: z.string().min(1),
})

/**
 * Signature config schema
 */
export const SignatureConfigSchema = z.object({
  requireSignatures: z.boolean(),
  signatories: z.array(SignatoryConfigSchema),
  signatureFieldsLocations: z.map(z.string(), z.object({
    x: z.number(),
    y: z.number(),
    page: z.number(),
  })).optional(),
})

/**
 * Create form template request schema
 */
export const CreateFormTemplateSchema = z.object({
  formType: z.nativeEnum(FormType),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.nativeEnum(FormCategory),
  formSchema: FormSchemaSchema,
  requiresSignatures: z.boolean().default(false),
  signatureConfig: SignatureConfigSchema.optional(),
})

/**
 * Form submission data schema
 */
export const FormSubmissionDataSchema = z.record(z.string(), z.any())

/**
 * Form signature data schema
 */
export const FormSignatureDataSchema = z.object({
  signatureFieldId: z.string(),
  signatureType: z.nativeEnum(SignatureType),
  signatureData: z.string().optional(),
  signatoryName: z.string().min(1),
  signatoryRole: z.nativeEnum(SignatoryRole),
  signatoryEmail: z.string().email().optional(),
})

/**
 * Submit form request schema
 */
export const SubmitFormRequestSchema = z.object({
  templateId: z.string().cuid(),
  formData: FormSubmissionDataSchema,
  reportId: z.string().cuid().optional(),
  signatures: z.array(FormSignatureDataSchema).optional(),
})

/**
 * Update form submission schema
 */
export const UpdateFormSubmissionSchema = z.object({
  formData: FormSubmissionDataSchema,
  signatures: z.array(FormSignatureDataSchema).optional(),
})

/**
 * Form field error schema
 */
export const FormFieldErrorSchema = z.object({
  fieldId: z.string(),
  message: z.string(),
  type: z.enum(['required', 'validation', 'custom']),
})

/**
 * Form validation result schema
 */
export const FormValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(FormFieldErrorSchema),
  warnings: z.array(z.string()).optional(),
})

// Type inference from schemas
export type FormField = z.infer<typeof FormFieldSchema>
export type FormSection = z.infer<typeof FormSectionSchema>
export type FormSchema = z.infer<typeof FormSchemaSchema>
export type CreateFormTemplateRequest = z.infer<typeof CreateFormTemplateSchema>
export type SubmitFormRequest = z.infer<typeof SubmitFormRequestSchema>
export type FormValidationResult = z.infer<typeof FormValidationResultSchema>
export type FormSignatureData = z.infer<typeof FormSignatureDataSchema>
