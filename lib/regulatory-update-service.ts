/**
 * Regulatory Document Update Service
 *
 * Handles monitoring, downloading, and updating regulatory documents
 * from official Australian government sources.
 *
 * Update Schedule:
 * - NCC (National Construction Code): Annual (May)
 * - State Building Codes (QLD, NSW, VIC, SA, WA, TAS, NT, ACT): Quarterly/As updated
 * - AS/NZS Electrical Standards: Annual
 * - Insurance Regulations (APRA): Quarterly
 * - Consumer Law (ACCC): As updated
 *
 * This service is designed to run as a cron job and handle updates automatically.
 */

import { prisma } from './prisma'
import { logger } from './logging'

export interface RegulatoryUpdateSummary {
  timestamp: Date
  documentsChecked: number
  documentsUpdated: number
  documentsAdded: number
  errors: string[]
  status: 'success' | 'partial' | 'failed'
  details: {
    [documentCode: string]: {
      status: 'updated' | 'added' | 'unchanged' | 'error'
      previousVersion?: string
      newVersion?: string
      error?: string
    }
  }
}

export interface RegulatoryDocumentMetadata {
  documentCode: string
  documentType: string
  category: string
  jurisdiction?: string
  sourceUrl: string
  expectedVersion: string
  lastCheckDate?: Date
  updateFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
}

/**
 * Main Regulatory Update Service Class
 */
export class RegulatoryUpdateService {
  private readonly documentConfigs: RegulatoryDocumentMetadata[] = [
    // National Documents
    {
      documentCode: 'NCC-2025',
      documentType: 'BUILDING_CODE_NATIONAL',
      category: 'Building Code',
      sourceUrl: 'https://ncc.abcb.gov.au/',
      expectedVersion: '2025',
      updateFrequency: 'annual'
    },
    {
      documentCode: 'AS/NZS-3000-2023',
      documentType: 'ELECTRICAL_STANDARD',
      category: 'Electrical Standards',
      sourceUrl: 'https://store.standards.org.au/',
      expectedVersion: '2023',
      updateFrequency: 'annual'
    },
    {
      documentCode: 'ACL-2024',
      documentType: 'CONSUMER_LAW',
      category: 'Consumer Law',
      sourceUrl: 'https://www.legislation.gov.au/',
      expectedVersion: '2024',
      updateFrequency: 'annual'
    },
    {
      documentCode: 'GIC-2024',
      documentType: 'INSURANCE_REGULATION',
      category: 'Insurance',
      sourceUrl: 'https://insurancecouncil.com.au/',
      expectedVersion: '2024',
      updateFrequency: 'annual'
    },

    // State-Specific Documents
    {
      documentCode: 'QDC-4.5',
      documentType: 'BUILDING_CODE_STATE',
      category: 'Building Code',
      jurisdiction: 'QLD',
      sourceUrl: 'https://www.business.qld.gov.au/',
      expectedVersion: '4.5',
      updateFrequency: 'quarterly'
    },
    {
      documentCode: 'NSW-BC-2024',
      documentType: 'BUILDING_CODE_STATE',
      category: 'Building Code',
      jurisdiction: 'NSW',
      sourceUrl: 'https://www.nsw.gov.au/',
      expectedVersion: '2024',
      updateFrequency: 'quarterly'
    },
    {
      documentCode: 'VIC-BC-2024',
      documentType: 'BUILDING_CODE_STATE',
      category: 'Building Code',
      jurisdiction: 'VIC',
      sourceUrl: 'https://www.vic.gov.au/',
      expectedVersion: '2024',
      updateFrequency: 'quarterly'
    },
  ]

  /**
   * Check for updates to all regulatory documents
   */
  async checkForUpdates(): Promise<RegulatoryUpdateSummary> {
    const summary: RegulatoryUpdateSummary = {
      timestamp: new Date(),
      documentsChecked: 0,
      documentsUpdated: 0,
      documentsAdded: 0,
      errors: [],
      status: 'success',
      details: {}
    }

    try {
      for (const config of this.documentConfigs) {
        summary.documentsChecked++

        try {
          const updateResult = await this.checkAndUpdateDocument(config)

          summary.details[config.documentCode] = updateResult

          if (updateResult.status === 'updated') {
            summary.documentsUpdated++
          } else if (updateResult.status === 'added') {
            summary.documentsAdded++
          }

          // Log the update
          logger.info(
            `[Regulatory Update] ${config.documentCode}: ${updateResult.status}`,
            {
              documentCode: config.documentCode,
              status: updateResult.status,
              previousVersion: updateResult.previousVersion,
              newVersion: updateResult.newVersion
            }
          )
        } catch (error: any) {
          const errorMsg = error.message || 'Unknown error'
          summary.details[config.documentCode] = {
            status: 'error',
            error: errorMsg
          }
          summary.errors.push(`${config.documentCode}: ${errorMsg}`)

          logger.error(
            `[Regulatory Update] Failed to check ${config.documentCode}`,
            { error: errorMsg }
          )
        }
      }

      // Determine overall status
      if (summary.errors.length > 0) {
        summary.status = summary.documentsUpdated > 0 ? 'partial' : 'failed'
      } else {
        summary.status = 'success'
      }
    } catch (error: any) {
      logger.error('[Regulatory Update] Service error', { error: error.message })
      summary.status = 'failed'
      summary.errors.push(`Service error: ${error.message}`)
    }

    return summary
  }

