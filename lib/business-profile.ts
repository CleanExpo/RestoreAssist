import { prisma } from '@/lib/prisma'
import { getOrganizationOwner } from '@/lib/organization-credits'

export interface BusinessInfo {
  businessName: string | null
  businessAddress: string | null
  businessLogo: string | null
  businessABN: string | null
  businessPhone: string | null
  businessEmail: string | null
  insuranceCertificateNumber?: string | null
  insuranceExpiry?: Date | null
  licenceNumber?: string | null
  licenceClass?: string | null
  licenceExpiry?: Date | null
}

/**
 * Resolve the active business profile for a user.
 *
 * Resolution order:
 * 1. For team members (MANAGER/USER with org), resolve via organisation admin's profile.
 * 2. If user has activeBusinessProfileId, load that BusinessProfile.
 * 3. If user has a default BusinessProfile (isDefault: true), use it.
 * 4. Fall back to the deprecated User.business* fields.
 */
export async function getActiveBusinessInfo(userId: string): Promise<BusinessInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      activeBusinessProfileId: true,
      businessName: true,
      businessAddress: true,
      businessLogo: true,
      businessABN: true,
      businessPhone: true,
      businessEmail: true,
      role: true,
      organizationId: true,
    },
  })

  if (!user) {
    return emptyBusinessInfo()
  }

  // For team members, resolve via the org admin
  if (user.role !== 'ADMIN' && user.organizationId) {
    const ownerId = await getOrganizationOwner(userId)
    if (ownerId && ownerId !== userId) {
      return getActiveBusinessInfo(ownerId)
    }
  }

  // Try active profile first
  if (user.activeBusinessProfileId) {
    const profile = await prisma.businessProfile.findUnique({
      where: { id: user.activeBusinessProfileId },
    })
    if (profile) {
      return mapProfileToBusinessInfo(profile)
    }
  }

  // Try default profile
  const defaultProfile = await prisma.businessProfile.findFirst({
    where: { userId, isDefault: true },
  })
  if (defaultProfile) {
    return mapProfileToBusinessInfo(defaultProfile)
  }

  // Fall back to deprecated User fields
  return {
    businessName: user.businessName,
    businessAddress: user.businessAddress,
    businessLogo: user.businessLogo,
    businessABN: user.businessABN,
    businessPhone: user.businessPhone,
    businessEmail: user.businessEmail,
  }
}

/**
 * Get all business profiles for a user (or their org admin).
 * Used by the profile switcher and settings page.
 */
export async function getBusinessProfiles(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      organizationId: true,
      activeBusinessProfileId: true,
    },
  })

  if (!user) return []

  // For team members, get the admin's profiles
  let profileOwnerId = userId
  if (user.role !== 'ADMIN' && user.organizationId) {
    const ownerId = await getOrganizationOwner(userId)
    if (ownerId) profileOwnerId = ownerId
  }

  return prisma.businessProfile.findMany({
    where: { userId: profileOwnerId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

// ---- Helpers ----

function mapProfileToBusinessInfo(profile: {
  name: string
  abn: string | null
  logoUrl: string | null
  address: string | null
  phone: string | null
  email: string | null
  insuranceCertificateNumber: string | null
  insuranceExpiry: Date | null
  licenceNumber: string | null
  licenceClass: string | null
  licenceExpiry: Date | null
}): BusinessInfo {
  return {
    businessName: profile.name,
    businessAddress: profile.address,
    businessLogo: profile.logoUrl,
    businessABN: profile.abn,
    businessPhone: profile.phone,
    businessEmail: profile.email,
    insuranceCertificateNumber: profile.insuranceCertificateNumber,
    insuranceExpiry: profile.insuranceExpiry,
    licenceNumber: profile.licenceNumber,
    licenceClass: profile.licenceClass,
    licenceExpiry: profile.licenceExpiry,
  }
}

function emptyBusinessInfo(): BusinessInfo {
  return {
    businessName: null,
    businessAddress: null,
    businessLogo: null,
    businessABN: null,
    businessPhone: null,
    businessEmail: null,
  }
}
