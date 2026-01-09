/**
 * Form Validation Utilities
 * Runtime validation and error handling for form submissions
 */

import { FormField, FormValidationResult, FormFieldError, FormContextData, AutoPopulateSource } from './form-types'

/**
 * Validate a single form field value
 */
export function validateField(
  field: FormField,
  value: any,
): FormFieldError[] {
  const errors: FormFieldError[] = []

  // Required field check
  if (field.required && !value) {
    errors.push({
      fieldId: field.id,
      message: `${field.label} is required`,
      type: 'required',
    })
    return errors
  }

  // Skip validation if value is empty and not required
  if (!value && !field.required) {
    return errors
  }

  // Type-specific validation
  switch (field.type) {
    case 'email':
      if (!isValidEmail(value)) {
        errors.push({
          fieldId: field.id,
          message: `${field.label} must be a valid email address`,
          type: 'validation',
        })
      }
      break

    case 'phone':
      if (!isValidPhone(value)) {
        errors.push({
          fieldId: field.id,
          message: `${field.label} must be a valid phone number`,
          type: 'validation',
        })
      }
      break

    case 'number':
      if (isNaN(Number(value))) {
        errors.push({
          fieldId: field.id,
          message: `${field.label} must be a number`,
          type: 'validation',
        })
      }
      break

    case 'date':
      if (!isValidDate(value)) {
        errors.push({
          fieldId: field.id,
          message: `${field.label} must be a valid date`,
          type: 'validation',
        })
      }
      break
  }

  // Custom validation rules
  if (field.validation) {
    if (field.validation.minLength && String(value).length < field.validation.minLength) {
      errors.push({
        fieldId: field.id,
        message: `${field.label} must be at least ${field.validation.minLength} characters`,
        type: 'validation',
      })
    }

    if (field.validation.maxLength && String(value).length > field.validation.maxLength) {
      errors.push({
        fieldId: field.id,
        message: `${field.label} must not exceed ${field.validation.maxLength} characters`,
        type: 'validation',
      })
    }

    if (field.validation.pattern) {
      const regex = new RegExp(field.validation.pattern)
      if (!regex.test(String(value))) {
        errors.push({
          fieldId: field.id,
          message: `${field.label} format is invalid`,
          type: 'validation',
        })
      }
    }

    if (field.validation.min && Number(value) < field.validation.min) {
      errors.push({
        fieldId: field.id,
        message: `${field.label} must be at least ${field.validation.min}`,
        type: 'validation',
      })
    }

    if (field.validation.max && Number(value) > field.validation.max) {
      errors.push({
        fieldId: field.id,
        message: `${field.label} must not exceed ${field.validation.max}`,
        type: 'validation',
      })
    }
  }

  return errors
}

/**
 * Validate entire form submission
 */
export function validateFormSubmission(
  formData: Record<string, any>,
  fields: FormField[],
): FormValidationResult {
  const errors: FormFieldError[] = []

  for (const field of fields) {
    const fieldErrors = validateField(field, formData[field.id])
    errors.push(...fieldErrors)
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Email validation
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Phone validation (basic)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/
  return phoneRegex.test(phone.replace(/\D/g, '').length >= 10 ? phone : '')
}

/**
 * Date validation
 */
export function isValidDate(date: any): boolean {
  if (typeof date === 'string') {
    const d = new Date(date)
    return !isNaN(d.getTime())
  }
  if (date instanceof Date) {
    return !isNaN(date.getTime())
  }
  return false
}

/**
 * Get auto-populated value from context
 */
export function getAutoPopulatedValue(
  source: AutoPopulateSource,
  context: FormContextData,
): any {
  const { type, field } = source

  switch (type) {
    case 'user':
      return (context.user as any)?.[field]
    case 'client':
      return (context.client as any)?.[field]
    case 'report':
      return (context.report as any)?.[field]
    case 'business':
      return (context.user as any)?.[field] // Business info is in user object
    default:
      return undefined
  }
}

/**
 * Calculate form completeness score
 */
export function calculateCompletenessScore(
  formData: Record<string, any>,
  fields: FormField[],
): number {
  const requiredFields = fields.filter((f) => f.required)
  if (requiredFields.length === 0) return 100

  const completedFields = requiredFields.filter((f) => {
    const value = formData[f.id]
    return value !== undefined && value !== null && value !== ''
  })

  return Math.round((completedFields.length / requiredFields.length) * 100)
}

/**
 * Sanitize form data to remove xss
 */
export function sanitizeFormData(formData: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {}

  for (const [key, value] of Object.entries(formData)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value)
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((v) => (typeof v === 'string' ? sanitizeString(v) : v))
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * Sanitize individual string value
 */
function sanitizeString(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

/**
 * Compare two form states to detect changes
 */
export function detectFormChanges(
  originalData: Record<string, any>,
  currentData: Record<string, any>,
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {}

  const allKeys = new Set([...Object.keys(originalData), ...Object.keys(currentData)])

  for (const key of allKeys) {
    const oldValue = originalData[key]
    const newValue = currentData[key]

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { old: oldValue, new: newValue }
    }
  }

  return changes
}
