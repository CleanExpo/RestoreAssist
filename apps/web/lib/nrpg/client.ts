// NRPG API Client
// Stub implementation — replace with real NRPG API details when available
// Spec: docs/features/NRPG-ONBOARDING-SYNC.md

export interface NRPGCertification {
  name: string
  number: string | null
  type: string // CertificationType enum value
  issuer: string
  issuedAt: string // ISO 8601
  expiresAt: string | null // ISO 8601
}

export interface NRPGContractorPayload {
  fullName: string
  email: string
  phone: string | null
  companyName: string | null
  abnNumber: string | null
  businessAddress: string | null
  specializations: string[]
  yearsInBusiness: number | null
  insuranceCertUrl: string | null
  certifications: NRPGCertification[]
  serviceRegions: string[]
}

export interface NRPGSyncResult {
  membershipId: string
}

export async function syncContractorToNRPG(
  payload: NRPGContractorPayload
): Promise<NRPGSyncResult> {
  // TODO: replace with real NRPG API endpoint
  // Expected: POST ${NRPG_API_URL}/members with Bearer ${NRPG_API_KEY}
  throw new Error('NRPG API integration not yet configured')
}
