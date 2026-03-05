/**
 * Integration Development Mode
 *
 * Enables mock OAuth flows and bypasses subscription checks for local testing.
 * NEVER enable in production.
 */

export function isIntegrationDevMode(): boolean {
  return process.env.INTEGRATION_DEV_MODE === 'true'
}

export const MOCK_CREDENTIALS = {
  XERO: {
    clientId: 'mock-xero-client',
    clientSecret: 'mock-xero-secret',
  },
  QUICKBOOKS: {
    clientId: 'mock-qb-client',
    clientSecret: 'mock-qb-secret',
  },
  MYOB: {
    clientId: 'mock-myob-client',
    clientSecret: 'mock-myob-secret',
  },
  SERVICEM8: {
    clientId: 'mock-sm8-client',
    clientSecret: 'mock-sm8-secret',
  },
  ASCORA: {
    apiKey: 'mock-ascora-key',
    apiSecret: 'mock-ascora-secret',
  },
} as const

export type MockProvider = keyof typeof MOCK_CREDENTIALS
