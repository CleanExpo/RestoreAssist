import { z } from 'zod'

/**
 * Input validation schemas for API routes
 * Using Zod for runtime type checking and input sanitization
 */

// Email validation with proper format and max length
const emailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email must be less than 255 characters')
  .toLowerCase()
  .trim()

// Password validation - minimum 8 characters, at least one letter and one number
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

// Name validation - alphanumeric and common special characters only
const nameSchema = z.string()
  .min(1, 'Name is required')
  .max(100, 'Name must be less than 100 characters')
  .trim()

// Phone validation - flexible format
const phoneSchema = z.string()
  .max(20, 'Phone number must be less than 20 characters')
  .regex(/^[0-9\s\-\+\(\)]+$/, 'Invalid phone number format')
  .optional()

// Address validation
const addressSchema = z.string()
  .max(500, 'Address must be less than 500 characters')
  .trim()
  .optional()

// User registration schema
export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export type RegisterInput = z.infer<typeof registerSchema>

// Client creation schema
export const createClientSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  address: addressSchema,
  company: z.string().max(100).trim().optional(),
  contactPerson: z.string().max(100).trim().optional(),
  notes: z.string().max(2000).trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
})

export type CreateClientInput = z.infer<typeof createClientSchema>

// Report creation schema
export const createReportSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  clientName: z.string().min(1).max(100).trim(),
  clientId: z.string().uuid().optional(),
  propertyAddress: z.string().min(1).max(500).trim(),
  waterCategory: z.enum(['Category 1', 'Category 2', 'Category 3']),
  waterClass: z.enum(['Class 1', 'Class 2', 'Class 3', 'Class 4']),
  hazardType: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'HEALTHCARE', 'EDUCATIONAL', 'OTHER']).optional(),
  insuranceType: z.enum(['HOME', 'BUSINESS', 'LANDLORD', 'CONTENTS', 'LIABILITY', 'OTHER']).optional(),
  sourceOfWater: z.string().max(200).optional(),
  affectedArea: z.number().min(0).max(1000000).optional(),
  safetyHazards: z.string().max(2000).optional(),
  inspectionDate: z.string().datetime().optional(),
  completionDate: z.string().datetime().optional(),
  totalCost: z.number().min(0).optional(),
  description: z.string().max(5000).optional(),
  reportNumber: z.string().max(50).optional(),
  // Complex nested objects
  structuralDamage: z.string().max(2000).optional(),
  contentsDamage: z.string().max(2000).optional(),
  hvacAffected: z.boolean().optional(),
  electricalHazards: z.boolean().optional(),
  microbialGrowth: z.boolean().optional(),
  remediationData: z.object({
    safetyPlan: z.string().max(2000).optional(),
    containmentSetup: z.string().max(2000).optional(),
    decontaminationProcedures: z.string().max(2000).optional(),
    postRemediationVerification: z.string().max(2000).optional(),
  }).optional(),
  dryingPlan: z.object({
    targetHumidity: z.number().min(0).max(100).optional(),
    targetTemperature: z.number().min(0).max(100).optional(),
    estimatedDryingTime: z.number().min(0).optional(),
  }).optional(),
  equipmentSizing: z.object({
    equipmentPlacement: z.string().max(2000).optional(),
  }).optional(),
  monitoringData: z.object({
    psychrometricReadings: z.array(z.any()).optional(),
    moistureReadings: z.array(z.any()).optional(),
  }).optional(),
  insuranceData: z.object({
    propertyCover: z.any().optional(),
    contentsCover: z.any().optional(),
    liabilityCover: z.any().optional(),
    businessInterruption: z.any().optional(),
    additionalCover: z.any().optional(),
  }).optional(),
})

export type CreateReportInput = z.infer<typeof createReportSchema>

// Query parameter validation schemas
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1)).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional(),
  search: z.string().max(100).trim().optional(),
  status: z.string().max(50).optional(),
})

export type PaginationInput = z.infer<typeof paginationSchema>

// UUID validation
export const uuidSchema = z.string().uuid('Invalid ID format')

// Sanitization helper to remove potential XSS vectors
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove basic HTML tags
    .substring(0, 10000) // Prevent extremely long strings
}

// Validation error handler
export function handleValidationError(error: z.ZodError): { field: string; message: string }[] {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }))
}
