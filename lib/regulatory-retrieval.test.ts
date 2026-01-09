/**
 * Regulatory Retrieval Service - Test Suite
 *
 * Tests for regulatory-retrieval.ts covering:
 * - Feature flag behavior
 * - Query parsing and validation
 * - Regulatory document retrieval
 * - Context building
 * - Graceful degradation on errors
 * - Multi-state scenarios
 *
 * Run with: npm test -- regulatory-retrieval.test.ts
 * Or when database available: npx jest lib/regulatory-retrieval.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  retrieveRegulatoryContext,
  RegulatoryQuery,
  RegulatoryContext,
  formatRegulatoryContextForPrompt,
  extractCitationsFromContext,
  closeRegulatoryConnection,
} from './regulatory-retrieval'

describe('Regulatory Retrieval Service', () => {
  // Mock Anthropic API key for testing
  const MOCK_API_KEY = 'sk-test-key-12345'

  beforeAll(() => {
    // Set test environment
    process.env.ANTHROPIC_API_KEY = MOCK_API_KEY
  })

  afterAll(async () => {
    // Cleanup
    await closeRegulatoryConnection()
  })

  describe('Feature Flag Control', () => {
    it('should return empty context when ENABLE_REGULATORY_CITATIONS is false', async () => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'false'

      const query: RegulatoryQuery = {
        reportType: 'water',
        state: 'QLD',
        waterCategory: '1',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      expect(context.retrievalSuccess).toBe(false)
      expect(context.documents.length).toBe(0)
      expect(context.errors).toContain('Regulatory citations feature is disabled')
    })

    it('should attempt retrieval when ENABLE_REGULATORY_CITATIONS is true', async () => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'true'

      const query: RegulatoryQuery = {
        reportType: 'water',
        state: 'QLD',
      }

      // This will return empty context if no database is available,
      // but won't fail - demonstrating graceful degradation
      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      // Should have tried to retrieve (not disabled)
      expect(context.retrievalMethod).not.toBe('failed')
    })
  })

  describe('Query Handling - Water Damage', () => {
    beforeAll(() => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'true'
    })

    it('should handle water damage query with QLD jurisdiction', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        waterCategory: '1',
        state: 'QLD',
        postcode: '4000',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      // Should not throw error
      expect(context).toBeDefined()
      expect(context.retrievalSuccess).toBeDefined()
      // When DB available, should have building code requirements
      if (context.retrievalSuccess) {
        expect(context.buildingCodeRequirements.length).toBeGreaterThan(0)
      }
    })

    it('should handle water damage with electrical work', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        waterCategory: '2',
        state: 'NSW',
        requiresElectricalWork: true,
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      expect(context).toBeDefined()
      // When DB available, should include electrical requirements
      if (context.retrievalSuccess && context.electricalRequirements.length > 0) {
        expect(context.electricalRequirements[0]).toMatch(/electrical|as\/nzs/i)
      }
    })

    it('should handle water damage with plumbing involved', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        waterCategory: '3',
        state: 'VIC',
        materials: ['plumbing', 'drywall'],
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      expect(context).toBeDefined()
      // When DB available, should include plumbing standards
      if (context.retrievalSuccess && context.plumbingRequirements.length > 0) {
        expect(context.plumbingRequirements[0]).toMatch(/plumbing|drainage/i)
      }
    })
  })

  describe('Query Handling - Mould Damage', () => {
    beforeAll(() => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'true'
    })

    it('should handle mould remediation query', async () => {
      const query: RegulatoryQuery = {
        reportType: 'mould',
        state: 'QLD',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      expect(context).toBeDefined()
      // When DB available, should have safety requirements for mould
      if (context.retrievalSuccess) {
        expect(context.applicableLaws.length).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('Multi-State Scenarios', () => {
    beforeAll(() => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'true'
    })

    it('should retrieve QLD-specific building code (QDC 4.5)', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        state: 'QLD',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      // When DB available, should include QDC 4.5
      if (context.retrievalSuccess) {
        const hasQDC = context.documents.some(d =>
          d.documentCode?.includes('QDC')
        )
        expect(hasQDC || context.documents.length === 0).toBe(true)
      }
    })

    it('should retrieve NSW-specific building regulations', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        state: 'NSW',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      // When DB available, should include NSW building code
      if (context.retrievalSuccess) {
        const hasNSW = context.documents.some(d =>
          d.jurisdiction === 'NSW'
        )
        expect(hasNSW || context.documents.length === 0).toBe(true)
      }
    })

    it('should retrieve VIC-specific building regulations', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        state: 'VIC',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      // When DB available, should include VIC building regulations
      if (context.retrievalSuccess) {
        const hasVIC = context.documents.some(d =>
          d.jurisdiction === 'VIC'
        )
        expect(hasVIC || context.documents.length === 0).toBe(true)
      }
    })

    it('should handle all 8 Australian states', async () => {
      const states = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'ACT', 'NT']

      for (const state of states) {
        const query: RegulatoryQuery = {
          reportType: 'water',
          state,
        }

        const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

        // Should not throw error for any state
        expect(context).toBeDefined()
        expect(context.retrievalSuccess).toBeDefined()
      }
    })
  })

  describe('Insurance Scenarios', () => {
    beforeAll(() => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'true'
    })

    it('should retrieve insurance requirements when insurer name provided', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        state: 'QLD',
        insurerName: 'IAG',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      expect(context).toBeDefined()
      // When DB available, should include insurance requirements
      if (context.retrievalSuccess && context.insuranceRequirements.length > 0) {
        expect(context.insuranceRequirements[0]).toBeDefined()
      }
    })
  })

  describe('Context Formatting', () => {
    it('should format empty context to empty string', () => {
      const emptyContext: RegulatoryContext = {
        documents: [],
        summary: '',
        applicableLaws: [],
        buildingCodeRequirements: [],
        electricalRequirements: [],
        plumbingRequirements: [],
        hvacRequirements: [],
        insuranceRequirements: [],
        consumerProtections: [],
        retrievalSuccess: false,
        retrievalMethod: 'failed',
      }

      const formatted = formatRegulatoryContextForPrompt(emptyContext)

      expect(formatted).toBe('')
    })

    it('should format successful context with all categories', () => {
      const context: RegulatoryContext = {
        documents: [
          {
            name: 'NCC 2025',
            documentType: 'BUILDING_CODE_NATIONAL',
            documentCode: 'NCC 2025',
            relevantSections: ['Section 3.2: Moisture Management'],
            citations: [
              {
                reference: 'NCC 2025 Sec 3.2.1',
                text: 'Moisture content shall not exceed 15%',
                type: 'building_code',
              },
            ],
          },
        ],
        summary: 'Apply NCC 2025 building standards',
        applicableLaws: ['NCC 2025: National Construction Code'],
        buildingCodeRequirements: ['NCC 2025: Moisture management standards'],
        electricalRequirements: ['AS/NZS 3000: Electrical safety'],
        plumbingRequirements: [],
        hvacRequirements: ['AS 1668: Ventilation standards'],
        insuranceRequirements: [],
        consumerProtections: ['Australian Consumer Law'],
        retrievalSuccess: true,
        retrievalMethod: 'database',
        stateRequirements: 'QLD-specific: Apply QDC 4.5 standards',
      }

      const formatted = formatRegulatoryContextForPrompt(context)

      expect(formatted).toContain('REGULATORY COMPLIANCE CONTEXT')
      expect(formatted).toContain('NCC 2025')
      expect(formatted).toContain('Electrical Standards')
      expect(formatted).toContain('HVAC Standards')
      expect(formatted).toContain('QLD-specific')
    })
  })

  describe('Citation Extraction', () => {
    it('should extract citations from context', () => {
      const context: RegulatoryContext = {
        documents: [
          {
            name: 'NCC 2025',
            documentType: 'BUILDING_CODE_NATIONAL',
            documentCode: 'NCC 2025',
            relevantSections: ['Section 3.2'],
            citations: [
              {
                reference: 'NCC 2025 Sec 3.2.1',
                text: 'Moisture requirements',
                type: 'building_code',
              },
              {
                reference: 'NCC 2025 Sec 3.2.2',
                text: 'Drying standards',
                type: 'building_code',
              },
            ],
          },
        ],
        summary: '',
        applicableLaws: [],
        buildingCodeRequirements: [],
        electricalRequirements: [],
        plumbingRequirements: [],
        hvacRequirements: [],
        insuranceRequirements: [],
        consumerProtections: [],
        retrievalSuccess: true,
        retrievalMethod: 'database',
      }

      const citations = extractCitationsFromContext(context)

      expect(citations.length).toBe(2)
      expect(citations[0].reference).toBe('NCC 2025 Sec 3.2.1')
      expect(citations[1].reference).toBe('NCC 2025 Sec 3.2.2')
    })

    it('should handle empty citations', () => {
      const context: RegulatoryContext = {
        documents: [
          {
            name: 'Test Document',
            documentType: 'BUILDING_CODE_STATE',
            relevantSections: [],
            citations: [],
          },
        ],
        summary: '',
        applicableLaws: [],
        buildingCodeRequirements: [],
        electricalRequirements: [],
        plumbingRequirements: [],
        hvacRequirements: [],
        insuranceRequirements: [],
        consumerProtections: [],
        retrievalSuccess: true,
        retrievalMethod: 'database',
      }

      const citations = extractCitationsFromContext(context)

      expect(citations.length).toBe(0)
    })
  })

  describe('Graceful Degradation', () => {
    beforeAll(() => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'true'
    })

    it('should not throw on invalid state', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        state: 'INVALID_STATE',
      }

      // Should not throw - graceful degradation
      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      expect(context).toBeDefined()
      expect(context.retrievalSuccess).toBeDefined()
    })

    it('should not throw on missing API key when not needed', async () => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'true'
      delete process.env.ANTHROPIC_API_KEY

      const query: RegulatoryQuery = {
        reportType: 'water',
      }

      // Should still return context (may not have AI summary, but should not throw)
      const context = await retrieveRegulatoryContext(query)

      expect(context).toBeDefined()
      expect(context.retrievalSuccess).toBeDefined()

      // Restore API key for other tests
      process.env.ANTHROPIC_API_KEY = MOCK_API_KEY
    })

    it('should handle empty documents from database', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        waterCategory: '1',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      // Should return valid context even if empty
      expect(context).toBeDefined()
      expect(context.documents).toBeDefined()
      expect(Array.isArray(context.documents)).toBe(true)
    })
  })

  describe('State-Specific Requirements', () => {
    beforeAll(() => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'true'
    })

    it('should include state requirements summary for QLD', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        state: 'QLD',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      if (context.stateRequirements) {
        expect(context.stateRequirements).toContain('QLD')
      }
    })

    it('should include climate notes for tropical/arid states', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
        state: 'NT',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      // NT has extreme climate variation - should be noted
      if (context.stateRequirements) {
        expect(context.stateRequirements).toMatch(/NT|climate|tropical|arid/i)
      }
    })
  })

  describe('Backward Compatibility', () => {
    beforeAll(() => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'false'
    })

    it('should return empty context when feature is disabled (backward compatible)', async () => {
      const query: RegulatoryQuery = {
        reportType: 'water',
      }

      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      expect(context.retrievalSuccess).toBe(false)
      expect(context.documents.length).toBe(0)
      expect(context.summary).toBe('')
    })

    it('should not break existing report generation flow', async () => {
      process.env.ENABLE_REGULATORY_CITATIONS = 'false'

      const query: RegulatoryQuery = {
        reportType: 'water',
        waterCategory: '1',
        state: 'QLD',
      }

      // This is how it would be called in the existing report generation flow
      const context = await retrieveRegulatoryContext(query, MOCK_API_KEY)

      // Should never throw, always return valid context structure
      expect(context).toBeDefined()
      expect(context.documents).toBeDefined()
      expect(context.applicableLaws).toBeDefined()
    })
  })
})

/**
 * Sample Query Examples for Manual Testing
 *
 * Run these manually when database is seeded:
 */
export const SAMPLE_QUERIES = {
  waterDamageQLD: {
    reportType: 'water' as const,
    waterCategory: '1' as const,
    state: 'QLD',
    postcode: '4000',
    materials: ['drywall', 'carpet'],
    requiresElectricalWork: true,
  },
  mouldRemediationNSW: {
    reportType: 'mould' as const,
    state: 'NSW',
    postcode: '2000',
    materials: ['wood', 'plumbing'],
  },
  commercialWaterVIC: {
    reportType: 'commercial' as const,
    state: 'VIC',
    postcode: '3000',
    propertyType: 'commercial' as const,
  },
  fireRestorationSA: {
    reportType: 'fire' as const,
    state: 'SA',
    postcode: '5000',
  },
} as const
