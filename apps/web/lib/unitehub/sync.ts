/**
 * Unite-Hub Nexus Sync Orchestrator
 * Higher-level functions called after a contractor earns a certification
 * or completes a CEC course, to push data to the Nexus platform.
 */

import { prisma } from '@/lib/prisma'
import {
  pushCertificationToNexus,
  pushCECToNexus,
  pushCourseToNexus,
} from './client'

/**
 * Sync all certifications and CEC records for a contractor to Nexus.
 */
export async function syncContractorToNexus(
  contractorId: string
): Promise<void> {
  const profile = await prisma.contractorProfile.findUnique({
    where: { id: contractorId },
    include: {
      certifications: true,
    },
  })

  if (!profile) {
    console.warn(
      `[UniteHub Sync] Contractor profile ${contractorId} not found`
    )
    return
  }

  // Sync all certifications
  for (const cert of profile.certifications) {
    try {
      await pushCertificationToNexus({
        contractorId,
        certificationType: cert.certificationType,
        certificationName: cert.certificationName,
        issuedAt: cert.issueDate.toISOString(),
        expiresAt: cert.expiryDate?.toISOString(),
        issuingBody: cert.issuingBody,
        certificateUrl: cert.documentUrl ?? undefined,
      })
    } catch (error) {
      console.error(
        `[UniteHub Sync] Failed to sync certification ${cert.id}:`,
        error
      )
    }
  }
}

/**
 * Sync a single certification to Nexus by certification ID.
 */
export async function syncCertificationToNexus(
  certificationId: string
): Promise<void> {
  const cert = await prisma.contractorCertification.findUnique({
    where: { id: certificationId },
  })

  if (!cert) {
    console.warn(
      `[UniteHub Sync] Certification ${certificationId} not found`
    )
    return
  }

  await pushCertificationToNexus({
    contractorId: cert.profileId,
    certificationType: cert.certificationType,
    certificationName: cert.certificationName,
    issuedAt: cert.issueDate.toISOString(),
    expiresAt: cert.expiryDate?.toISOString(),
    issuingBody: cert.issuingBody,
    certificateUrl: cert.documentUrl ?? undefined,
  })
}

/**
 * Sync a single CEC record to Nexus by CEC ID.
 * Requires the ContinuingEducation Prisma model (added via migration).
 */
export async function syncCECToNexus(cecId: string): Promise<void> {
  // The continuingEducation model is added by a separate migration.
  // Guard against it not existing yet at runtime.
  if (!('continuingEducation' in prisma)) {
    console.warn(
      '[UniteHub Sync] ContinuingEducation model not yet available — skipping CEC sync'
    )
    return
  }

  const cec = await (prisma as any).continuingEducation.findUnique({
    where: { id: cecId },
  })

  if (!cec) {
    console.warn(`[UniteHub Sync] CEC record ${cecId} not found`)
    return
  }

  await pushCECToNexus({
    contractorId: cec.contractorProfileId,
    courseName: cec.courseName,
    provider: cec.provider,
    cecPoints: cec.cecPoints,
    completedAt: cec.completedAt.toISOString(),
    certificateUrl: cec.certificateUrl ?? undefined,
  })
}
