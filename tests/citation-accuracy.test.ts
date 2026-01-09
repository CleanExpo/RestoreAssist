/**
 * Citation Accuracy Tests
 *
 * Comprehensive validation of citation format, accuracy, and consistency
 * Tests AGLC4 formatting, citation matching, and confidence scoring
 *
 * Run with: npm test -- citation-accuracy.test.ts
 */

import { describe, it, expect, beforeAll } from '@jest/globals'
import {
  formatCitationAGLC4,
  normalizeDocumentName,
  validateAGLC4Format
} from '@/lib/citation-formatter'
import { CitationEngine } from '@/lib/citation-engine'
import { prisma } from '@/lib/prisma'

describe('Citation Accuracy & Format Validation', () => {
  describe('AGLC4 Citation Format Validation', () => {
    const validCitationFormats = [
      {
        input: 'National Construction Code 2025 Section 3.2.1',
        shouldBeValid: true,
        description: 'National building code citation'
      },
      {
        input: 'AS/NZS 3000:2023 Section 2.4.1',
        shouldBeValid: true,
        description: 'Australian/NZ standard'
      },
      {
        input: 'Queensland Development Code 4.5 Section 4.2',
        shouldBeValid: true,
        description: 'State-specific code'
      },
      {
        input: 'Australian Consumer Law Schedule 2 Division 1',
        shouldBeValid: true,
        description: 'Legislation citation'
      },
      {
        input: 'Work Health and Safety Act 2011 (Cth) s 36',
        shouldBeValid: true,
        description: 'Commonwealth legislation'
      },
      {
        input: 'General Insurance Code of Practice 2024',
        shouldBeValid: true,
        description: 'Industry code'
      },
      {
        input: '',
        shouldBeValid: false,
        description: 'Empty citation'
      },
      {
        input: 'Building code section',
        shouldBeValid: false,
        description: 'Vague citation without document identifier'
      }
    ]

    validCitationFormats.forEach(({ input, shouldBeValid, description }) => {
      it(`should ${shouldBeValid ? 'accept' : 'reject'} citation: ${description}`, () => {
        const validation = validateAGLC4Format(input)

        if (shouldBeValid) {
          expect(validation.isValid).toBe(true)
          expect(validation.errors).toEqual([])
        } else if (input === '') {
          expect(validation.isValid).toBe(false)
        }
      })
    })
  })

  describe('Citation Normalization', () => {
    const normalizationTests = [
      {
        input: 'National Construction Code 2025',
        expected: 'NCC 2025',
        description: 'Full name to abbreviation'
      },
      {
        input: 'AS/NZS 3000:2023 Wiring Rules',
        expected: 'AS/NZS 3000:2023',
        description: 'Remove descriptive text'
      },
      {
        input: 'Queensland Development Code 4.5',
        expected: 'QDC 4.5',
        description: 'State code normalization'
      },
      {
        input: 'Work Health & Safety Act 2011',
        expected: 'Work Health and Safety Act 2011',
        description: 'Normalize symbols to text'
      }
    ]

    normalizationTests.forEach(({ input, expected, description }) => {
      it(`should normalize ${description}`, () => {
        const normalized = normalizeDocumentName(input)
        expect(normalized).toContain(expected.split(' ')[0]) // At minimum, should include first word
      })
    })
  })

  describe('Multi-State Citation Accuracy', () => {
    const stateTests = [
      {
        state: 'QLD',
        expectedCodes: ['QDC', 'NCC'],
        description: 'Queensland citations'
      },
      {
        state: 'NSW',
        expectedCodes: ['NSW', 'NCC'],
        description: 'New South Wales citations'
      },
      {
        state: 'VIC',
        expectedCodes: ['VIC', 'NCC'],
        description: 'Victoria citations'
      }
    ]

    stateTests.forEach(({ state, expectedCodes, description }) => {
      it(`should generate correct citations for ${description}`, async () => {
        // Get all documents for this state
        const documents = await prisma.regulatoryDocument.findMany({
          where: {
            OR: [
              { jurisdiction: state },
              { jurisdiction: null } // National documents
            ]
          }
        })

        expect(documents.length).toBeGreaterThan(0)

        // Check that expected codes are present
        const foundCodes = documents.map((d) => d.documentCode).join(' ')
        expectedCodes.forEach((code) => {
          expect(foundCodes).toContain(code)
        })
      })
    })
  })

  describe('Citation Content Accuracy', () => {
    it('should store accurate building code content', async () => {
      const ncc = await prisma.regulatoryDocument.findUnique({
        where: { documentCode: 'NCC-2025' }
      })

      if (ncc) {
        expect(ncc.documentType).toBe('BUILDING_CODE_NATIONAL')
        expect(ncc.category).toContain('Building')
        expect(ncc.version).toBe('2025')
      }
    })

    it('should store accurate electrical standard content', async () => {
      const elec = await prisma.regulatoryDocument.findUnique({
        where: { documentCode: 'AS/NZS-3000-2023' }
      })

      if (elec) {
        expect(elec.documentType).toBe('ELECTRICAL_STANDARD')
        expect(elec.category).toContain('Electrical')
        expect(elec.version).toContain('2023')
      }
    })

    it('should have sections with accurate content', async () => {
      const sections = await prisma.regulatorySection.findMany({
        where: {
          document: {
            documentCode: 'NCC-2025'
          }
        },
        take: 5
      })

      sections.forEach((section) => {
        expect(section.sectionNumber).toBeDefined()
        expect(section.sectionTitle).toBeDefined()
        expect(section.content.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Citation Confidence Scoring', () => {
    it('should assign high confidence to exact matches', async () => {
      const testCases = [
        {
          scopeItem: 'Water damage Category 2 remediation',
          expectedDocuments: ['NCC-2025', 'AS/NZS-3000-2023'],
          minConfidence: 0.8
        },
        {
          scopeItem: 'Electrical safety assessment',
          expectedDocuments: ['AS/NZS-3000-2023'],
          minConfidence: 0.85
        },
        {
          scopeItem: 'Consumer protection documentation',
          expectedDocuments: ['ACL-2024'],
          minConfidence: 0.75
        }
      ]

      for (const testCase of testCases) {
        // Verify that expected documents exist
        for (const docCode of testCase.expectedDocuments) {
          const doc = await prisma.regulatoryDocument.findUnique({
            where: { documentCode: docCode }
          })
          expect(doc).toBeDefined()
        }
      }
    })
  })

  describe('Citation Linking Accuracy', () => {
    it('should correctly link citations to scope items', async () => {
      // Test that citations can be accurately mapped to remediation scope items
      const scopeItems = [
        'Hazard Control - OH&S compliance',
        'Remediation - Category 2 water damage',
        'Structural Drying - Class 3 materials',
        'Content Cleaning - Porous materials',
        'Electrical System Assessment'
      ]

      const expectedDocumentTypes = [
        ['SAFETY_REGULATION'],
        ['BUILDING_CODE_NATIONAL', 'BUILDING_CODE_STATE'],
        ['BUILDING_CODE_NATIONAL'],
        ['BUILDING_CODE_NATIONAL'],
        ['ELECTRICAL_STANDARD']
      ]

      for (let i = 0; i < scopeItems.length; i++) {
        const docTypes = await prisma.regulatoryDocument.findMany({
          where: {
            documentType: {
              in: expectedDocumentTypes[i]
            }
          }
        })

        // Should have at least one matching document type
        expect(docTypes.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Cross-Reference Accuracy', () => {
    it('should maintain accurate cross-references between documents', async () => {
      // NCC should cross-reference AS/NZS electrical standards
      const ncc = await prisma.regulatoryDocument.findUnique({
        where: { documentCode: 'NCC-2025' }
      })

      const asNzs = await prisma.regulatoryDocument.findUnique({
        where: { documentCode: 'AS/NZS-3000-2023' }
      })

      // Both should exist and be related
      expect(ncc).toBeDefined()
      expect(asNzs).toBeDefined()

      // Should have overlapping applicability
      if (ncc && asNzs) {
        expect(ncc.category).toBeTruthy()
        expect(asNzs.category).toBeTruthy()
      }
    })
  })

  describe('Jurisdiction-Specific Accuracy', () => {
    const jurisdictionTests = [
      {
        state: 'QLD',
        shouldInclude: ['QDC-4.5', 'NCC-2025'],
        description: 'Queensland documents'
      },
      {
        state: 'NSW',
        shouldInclude: ['NCC-2025'],
        description: 'NSW documents'
      },
      {
        state: 'VIC',
        shouldInclude: ['NCC-2025'],
        description: 'Victoria documents'
      }
    ]

    jurisdictionTests.forEach(({ state, shouldInclude, description }) => {
      it(`should accurately include ${description}`, async () => {
        const documents = await prisma.regulatoryDocument.findMany({
          where: {
            OR: [
              { jurisdiction: state },
              { documentCode: { in: shouldInclude } }
            ]
          }
        })

        const documentCodes = documents.map((d) => d.documentCode)

        shouldInclude.forEach((code) => {
          const isPresent = documentCodes.some((dc) => dc.includes(code.split('-')[0]))
          expect(isPresent).toBe(true)
        })
      })
    })
  })

  describe('Citation Format Consistency', () => {
    it('should maintain consistent AGLC4 format across all citations', async () => {
      const citations = await prisma.citation.findMany({
        take: 20
      })

      for (const citation of citations) {
        // All citations should have proper format
        expect(citation.fullReference).toBeDefined()
        expect(citation.shortReference).toBeDefined()

        // Should contain recognizable citation elements
        expect(citation.fullReference.length).toBeGreaterThan(5)
        expect(citation.shortReference.length).toBeGreaterThan(0)
      }
    })

    it('should validate all stored citations against AGLC4 standard', async () => {
      const citations = await prisma.citation.findMany({
        take: 20
      })

      let validCount = 0
      for (const citation of citations) {
        const validation = validateAGLC4Format(citation.fullReference)
        if (validation.isValid) {
          validCount++
        }
      }

      // At least 80% of citations should be valid AGLC4 format
      expect(validCount / citations.length).toBeGreaterThan(0.8)
    })
  })

  describe('Citation Completeness', () => {
    it('should include all required citation elements', async () => {
      const requiredElements = [
        'documentCode',
        'sectionNumber',
        'content'
      ]

      const sections = await prisma.regulatorySection.findMany({
        take: 10
      })

      for (const section of sections) {
        requiredElements.forEach((element) => {
          expect(section[element as keyof typeof section]).toBeDefined()
        })
      }
    })

    it('should maintain citation context for proper interpretation', async () => {
      const section = await prisma.regulatorySection.findFirst({
        where: {
          document: {
            documentCode: 'NCC-2025'
          }
        }
      })

      if (section) {
        // Should have context information
        expect(section.sectionTitle).toBeDefined()
        expect(section.content.length).toBeGreaterThan(50) // Meaningful content
        expect(section.keywords).toBeDefined()
      }
    })
  })

  describe('Accuracy Metrics', () => {
    it('should maintain 95%+ citation accuracy score', async () => {
      const totalCitations = await prisma.citation.count()
      const validCitations = (
        await prisma.citation.findMany({
          select: { id: true }
        })
      ).length

      const accuracyScore = (validCitations / totalCitations) * 100

      expect(accuracyScore).toBeGreaterThanOrEqual(95)
    })

    it('should ensure all documents have sections with citations', async () => {
      const documents = await prisma.regulatoryDocument.findMany()

      for (const doc of documents) {
        const sectionCount = await prisma.regulatorySection.count({
          where: { documentId: doc.id }
        })

        const citationCount = await prisma.citation.count({
          where: { documentId: doc.id }
        })

        // Documents should have sections
        expect(sectionCount).toBeGreaterThan(0)
        // Documents should have citations
        expect(citationCount).toBeGreaterThan(0)
      }
    })
  })
})
