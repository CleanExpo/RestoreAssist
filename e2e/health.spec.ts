import { test, expect } from '@playwright/test'

/**
 * API Health Check E2E Tests
 * Tests critical API endpoints availability
 */

test.describe('API Health', () => {
  test('should return healthy status from health endpoint', async ({ request }) => {
    const response = await request.get('/api/health')

    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('status')
    expect(data.status).toBe('healthy')
    expect(data).toHaveProperty('timestamp')
  })
})

test.describe('API Authentication', () => {
  test('should require authentication for protected endpoints', async ({ request }) => {
    // Test various protected endpoints return 401
    const protectedEndpoints = [
      '/api/clients',
      '/api/reports',
      '/api/analytics',
      '/api/inspections',
    ]

    for (const endpoint of protectedEndpoints) {
      const response = await request.get(endpoint)
      // Should return 401 Unauthorized
      expect(response.status()).toBe(401)
    }
  })
})
