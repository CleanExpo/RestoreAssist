/**
 * Signature Token Management
 * Handles secure token generation and verification for e-signatures
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

interface SignatureTokenPayload {
  submissionId: string
  signatureFieldId: string
  signatoryEmail: string
  signatoryName: string
  signatoryRole: string
  expiresAt: Date
}

interface VerifiedToken {
  isValid: boolean
  payload?: SignatureTokenPayload
  error?: string
}

/**
 * Generate a secure signature token
 * Tokens are base64url encoded and include signing data
 */
export function generateSignatureToken(
  submissionId: string,
  signatureFieldId: string,
  signatoryEmail: string,
  signatoryName: string,
  signatoryRole: string,
  expiresInDays: number = 30,
): string {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const payload = {
    submissionId,
    signatureFieldId,
    signatoryEmail,
    signatoryName,
    signatoryRole,
    expiresAt: expiresAt.toISOString(),
    issuedAt: new Date().toISOString(),
  }

  // Create HMAC signature
  const secret = process.env.SIGNATURE_TOKEN_SECRET || 'default-secret-change-in-production'
  const payloadString = JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex')

  // Combine payload and signature, then base64url encode
  const combined = JSON.stringify({
    payload,
    signature,
  })

  return Buffer.from(combined).toString('base64url')
}

/**
 * Verify and decode a signature token
 */
export function verifySignatureToken(token: string): VerifiedToken {
  try {
    // Decode from base64url
    const decoded = Buffer.from(token, 'base64url').toString('utf-8')
    const { payload, signature } = JSON.parse(decoded)

    // Verify signature
    const secret = process.env.SIGNATURE_TOKEN_SECRET || 'default-secret-change-in-production'
    const payloadString = JSON.stringify(payload)
    const expectedSignature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex')

    if (signature !== expectedSignature) {
      return {
        isValid: false,
        error: 'Invalid token signature',
      }
    }

    // Check expiration
    const expiresAt = new Date(payload.expiresAt)
    if (expiresAt < new Date()) {
      return {
        isValid: false,
        error: 'Token has expired',
      }
    }

    return {
      isValid: true,
      payload: {
        submissionId: payload.submissionId,
        signatureFieldId: payload.signatureFieldId,
        signatoryEmail: payload.signatoryEmail,
        signatoryName: payload.signatoryName,
        signatoryRole: payload.signatoryRole,
        expiresAt: expiresAt,
      },
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid token format',
    }
  }
}

/**
 * Create signature token in database with expiration
 */
export async function createSignatureTokenRecord(
  submissionId: string,
  signatureFieldId: string,
  signatoryEmail: string,
  signatoryName: string,
  signatoryRole: string,
  expiresInDays: number = 30,
): Promise<string> {
  const token = generateSignatureToken(
    submissionId,
    signatureFieldId,
    signatoryEmail,
    signatoryName,
    signatoryRole,
    expiresInDays,
  )

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  // Store token hash in database (not the raw token)
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  // Note: Assumes a SignatureToken table exists in schema
  // For now, this is just creating the token string
  // In production, you'd store: await prisma.signatureToken.create({...})

  return token
}

/**
 * Generate public signature link for e-signatures
 */
export function generateSignatureLink(
  baseUrl: string,
  token: string,
  submissionId: string,
): string {
  return `${baseUrl}/forms/sign/${submissionId}?token=${encodeURIComponent(token)}`
}

/**
 * Validate signature token is not used
 */
export async function isTokenAlreadyUsed(token: string): Promise<boolean> {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8')
    const { payload } = JSON.parse(decoded)

    // Check if signature already exists for this field
    const existingSignature = await prisma.formSignature.findFirst({
      where: {
        submissionId: payload.submissionId,
        signatureFieldId: payload.signatureFieldId,
        signedAt: { not: null },
      },
    })

    return !!existingSignature
  } catch {
    return false
  }
}

/**
 * Get signature request status
 */
export async function getSignatureStatus(submissionId: string, signatureFieldId: string) {
  try {
    const signature = await prisma.formSignature.findFirst({
      where: {
        submissionId,
        signatureFieldId,
      },
    })

    if (!signature) {
      return {
        status: 'not-created',
        message: 'Signature request not created',
      }
    }

    if (!signature.signatureRequestSent) {
      return {
        status: 'pending-send',
        message: 'Signature request ready to send',
      }
    }

    if (signature.signedAt) {
      return {
        status: 'signed',
        message: `Signed on ${signature.signedAt.toLocaleDateString()}`,
        signedAt: signature.signedAt,
      }
    }

    return {
      status: 'pending-signature',
      message: 'Awaiting signature',
      sentAt: signature.signatureRequestSentAt,
    }
  } catch (error) {
    return {
      status: 'error',
      message: 'Error retrieving status',
    }
  }
}

/**
 * Create signature audit log entry
 */
export async function logSignatureAction(
  submissionId: string,
  signatureFieldId: string,
  action: 'sent' | 'viewed' | 'signed' | 'rejected',
  metadata?: Record<string, any>,
) {
  try {
    // This would use FormAuditLog table
    // For now, log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SIGNATURE_AUDIT] ${action}:`, {
        submissionId,
        signatureFieldId,
        timestamp: new Date().toISOString(),
        ...metadata,
      })
    }

    // In production:
    // await prisma.formAuditLog.create({
    //   data: {
    //     submissionId,
    //     action,
    //     timestamp: new Date(),
    //     metadata: JSON.stringify(metadata),
    //   }
    // })
  } catch (error) {
    console.error('Error logging signature action:', error)
  }
}

/**
 * Calculate signature expiry time for display
 */
export function getExpiryTimeRemaining(expiresAt: Date): string {
  const now = new Date()
  const diffMs = expiresAt.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''}`
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''}`
  } else {
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${diffMins} minute${diffMins > 1 ? 's' : ''}`
  }
}
