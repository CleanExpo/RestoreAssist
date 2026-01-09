/**
 * E-Signature Email Workflow
 * Handles sending signature request emails and managing the signing process
 */

import nodemailer from 'nodemailer'
import { generateSignatureLink, logSignatureAction } from './signature-tokens'
import { prisma } from '@/lib/prisma'

// Initialize email transporter
const createTransporter = () => {
  // Use SMTP if configured (recommended for production)
  if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }

  // Development/testing mode (Mailhog)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025'),
    secure: false,
  })
}

interface SignatureRequestData {
  submissionId: string
  signatureFieldId: string
  signatoryEmail: string
  signatoryName: string
  signatoryRole: string
  formName: string
  senderEmail: string
  senderName: string
  signatureToken: string
  expiresInDays?: number
}

/**
 * Send signature request email to signer
 */
export async function sendSignatureRequestEmail(data: SignatureRequestData): Promise<boolean> {
  try {
    const transporter = createTransporter()

    // Generate public signing link
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const signatureLink = generateSignatureLink(baseUrl, data.signatureToken, data.submissionId)

    // HTML email template
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #1e293b; margin: 0;">Signature Request</h2>
          <p style="color: #64748b; margin: 5px 0 0 0;">From: ${data.senderName}</p>
        </div>

        <p>Hi ${data.signatoryName},</p>

        <p>You have been requested to sign the following document:</p>

        <div style="background-color: #f1f5f9; padding: 16px; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold; color: #1e293b;">${data.formName}</p>
          <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">
            Role: <strong>${data.signatoryRole}</strong>
          </p>
        </div>

        <p style="margin: 20px 0;">Please review and sign the document using the link below:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${signatureLink}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Review and Sign Document
          </a>
        </div>

        <p style="color: #64748b; font-size: 14px;">
          This link will expire in ${data.expiresInDays || 30} days.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

        <p style="color: #64748b; font-size: 12px;">
          If you did not expect this request, please contact ${data.senderEmail}.
        </p>

        <p style="color: #64748b; font-size: 12px; margin: 10px 0 0 0;">
          RestoreAssist Form Management System
        </p>
      </div>
    `

    // Plain text version
    const textContent = `
Signature Request

From: ${data.senderName}

You have been requested to sign the following document:

Form: ${data.formName}
Role: ${data.signatoryRole}

Please click the link below to review and sign:

${signatureLink}

This link will expire in ${data.expiresInDays || 30} days.

If you did not expect this request, please contact ${data.senderEmail}.
    `.trim()

    // Send email
    const result = await transporter.sendMail({
      from: process.env.MAIL_FROM || 'noreply@restoreassist.app',
      to: data.signatoryEmail,
      subject: `Signature Request: ${data.formName}`,
      html: htmlContent,
      text: textContent,
      replyTo: data.senderEmail,
    })

    // Log successful send
    await logSignatureAction(data.submissionId, data.signatureFieldId, 'sent', {
      signatoryEmail: data.signatoryEmail,
      messageId: result.messageId,
    })

    console.log(`[EMAIL] Signature request sent to ${data.signatoryEmail}`)
    return true
  } catch (error) {
    console.error('[EMAIL_ERROR] Failed to send signature request:', error)
    return false
  }
}

/**
 * Send signature completion notification to sender
 */
export async function sendSignatureCompletionEmail(
  submissionId: string,
  formName: string,
  signerName: string,
  recipientEmail: string,
): Promise<boolean> {
  try {
    const transporter = createTransporter()

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #166534; margin: 0;">✓ Document Signed</h2>
        </div>

        <p>The following document has been signed:</p>

        <div style="background-color: #f1f5f9; padding: 16px; border-left: 4px solid #10b981; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold; color: #1e293b;">${formName}</p>
          <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">
            Signed by: <strong>${signerName}</strong>
          </p>
          <p style="margin: 5px 0 0 0; color: #64748b; font-size: 14px;">
            Timestamp: ${new Date().toLocaleString()}
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

        <p style="color: #64748b; font-size: 12px;">
          Reference: ${submissionId}
        </p>
      </div>
    `

    const textContent = `
Document Signed

The following document has been signed:

Form: ${formName}
Signed by: ${signerName}
Timestamp: ${new Date().toLocaleString()}

Reference: ${submissionId}
    `.trim()

    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'noreply@restoreassist.app',
      to: recipientEmail,
      subject: `Document Signed: ${formName}`,
      html: htmlContent,
      text: textContent,
    })

    await logSignatureAction(submissionId, '', 'signed', {
      signerName,
      notificationSent: true,
    })

    console.log(`[EMAIL] Completion notification sent to ${recipientEmail}`)
    return true
  } catch (error) {
    console.error('[EMAIL_ERROR] Failed to send completion notification:', error)
    return false
  }
}

/**
 * Send signature reminder email
 */
export async function sendSignatureReminderEmail(
  submissionId: string,
  signatoryEmail: string,
  signatoryName: string,
  formName: string,
  signatureLink: string,
  daysRemaining: number,
): Promise<boolean> {
  try {
    const transporter = createTransporter()

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #92400e; margin: 0;">Reminder: Signature Needed</h2>
        </div>

        <p>Hi ${signatoryName},</p>

        <p>This is a friendly reminder that you have a pending signature request for:</p>

        <div style="background-color: #f1f5f9; padding: 16px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold; color: #1e293b;">${formName}</p>
          <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">
            Expires in: <strong>${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</strong>
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${signatureLink}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Sign Now
          </a>
        </div>

        <p style="color: #64748b; font-size: 14px;">
          If you have already signed this document, please disregard this message.
        </p>
      </div>
    `

    const textContent = `
Reminder: Signature Needed

Hi ${signatoryName},

This is a friendly reminder that you have a pending signature request for:

Form: ${formName}
Expires in: ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}

Sign Now: ${signatureLink}

If you have already signed this document, please disregard this message.
    `.trim()

    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'noreply@restoreassist.app',
      to: signatoryEmail,
      subject: `Reminder: Sign ${formName}`,
      html: htmlContent,
      text: textContent,
    })

    console.log(`[EMAIL] Reminder sent to ${signatoryEmail}`)
    return true
  } catch (error) {
    console.error('[EMAIL_ERROR] Failed to send reminder:', error)
    return false
  }
}

/**
 * Get pending signatures count
 */
export async function getPendingSignaturesCount(submissionId: string): Promise<number> {
  try {
    const count = await prisma.formSignature.count({
      where: {
        submissionId,
        signedAt: null,
      },
    })
    return count
  } catch (error) {
    console.error('Error getting pending signatures:', error)
    return 0
  }
}

/**
 * Check if all signatures are complete
 */
export async function areAllSignaturesComplete(submissionId: string): Promise<boolean> {
  try {
    const pending = await getPendingSignaturesCount(submissionId)
    return pending === 0
  } catch (error) {
    console.error('Error checking signature completion:', error)
    return false
  }
}