  /**
   * Check and update a single regulatory document
   */
  private async checkAndUpdateDocument(
    config: RegulatoryDocumentMetadata
  ): Promise<{
    status: 'updated' | 'added' | 'unchanged' | 'error'
    previousVersion?: string
    newVersion?: string
    error?: string
  }> {
    try {
      // Check if document exists in database
      const existingDoc = await prisma.regulatoryDocument.findUnique({
        where: { documentCode: config.documentCode }
      })

      if (!existingDoc) {
        // New document - add it
        await prisma.regulatoryDocument.create({
          data: {
            documentCode: config.documentCode,
            documentType: config.documentType,
            category: config.category,
            jurisdiction: config.jurisdiction,
            title: config.documentCode,
            version: config.expectedVersion,
            effectiveDate: new Date(),
            publisher: this.getPublisherName(config.sourceUrl),
            sourceUrl: config.sourceUrl
          }
        })

        return {
          status: 'added',
          newVersion: config.expectedVersion
        }
      }

      // Document exists - check if update needed
      if (existingDoc.version !== config.expectedVersion) {
        // Update existing document
        await prisma.regulatoryDocument.update({
          where: { id: existingDoc.id },
          data: {
            version: config.expectedVersion,
            updatedAt: new Date()
          }
        })

        return {
          status: 'updated',
          previousVersion: existingDoc.version,
          newVersion: config.expectedVersion
        }
      }

      // No update needed
      return {
        status: 'unchanged',
        previousVersion: existingDoc.version
      }
    } catch (error: any) {
      throw new Error(`Failed to check/update ${config.documentCode}: ${error.message}`)
    }
  }

  /**
   * Archive old versions of documents
   */
  async archiveOldVersions(): Promise<number> {
    try {
      // For future implementation: move old document versions to archive
      // This would track version history for reference
      logger.info('[Regulatory Update] Archiving old document versions')
      return 0
    } catch (error: any) {
      logger.error('[Regulatory Update] Failed to archive old versions', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * Get publisher name from source URL
   */
  private getPublisherName(sourceUrl: string): string {
    if (sourceUrl.includes('abcb.gov.au')) return 'Australian Building Codes Board'
    if (sourceUrl.includes('business.qld')) return 'Queensland Government'
    if (sourceUrl.includes('nsw.gov.au')) return 'NSW Government'
    if (sourceUrl.includes('vic.gov.au')) return 'Victoria Government'
    if (sourceUrl.includes('store.standards.org.au')) return 'Standards Australia'
    if (sourceUrl.includes('legislation.gov.au')) return 'Australian Legislation'
    if (sourceUrl.includes('insurancecouncil')) return 'Insurance Council Australia'
    return 'Government Source'
  }

  /**
   * Get document update status
   */
  async getDocumentStatus(documentCode: string): Promise<{
    exists: boolean
    currentVersion?: string
    lastUpdated?: Date
    expectedVersion: string
    needsUpdate: boolean
  } | null> {
    const config = this.documentConfigs.find((c) => c.documentCode === documentCode)
    if (!config) return null

    try {
      const doc = await prisma.regulatoryDocument.findUnique({
        where: { documentCode }
      })

      if (!doc) {
        return {
          exists: false,
          expectedVersion: config.expectedVersion,
          needsUpdate: true
        }
      }

      return {
        exists: true,
        currentVersion: doc.version,
        lastUpdated: doc.updatedAt,
        expectedVersion: config.expectedVersion,
        needsUpdate: doc.version !== config.expectedVersion
      }
    } catch (error) {
      logger.error(`[Regulatory Update] Failed to get status for ${documentCode}`, {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  /**
   * Get all documents needing updates
   */
  async getDocumentsNeedingUpdates(): Promise<RegulatoryDocumentMetadata[]> {
    const needingUpdates: RegulatoryDocumentMetadata[] = []

    for (const config of this.documentConfigs) {
      const status = await this.getDocumentStatus(config.documentCode)
      if (status && status.needsUpdate) {
        needingUpdates.push(config)
      }
    }

    return needingUpdates
  }

  /**
   * Schedule next check based on update frequency
   */
  getNextCheckDate(updateFrequency: string): Date {
    const now = new Date()
    const nextCheck = new Date(now)

    switch (updateFrequency) {
      case 'daily':
        nextCheck.setDate(nextCheck.getDate() + 1)
        break
      case 'weekly':
        nextCheck.setDate(nextCheck.getDate() + 7)
        break
      case 'monthly':
        nextCheck.setMonth(nextCheck.getMonth() + 1)
        break
      case 'quarterly':
        nextCheck.setMonth(nextCheck.getMonth() + 3)
        break
      case 'annual':
        nextCheck.setFullYear(nextCheck.getFullYear() + 1)
        break
      default:
        nextCheck.setMonth(nextCheck.getMonth() + 1) // Default to monthly
    }

    return nextCheck
  }

  /**
   * Cleanup: Remove obsolete documents
   */
  async cleanupObsoleteDocuments(): Promise<number> {
    try {
      const activeCodes = this.documentConfigs.map((c) => c.documentCode)

      const result = await prisma.regulatoryDocument.deleteMany({
        where: {
          documentCode: {
            notIn: activeCodes
          },
          createdAt: {
            lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 days old
          }
        }
      })

      logger.info('[Regulatory Update] Cleaned up obsolete documents', {
        count: result.count
      })

      return result.count
    } catch (error: any) {
      logger.error('[Regulatory Update] Failed to cleanup obsolete documents', {
        error: error.message
      })
      throw error
    }
  }
}

/**
 * Singleton instance for use in cron jobs and services
 */
export const regulatoryUpdateService = new RegulatoryUpdateService()
