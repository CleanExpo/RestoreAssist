/**
 * Form Auto-Population Engine
 * Automatically populates form fields from client, job, user, and business data
 */

import { prisma } from '@/lib/prisma'
import { FormField, FormContextData, AutoPopulateSource } from './form-types'

/**
 * Retrieve auto-population context data for a user
 */
export async function getAutoPopulationContext(userId: string, reportId?: string): Promise<FormContextData> {
  try {
    // Fetch user/business data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        // Business details if available (depends on schema)
      },
    })

    if (!user) {
      return {}
    }

    let reportData: any = null
    let clientData: any = null

    // Fetch report and client if reportId provided
    if (reportId) {
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          reportNumber: true,
          propertyAddress: true,
          jobType: true,
          status: true,
          createdAt: true,
          clientId: true,
        },
      })

      if (report) {
        reportData = {
          id: report.id,
          reportNumber: report.reportNumber,
          propertyAddress: report.propertyAddress,
          jobType: report.jobType,
          status: report.status,
          createdAt: report.createdAt,
        }

        // Fetch client data
        if (report.clientId) {
          const client = await prisma.client.findUnique({
            where: { id: report.clientId },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
              contactPerson: true,
            },
          })

          if (client) {
            clientData = client
          }
        }
      }
    }

    return {
      user: {
        id: user.id,
        businessName: user.name || '',
        businessEmail: user.email || '',
      },
      client: clientData,
      report: reportData,
    }
  } catch (error) {
    console.error('Error getting auto-population context:', error)
    return {}
  }
}

/**
 * Auto-populate form data from context
 */
export function autoPopulateFormData(
  fields: FormField[],
  context: FormContextData,
): Record<string, any> {
  const populatedData: Record<string, any> = {}

  for (const field of fields) {
    if (field.autoPopulateFrom) {
      const value = getAutoPopulatedValue(field.autoPopulateFrom, context)
      if (value !== undefined) {
        populatedData[field.id] = value
      }
    }
  }

  return populatedData
}

/**
 * Get value for a single auto-populate source
 */
function getAutoPopulatedValue(source: AutoPopulateSource, context: FormContextData): any {
  const { type, field } = source

  switch (type) {
    case 'user':
      return getNestedValue(context.user, field)
    case 'client':
      return getNestedValue(context.client, field)
    case 'report':
      return getNestedValue(context.report, field)
    case 'business':
      return getNestedValue(context.user, field)
    default:
      return undefined
  }
}

/**
 * Get nested object value using dot notation
 * Example: getNestedValue(obj, 'address.street')
 */
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined

  const keys = path.split('.')
  let value = obj

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return undefined
    }
  }

  return value
}

/**
 * Format value for display in form
 */
export function formatValueForDisplay(value: any, fieldType: string): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (fieldType === 'date' && value instanceof Date) {
    return value.toISOString().split('T')[0]
  }

  if (fieldType === 'datetime' && value instanceof Date) {
    return value.toISOString().slice(0, 16)
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Get available fields for auto-population based on context
 */
export function getAvailableAutoPopulateFields(context: FormContextData): Record<string, string[]> {
  const available: Record<string, string[]> = {
    user: [],
    client: [],
    report: [],
    business: [],
  }

  // User/Business fields
  if (context.user) {
    available.user = Object.keys(context.user).filter((key) => key !== 'id')
    available.business = available.user
  }

  // Client fields
  if (context.client) {
    available.client = Object.keys(context.client).filter((key) => key !== 'id')
  }

  // Report fields
  if (context.report) {
    available.report = Object.keys(context.report).filter((key) => key !== 'id')
  }

  return available
}

/**
 * Validate auto-populate source exists in context
 */
export function validateAutoPopulateSource(
  source: AutoPopulateSource,
  context: FormContextData,
): boolean {
  const value = getAutoPopulatedValue(source, context)
  return value !== undefined
}

/**
 * Auto-populate form with data from submission
 */
export async function populateFromSubmission(
  submissionId: string,
): Promise<Record<string, any>> {
  try {
    const submission = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
      select: {
        formData: true,
        userId: true,
        reportId: true,
        template: {
          select: {
            formSchema: true,
          },
        },
      },
    })

    if (!submission) {
      return {}
    }

    // Parse schema if needed
    const schema =
      typeof submission.template.formSchema === 'string'
        ? JSON.parse(submission.template.formSchema)
        : submission.template.formSchema

    // Get all fields from schema
    const allFields: FormField[] = []
    for (const section of schema.sections) {
      allFields.push(...section.fields)
    }

    // Get auto-population context
    const context = await getAutoPopulationContext(submission.userId, submission.reportId)

    // Merge auto-populated data with existing form data
    const autoPopulated = autoPopulateFormData(allFields, context)
    const mergedData = {
      ...autoPopulated,
      ...submission.formData,
    }

    return mergedData
  } catch (error) {
    console.error('Error populating from submission:', error)
    return {}
  }
}

/**
 * Map common field names to their values
 */
export const COMMON_FIELD_MAPPINGS: Record<string, AutoPopulateSource> = {
  // Client info
  'client.name': { type: 'client', field: 'name' },
  'client.email': { type: 'client', field: 'email' },
  'client.phone': { type: 'client', field: 'phone' },
  'client.address': { type: 'client', field: 'address' },
  'client.contact': { type: 'client', field: 'contactPerson' },

  // Job/Report info
  'report.number': { type: 'report', field: 'reportNumber' },
  'report.address': { type: 'report', field: 'propertyAddress' },
  'report.type': { type: 'report', field: 'jobType' },
  'report.date': { type: 'report', field: 'createdAt' },

  // Business info
  'business.name': { type: 'business', field: 'businessName' },
  'business.email': { type: 'business', field: 'businessEmail' },
}

/**
 * Get suggested auto-populate source for a field label
 */
export function getSuggestedAutoPopulateSource(fieldLabel: string): AutoPopulateSource | null {
  const label = fieldLabel.toLowerCase()

  // Check common field names
  for (const [key, source] of Object.entries(COMMON_FIELD_MAPPINGS)) {
    if (label.includes(key.split('.')[1])) {
      return source
    }
  }

  // Heuristic matching
  if (label.includes('client') || label.includes('customer')) {
    if (label.includes('name')) return { type: 'client', field: 'name' }
    if (label.includes('email')) return { type: 'client', field: 'email' }
    if (label.includes('phone')) return { type: 'client', field: 'phone' }
    if (label.includes('address')) return { type: 'client', field: 'address' }
  }

  if (label.includes('address') || label.includes('property')) {
    return { type: 'report', field: 'propertyAddress' }
  }

  if (label.includes('job') && label.includes('type')) {
    return { type: 'report', field: 'jobType' }
  }

  if (label.includes('report') && label.includes('number')) {
    return { type: 'report', field: 'reportNumber' }
  }

  if (label.includes('business') || label.includes('company')) {
    if (label.includes('name')) return { type: 'business', field: 'businessName' }
    if (label.includes('email')) return { type: 'business', field: 'businessEmail' }
  }

  return null
}
