/**
 * Form Submission Workflow
 * Orchestrates the complete form submission lifecycle including auto-population,
 * validation, storage, and PDF generation
 */

import { prisma } from '@/lib/prisma'
import { getAutoPopulationContext, autoPopulateFormData } from './auto-populate'
import { validateFormSubmission } from './form-validation'
import { sendSignatureRequestEmail } from './email-signature-workflow'
import { generateSignatureToken, createSignatureTokenRecord } from './signature-tokens'
import { FormType, FormCategory, FormSubmissionStatus, FormTemplateStatus } from '@prisma/client'

interface SubmitFormRequest {
  userId: string
  templateId: string
  formData: Record<string, any>
  reportId?: string
  clientId?: string
  requestSignatures?: Array<{
    signatoryName: string
    signatoryEmail: string
    signatoryRole: string
  }>
  saveDraft?: boolean
}

interface SubmitFormResponse {
  success: boolean
  submissionId?: string
  errors?: string[]
  message?: string
}

/**
 * Submit a form with full workflow
 */
export async function submitForm(request: SubmitFormRequest): Promise<SubmitFormResponse> {
  try {
    // Fetch template
    const template = await prisma.formTemplate.findUnique({
      where: { id: request.templateId },
    })

    if (!template) {
      return {
        success: false,
        errors: ['Form template not found'],
      }
    }

    // Verify ownership
    if (!template.isSystemTemplate && template.userId !== request.userId) {
      return {
        success: false,
        errors: ['Forbidden'],
      }
    }

    // Parse form schema
    const formSchema =
      typeof template.formSchema === 'string'
        ? JSON.parse(template.formSchema)
        : template.formSchema

    // Get all fields from schema
    const allFields: any[] = []
    for (const section of formSchema.sections) {
      allFields.push(...section.fields)
    }

    // Auto-populate form data from context
    const context = await getAutoPopulationContext(request.userId, request.reportId)
    const autoPopulated = autoPopulateFormData(allFields, context)
    const mergedData = {
      ...autoPopulated,
      ...request.formData,
    }

    // Validate form submission
    const validation = validateFormSubmission(mergedData, allFields)

    if (!validation.isValid && !request.saveDraft) {
      return {
        success: false,
        errors: validation.errors.map((e) => `${e.fieldId}: ${e.message}`),
        message: 'Form validation failed',
      }
    }

    // Calculate completeness score
    let completenessScore = 0
    const requiredFields = allFields.filter((f) => f.required)
    if (requiredFields.length > 0) {
      const completedFields = requiredFields.filter((f) => {
        const value = mergedData[f.id]
        return value !== undefined && value !== null && value !== ''
      })
      completenessScore = Math.round((completedFields.length / requiredFields.length) * 100)
    } else {
      completenessScore = 100
    }

    // Create submission
    const submission = await prisma.formSubmission.create({
      data: {
        userId: request.userId,
        templateId: request.templateId,
        reportId: request.reportId,
        clientId: request.clientId,
        submissionNumber: `${template.name.substring(0, 3).toUpperCase()}-${Date.now()}`,
        status: request.saveDraft ? FormSubmissionStatus.DRAFT : FormSubmissionStatus.COMPLETED,
        formData: mergedData,
        completenessScore,
        validationErrors: validation.isValid ? undefined : JSON.stringify(validation.errors),
        startedAt: new Date(),
        submittedAt: request.saveDraft ? undefined : new Date(),
        lastSavedAt: new Date(),
        completedAt: request.saveDraft ? undefined : new Date(),
      },
    })

    // Create audit log
    await prisma.formAuditLog.create({
      data: {
        submissionId: submission.id,
        action: request.saveDraft ? 'FORM_SAVED_DRAFT' : 'FORM_SUBMITTED',
        performedBy: request.userId,
        metadata: JSON.stringify({
          completenessScore,
          autoPopulatedFields: Object.keys(autoPopulated).length,
          validationErrors: validation.errors.length,
        }),
      },
    })

    // Handle signature requests
    if (request.requestSignatures && request.requestSignatures.length > 0) {
      for (const signatory of request.requestSignatures) {
        await createSignatureRequest(submission.id, template.name, signatory, request.userId)
      }

      // Update submission status if signatures are required
      await prisma.formSubmission.update({
        where: { id: submission.id },
        data: {
          status: FormSubmissionStatus.PENDING_SIGNATURES,
        },
      })
    }

    return {
      success: true,
      submissionId: submission.id,
      message: request.saveDraft
        ? 'Form saved as draft'
        : request.requestSignatures && request.requestSignatures.length > 0
          ? `Form submitted. Signature requests sent to ${request.requestSignatures.length} signatory(ies)`
          : 'Form submitted successfully',
    }
  } catch (error) {
    console.error('Error submitting form:', error)
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Internal server error'],
    }
  }
}

/**
 * Create signature request for a form
 */
