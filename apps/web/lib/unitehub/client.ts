/**
 * Unite-Hub Nexus API Client
 * Pushes contractor training, courses, and certifications to the Nexus platform
 */

import {
  retryWithExponentialBackoff,
  DEFAULT_RETRY_OPTIONS,
} from '@/lib/integrations/retry'

const UNITEHUB_API_URL = process.env.UNITEHUB_API_URL
const UNITEHUB_API_KEY = process.env.UNITEHUB_API_KEY

export interface NexusCertificationPayload {
  contractorId: string
  externalUserId?: string
  certificationType: string
  certificationName: string
  issuedAt: string
  expiresAt?: string
  issuingBody: string
  certificateUrl?: string
}

export interface NexusCECPayload {
  contractorId: string
  courseName: string
  provider: string
  cecPoints: number
  completedAt: string
  certificateUrl?: string
}

export interface NexusCoursePayload {
  contractorId: string
  courseName: string
  provider: string
  completedAt: string
  score?: number
  certificateUrl?: string
}

interface NexusResponse {
  success: boolean
  nexusRecordId?: string
  error?: string
}

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': UNITEHUB_API_KEY!,
  }
}

function isConfigured(): boolean {
  return Boolean(UNITEHUB_API_URL && UNITEHUB_API_KEY)
}

export async function pushCertificationToNexus(
  payload: NexusCertificationPayload
): Promise<NexusResponse> {
  if (!isConfigured()) {
    console.warn('[UniteHub] API not configured — skipping Nexus sync')
    return { success: false }
  }

  return retryWithExponentialBackoff(async () => {
    const res = await fetch(
      `${UNITEHUB_API_URL}/api/nexus/certifications`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      }
    )

    if (!res.ok) {
      const errorText = await res.text()
      const error = new Error(
        `UniteHub certification sync failed: ${res.status} ${errorText}`
      ) as Error & { status: number }
      ;(error as any).status = res.status
      throw error
    }

    return res.json()
  }, DEFAULT_RETRY_OPTIONS)
}

export async function pushCECToNexus(
  payload: NexusCECPayload
): Promise<NexusResponse> {
  if (!isConfigured()) {
    console.warn('[UniteHub] API not configured — skipping Nexus CEC sync')
    return { success: false }
  }

  return retryWithExponentialBackoff(async () => {
    const res = await fetch(`${UNITEHUB_API_URL}/api/nexus/cec`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errorText = await res.text()
      const error = new Error(
        `UniteHub CEC sync failed: ${res.status} ${errorText}`
      ) as Error & { status: number }
      ;(error as any).status = res.status
      throw error
    }

    return res.json()
  }, DEFAULT_RETRY_OPTIONS)
}

export async function pushCourseToNexus(
  payload: NexusCoursePayload
): Promise<NexusResponse> {
  if (!isConfigured()) {
    console.warn('[UniteHub] API not configured — skipping Nexus course sync')
    return { success: false }
  }

  return retryWithExponentialBackoff(async () => {
    const res = await fetch(`${UNITEHUB_API_URL}/api/nexus/courses`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errorText = await res.text()
      const error = new Error(
        `UniteHub course sync failed: ${res.status} ${errorText}`
      ) as Error & { status: number }
      ;(error as any).status = res.status
      throw error
    }

    return res.json()
  }, DEFAULT_RETRY_OPTIONS)
}
