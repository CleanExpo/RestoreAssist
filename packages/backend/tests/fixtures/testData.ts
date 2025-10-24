/**
 * Test Fixtures and Mock Data
 *
 * Reusable test data for consistent testing across all test suites.
 *
 * @module tests/fixtures/testData
 */

import type { User } from '../../src/types';
import type {
  FreeTrialToken,
  TrialActivationRequest,
} from '../../src/services/freeTrialService';
import type { PaymentVerification } from '../../src/services/paymentVerification';

// =====================================================
// User Fixtures
// =====================================================

export const testUsers = {
  admin: {
    userId: 'user-admin-001',
    email: 'admin@test.com',
    password: 'hashed_admin123',
    name: 'Test Admin',
    role: 'admin' as const,
    createdAt: '2025-01-01T00:00:00.000Z',
    emailVerified: true,
  },

  regularUser: {
    userId: 'user-regular-002',
    email: 'user@test.com',
    password: 'hashed_user123',
    name: 'Test User',
    role: 'user' as const,
    createdAt: '2025-01-02T00:00:00.000Z',
    emailVerified: true,
  },

  viewer: {
    userId: 'user-viewer-003',
    email: 'viewer@test.com',
    password: 'hashed_viewer123',
    name: 'Test Viewer',
    role: 'viewer' as const,
    createdAt: '2025-01-03T00:00:00.000Z',
    emailVerified: false,
  },

  unverifiedEmail: {
    userId: 'user-unverified-004',
    email: 'unverified@test.com',
    password: 'hashed_pass123',
    name: 'Unverified User',
    role: 'user' as const,
    createdAt: '2025-01-04T00:00:00.000Z',
    emailVerified: false,
  },

  fraudUser: {
    userId: 'user-fraud-005',
    email: 'fraud@tempmail.com',
    password: 'hashed_fraud123',
    name: 'Fraud User',
    role: 'user' as const,
    createdAt: '2025-01-05T00:00:00.000Z',
    emailVerified: true,
  },
};

// =====================================================
// Trial Token Fixtures
// =====================================================

export const testTrialTokens = {
  active: {
    tokenId: 'token-active-001',
    userId: 'user-regular-002',
    status: 'active' as const,
    reportsRemaining: 3,
    createdAt: new Date('2025-01-10T00:00:00.000Z'),
    updatedAt: new Date('2025-01-10T00:00:00.000Z'),
    activatedAt: new Date('2025-01-10T00:00:00.000Z'),
    expiresAt: new Date('2025-01-17T00:00:00.000Z'), // 7 days later
  },

  partiallyUsed: {
    tokenId: 'token-partial-002',
    userId: 'user-regular-002',
    status: 'active' as const,
    reportsRemaining: 1,
    createdAt: new Date('2025-01-08T00:00:00.000Z'),
    updatedAt: new Date('2025-01-12T00:00:00.000Z'),
    activatedAt: new Date('2025-01-08T00:00:00.000Z'),
    expiresAt: new Date('2025-01-15T00:00:00.000Z'),
  },

  expired: {
    tokenId: 'token-expired-003',
    userId: 'user-viewer-003',
    status: 'expired' as const,
    reportsRemaining: 0,
    createdAt: new Date('2024-12-20T00:00:00.000Z'),
    updatedAt: new Date('2024-12-27T00:00:00.000Z'),
    activatedAt: new Date('2024-12-20T00:00:00.000Z'),
    expiresAt: new Date('2024-12-27T00:00:00.000Z'),
  },

  revoked: {
    tokenId: 'token-revoked-004',
    userId: 'user-fraud-005',
    status: 'revoked' as const,
    reportsRemaining: 2,
    createdAt: new Date('2025-01-05T00:00:00.000Z'),
    updatedAt: new Date('2025-01-06T00:00:00.000Z'),
    activatedAt: new Date('2025-01-05T00:00:00.000Z'),
    expiresAt: new Date('2025-01-12T00:00:00.000Z'),
    revokedAt: new Date('2025-01-06T00:00:00.000Z'),
    revokeReason: 'Fraud detected: Multiple violations',
  },
};