async function createSignatureRequest(
  submissionId: string,
  formName: string,
  signatory: {
    signatoryName: string
    signatoryEmail: string
    signatoryRole: string
  },
  requesterId: string,
): Promise<void> {
  try {
    // Create signature record
    const signature = await prisma.formSignature.create({
      data: {
        submissionId,
        signatureFieldId: `sig_${Date.now()}`,
        signatoryName: signatory.signatoryName,
        signatoryEmail: signatory.signatoryEmail,
        signatoryRole: signatory.signatoryRole,
        signatureType: 'DIGITAL',
        signatureRequestSent: false,
      },
    })

    // Generate signature token
    const token = generateSignatureToken(
      submissionId,
      signature.signatureFieldId,
      signatory.signatoryEmail,
      signatory.signatoryName,
      signatory.signatoryRole,
      30, // 30 days expiration
    )

    // Get requester info
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { name: true, email: true },
    })

    if (!requester) {
      throw new Error('Requester not found')
    }

    // Send signature request email
    const emailSent = await sendSignatureRequestEmail({
      submissionId,
      signatureFieldId: signature.signatureFieldId,
      signatoryEmail: signatory.signatoryEmail,
      signatoryName: signatory.signatoryName,
      signatoryRole: signatory.signatoryRole,
      formName,
      senderEmail: requester.email,
      senderName: requester.name || 'RestoreAssist User',
      signatureToken: token,
      expiresInDays: 30,
    })

    // Update signature record with sent status
    if (emailSent) {
      await prisma.formSignature.update({
        where: { id: signature.id },
        data: {
          signatureRequestSent: true,
          signatureRequestSentAt: new Date(),
        },
      })

      // Log audit trail
      await prisma.formAuditLog.create({
        data: {
          submissionId,
          action: 'SIGNATURE_REQUEST_SENT',
          performedBy: requesterId,
          metadata: JSON.stringify({
            signatoryName: signatory.signatoryName,
            signatoryEmail: signatory.signatoryEmail,
            signatureFieldId: signature.signatureFieldId,
          }),
        },
      })
    }
  } catch (error) {
    console.error('Error creating signature request:', error)
    throw error
  }
}

/**
 * Save form as draft
 */
export async function saveDraft(request: SubmitFormRequest): Promise<SubmitFormResponse> {
  return submitForm({
    ...request,
    saveDraft: true,
  })
}

/**
 * Update form submission
 */
export async function updateSubmission(
  submissionId: string,
  userId: string,
  formData: Record<string, any>,
  templateId: string,
): Promise<SubmitFormResponse> {
  try {
    // Verify ownership
    const submission = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: { template: true },
    })

    if (!submission) {
      return {
        success: false,
        errors: ['Submission not found'],
      }
    }

    if (submission.userId !== userId) {
      return {
        success: false,
        errors: ['Forbidden'],
      }
    }

    // Parse form schema
    const formSchema =
      typeof submission.template.formSchema === 'string'
        ? JSON.parse(submission.template.formSchema)
        : submission.template.formSchema

    // Get all fields
    const allFields: any[] = []
    for (const section of formSchema.sections) {
      allFields.push(...section.fields)
    }

    // Auto-populate and merge
    const context = await getAutoPopulationContext(userId, submission.reportId)
    const autoPopulated = autoPopulateFormData(allFields, context)
    const mergedData = {
      ...autoPopulated,
      ...formData,
    }

    // Validate
    const validation = validateFormSubmission(mergedData, allFields)

    // Calculate completeness
    let completenessScore = 0
    const requiredFields = allFields.filter((f) => f.required)
    if (requiredFields.length > 0) {
      const completedFields = requiredFields.filter((f) => {
        const value = mergedData[f.id]
        return value !== undefined && value !== null && value !== ''
      })
      completenessScore = Math.round((completedFields.length / requiredFields.length) * 100)
    } else {
      completenessScore = 100
    }

    // Update submission
    await prisma.formSubmission.update({
      where: { id: submissionId },
      data: {
        formData: mergedData,
        completenessScore,
        validationErrors: validation.isValid ? undefined : JSON.stringify(validation.errors),
        lastSavedAt: new Date(),
      },
    })

    // Log audit trail
    await prisma.formAuditLog.create({
      data: {
        submissionId,
        action: 'FORM_UPDATED',
        performedBy: userId,
        metadata: JSON.stringify({
          completenessScore,
          fieldsUpdated: Object.keys(formData).length,
        }),
      },
    })

    return {
      success: true,
      submissionId,
      message: 'Form updated successfully',
    }
  } catch (error) {
    console.error('Error updating submission:', error)
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Internal server error'],
    }
  }
}

/**
 * Get submission for editing
 */
export async function getSubmissionForEdit(submissionId: string, userId: string) {
  try {
    const submission = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: {
        template: true,
        signatures: true,
      },
    })

    if (!submission) {
      return null
    }

    if (submission.userId !== userId) {
      return null
    }

    // Parse schema
    const formSchema =
      typeof submission.template.formSchema === 'string'
        ? JSON.parse(submission.template.formSchema)
        : submission.template.formSchema

    return {
      submission,
      formSchema,
      formData: submission.formData,
    }
  } catch (error) {
    console.error('Error getting submission:', error)
    return null
  }
}