// =====================================================
// Trial Activation Request Fixtures
// =====================================================

export const testTrialActivationRequests = {
  clean: {
    userId: 'user-regular-002',
    fingerprintHash: 'fp-clean-abc123',
    deviceData: {
      browser: 'Chrome',
      os: 'Windows',
      screenResolution: '1920x1080',
      timezone: 'Australia/Sydney',
    },
    ipAddress: '203.0.113.10',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  } as TrialActivationRequest,

  disposableEmail: {
    userId: 'user-fraud-005',
    fingerprintHash: 'fp-temp-xyz789',
    deviceData: {
      browser: 'Firefox',
      os: 'Linux',
    },
    ipAddress: '203.0.113.50',
  } as TrialActivationRequest,

  vpnUser: {
    userId: 'user-vpn-006',
    fingerprintHash: 'fp-vpn-def456',
    deviceData: {
      browser: 'Safari',
      os: 'macOS',
    },
    ipAddress: '10.0.0.1', // Private network
  } as TrialActivationRequest,

  rapidRetry: {
    userId: 'user-rapid-007',
    fingerprintHash: 'fp-rapid-ghi789',
    deviceData: {
      browser: 'Edge',
      os: 'Windows',
    },
    ipAddress: '203.0.113.100',
  } as TrialActivationRequest,
};

// =====================================================
// Device Fingerprint Fixtures
// =====================================================

export const testDeviceFingerprints = {
  clean: {
    fingerprintId: 'fp-id-clean-001',
    fingerprintHash: 'fp-clean-abc123',
    userId: 'user-regular-002',
    deviceData: {
      browser: 'Chrome',
      os: 'Windows',
    },
    trialCount: 0,
    firstSeenAt: new Date('2025-01-10T00:00:00.000Z'),
    lastSeenAt: new Date('2025-01-10T00:00:00.000Z'),
    isBlocked: false,
  },

  reused: {
    fingerprintId: 'fp-id-reused-002',
    fingerprintHash: 'fp-reused-xyz789',
    userId: 'user-fraud-005',
    deviceData: {
      browser: 'Firefox',
      os: 'Linux',
    },
    trialCount: 3,
    firstSeenAt: new Date('2024-12-01T00:00:00.000Z'),
    lastSeenAt: new Date('2025-01-05T00:00:00.000Z'),
    isBlocked: false,
  },

  blocked: {
    fingerprintId: 'fp-id-blocked-003',
    fingerprintHash: 'fp-blocked-def456',
    userId: 'user-fraud-005',
    deviceData: {
      browser: 'Chrome',
      os: 'Linux',
    },
    trialCount: 5,
    firstSeenAt: new Date('2024-11-15T00:00:00.000Z'),
    lastSeenAt: new Date('2025-01-06T00:00:00.000Z'),
    isBlocked: true,
    blockedReason: 'Multiple fraud attempts detected',
  },
};

// =====================================================
// Payment Verification Fixtures
// =====================================================

export const testPaymentVerifications = {
  successfulVisa: {
    verificationId: 'ver-success-visa-001',
    userId: 'user-regular-002',
    cardFingerprint: 'card-fp-visa-4242',
    cardLast4: '4242',
    cardBrand: 'visa',
    verificationStatus: 'success' as const,
    stripePaymentMethodId: 'pm_visa_4242',
    amountCents: 100,
    verificationDate: new Date('2025-01-10T10:00:00.000Z'),
    reuseCount: 0,
  } as PaymentVerification,

  successfulMastercard: {
    verificationId: 'ver-success-mc-002',
    userId: 'user-viewer-003',
    cardFingerprint: 'card-fp-mc-5555',
    cardLast4: '5555',
    cardBrand: 'mastercard',
    verificationStatus: 'success' as const,
    stripePaymentMethodId: 'pm_mc_5555',
    amountCents: 100,
    verificationDate: new Date('2025-01-11T14:30:00.000Z'),
    reuseCount: 0,
  } as PaymentVerification,

  failedDeclined: {
    verificationId: 'ver-failed-declined-003',
    userId: 'user-fraud-005',
    cardFingerprint: 'card-fp-declined-0002',
    cardLast4: '0002',
    cardBrand: 'visa',
    verificationStatus: 'failed' as const,
    stripePaymentMethodId: 'pm_declined_0002',
    amountCents: 100,
    verificationDate: new Date('2025-01-12T09:15:00.000Z'),
    failureReason: 'Card declined: insufficient funds',
    reuseCount: 0,
  } as PaymentVerification,

  pending3DS: {
    verificationId: 'ver-pending-3ds-004',
    userId: 'user-3ds-008',
    cardFingerprint: 'card-fp-3ds-3220',
    cardLast4: '3220',
    cardBrand: 'visa',
    verificationStatus: 'pending' as const,
    stripePaymentMethodId: 'pm_3ds_3220',
    amountCents: 100,
    verificationDate: new Date('2025-01-13T16:45:00.000Z'),
    reuseCount: 0,
  } as PaymentVerification,

  reusedCard: {
    verificationId: 'ver-reused-005',
    userId: 'user-fraud-005',
    cardFingerprint: 'card-fp-reused-9999',
    cardLast4: '9999',
    cardBrand: 'visa',
    verificationStatus: 'failed' as const,
    stripePaymentMethodId: 'pm_reused_9999',
    amountCents: 100,
    verificationDate: new Date('2025-01-14T11:00:00.000Z'),
    failureReason: 'Card reused too many times (5 accounts)',
    reuseCount: 5,
  } as PaymentVerification,
};

// =====================================================
// Report Generation Fixtures
// =====================================================

export const testReportRequests = {
  waterDamageNSW: {
    propertyAddress: '123 Main St, Sydney NSW 2000',
    state: 'NSW' as const,
    damageType: 'water' as const,
    damageDescription: 'Burst pipe in kitchen, water flooded living room and hallway',
    clientName: 'John Smith',
    insuranceCompany: 'NRMA Insurance',
    claimNumber: 'CLM-2025-1234',
  },

  fireDamageVIC: {
    propertyAddress: '456 Fire Rd, Melbourne VIC 3000',
    state: 'VIC' as const,
    damageType: 'fire' as const,
    damageDescription: 'Electrical fire in kitchen, smoke damage to adjacent rooms',
    clientName: 'Sarah Johnson',
    insuranceCompany: 'RACV Insurance',
    claimNumber: 'CLM-2025-5678',
  },

  mouldDamageQLD: {
    propertyAddress: '789 Mould Ave, Brisbane QLD 4000',
    state: 'QLD' as const,
    damageType: 'mould' as const,
    damageDescription: 'Black mould growth in bathroom and master bedroom after leak',
    clientName: 'Michael Brown',
    insuranceCompany: 'Suncorp Insurance',
  },

  stormDamageWA: {
    propertyAddress: '101 Storm St, Perth WA 6000',
    state: 'WA' as const,
    damageType: 'storm' as const,
    damageDescription: 'Severe storm damaged roof, tiles blown off, water ingress',
  },

  minimalInfo: {
    propertyAddress: 'Test Property',
    state: 'SA' as const,
    damageType: 'other' as const,
    damageDescription: 'General damage requiring assessment',
  },
};

// =====================================================
// Fraud Flag Fixtures
// =====================================================

export const testFraudFlags = {
  deviceBlocked: {
    flagId: 'flag-device-001',
    userId: 'user-fraud-005',
    fingerprintHash: 'fp-blocked-def456',
    flagType: 'device_blocked',
    severity: 'critical' as const,
    fraudScore: 100,
    details: { reason: 'Multiple fraud attempts detected' },
    createdAt: new Date('2025-01-06T00:00:00.000Z'),
    resolved: false,
  },

  disposableEmail: {
    flagId: 'flag-email-002',
    userId: 'user-fraud-005',
    flagType: 'disposable_email',
    severity: 'high' as const,
    fraudScore: 40,
    details: { email: 'fraud@tempmail.com', domain: 'tempmail.com' },
    createdAt: new Date('2025-01-05T00:00:00.000Z'),
    resolved: false,
  },

  ipRateLimit: {
    flagId: 'flag-ip-003',
    userId: 'user-spam-009',
    ipAddress: '203.0.113.100',
    flagType: 'ip_rate_limit_exceeded',
    severity: 'high' as const,
    fraudScore: 35,
    details: { trialsInLast24Hours: 5, maxAllowed: 3 },
    createdAt: new Date('2025-01-13T00:00:00.000Z'),
    resolved: false,
  },

  cardReuse: {
    flagId: 'flag-card-004',
    userId: 'user-fraud-005',
    flagType: 'card_reuse',
    severity: 'high' as const,
    fraudScore: 45,
    details: { cardFingerprint: 'card-fp-reused-9999', reuseCount: 5 },
    createdAt: new Date('2025-01-14T00:00:00.000Z'),
    resolved: false,
  },

  rapidRegistration: {
    flagId: 'flag-rapid-005',
    userId: 'user-rapid-007',
    fingerprintHash: 'fp-rapid-ghi789',
    flagType: 'rapid_re_registration',
    severity: 'medium' as const,
    fraudScore: 30,
    details: { hoursSinceLastSeen: 0.5 },
    createdAt: new Date('2025-01-15T00:00:00.000Z'),
    resolved: false,
  },
};

// =====================================================
// Stripe Mock Responses
// =====================================================

export const testStripeResponses = {
  paymentMethods: {
    visa4242: {
      id: 'pm_visa_4242',
      object: 'payment_method',
      card: {
        last4: '4242',
        brand: 'visa',
        exp_month: 12,
        exp_year: 2028,
      },
    },

    mastercard5555: {
      id: 'pm_mc_5555',
      object: 'payment_method',
      card: {
        last4: '5555',
        brand: 'mastercard',
        exp_month: 6,
        exp_year: 2027,
      },
    },

    declined0002: {
      id: 'pm_declined_0002',
      object: 'payment_method',
      card: {
        last4: '0002',
        brand: 'visa',
        exp_month: 1,
        exp_year: 2025,
      },
    },

    requires3DS: {
      id: 'pm_3ds_3220',
      object: 'payment_method',
      card: {
        last4: '3220',
        brand: 'visa',
        exp_month: 9,
        exp_year: 2027,
      },
    },
  },

  setupIntents: {
    succeeded: {
      id: 'seti_success_123',
      status: 'succeeded',
      client_secret: 'seti_secret_success_abc',
    },

    requiresAction: {
      id: 'seti_3ds_456',
      status: 'requires_action',
      client_secret: 'seti_secret_3ds_xyz',
    },

    failed: {
      id: 'seti_fail_789',
      status: 'failed',
      client_secret: null,
    },
  },
};

// =====================================================
// Helper Functions
// =====================================================

/**
 * Create a test user with custom properties
 */
export function createTestUser(overrides: Partial<User> = {}): User {
  return {
    ...testUsers.regularUser,
    ...overrides,
  };
}

/**
 * Create a test trial token with custom properties
 */
export function createTestTrialToken(overrides: Partial<FreeTrialToken> = {}): FreeTrialToken {
  return {
    ...testTrialTokens.active,
    ...overrides,
  };
}

/**
 * Create a test trial activation request with custom properties
 */
export function createTestTrialRequest(
  overrides: Partial<TrialActivationRequest> = {}
): TrialActivationRequest {
  return {
    ...testTrialActivationRequests.clean,
    ...overrides,
  };
}

/**
 * Create a test payment verification with custom properties
 */
export function createTestPaymentVerification(
  overrides: Partial<PaymentVerification> = {}
): PaymentVerification {
  return {
    ...testPaymentVerifications.successfulVisa,
    ...overrides,
  };
}

/**
 * Generate a random test user ID
 */
export function generateTestUserId(): string {
  return `user-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a random device fingerprint hash
 */
export function generateTestFingerprintHash(): string {
  return `fp-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current date + offset (for expiry testing)
 */
export function getDateOffset(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
