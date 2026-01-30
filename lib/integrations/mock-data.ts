/**
 * Mock Data for Integration Development Mode
 *
 * Sample clients and jobs for testing sync/import functionality
 * without connecting to real external services.
 */

import type { ExternalClientData, ExternalJobData } from './base-client'

export const MOCK_CLIENTS: ExternalClientData[] = [
  {
    externalId: 'mock-client-1',
    name: 'Acme Property Management',
    email: 'contact@acmeprop.example.com',
    phone: '(555) 100-1001',
    address: '123 Main Street, Sydney NSW 2000',
  },
  {
    externalId: 'mock-client-2',
    name: 'Globex Insurance Corp',
    email: 'claims@globex.example.com',
    phone: '(555) 200-2002',
    address: '456 Business Park, Melbourne VIC 3000',
  },
  {
    externalId: 'mock-client-3',
    name: 'Initech Strata Services',
    email: 'strata@initech.example.com',
    phone: '(555) 300-3003',
    address: '789 Tower Road, Brisbane QLD 4000',
  },
  {
    externalId: 'mock-client-4',
    name: 'Umbrella Real Estate',
    email: 'property@umbrella.example.com',
    phone: '(555) 400-4004',
    address: '321 Harbour View, Perth WA 6000',
  },
  {
    externalId: 'mock-client-5',
    name: 'Stark Industries Holdings',
    email: 'facilities@stark.example.com',
    phone: '(555) 500-5005',
    address: '555 Innovation Drive, Adelaide SA 5000',
  },
]

export const MOCK_JOBS: ExternalJobData[] = [
  {
    externalId: 'mock-job-1',
    title: 'Water Damage - Kitchen Flood',
    status: 'IN_PROGRESS',
    clientExternalId: 'mock-client-1',
    address: '42 Residential Lane, Sydney NSW 2010',
    description: 'Burst pipe under kitchen sink caused flooding. Water extraction and drying required.',
  },
  {
    externalId: 'mock-job-2',
    title: 'Fire Restoration - Office Building',
    status: 'SCHEDULED',
    clientExternalId: 'mock-client-2',
    address: '88 Commercial Street, Melbourne VIC 3004',
    description: 'Electrical fire in server room. Smoke and soot damage to multiple floors.',
  },
  {
    externalId: 'mock-job-3',
    title: 'Mold Remediation - Bathroom',
    status: 'COMPLETED',
    clientExternalId: 'mock-client-3',
    address: '15 Unit Complex, Brisbane QLD 4005',
    description: 'Black mold discovered in ensuite bathroom. Full remediation completed.',
  },
  {
    externalId: 'mock-job-4',
    title: 'Storm Damage Assessment',
    status: 'QUOTE',
    clientExternalId: 'mock-client-4',
    address: '200 Coastal Road, Perth WA 6025',
    description: 'Roof and window damage from recent storm. Assessment for insurance claim.',
  },
  {
    externalId: 'mock-job-5',
    title: 'Sewage Backup Cleanup',
    status: 'IN_PROGRESS',
    clientExternalId: 'mock-client-5',
    address: '77 Industrial Estate, Adelaide SA 5012',
    description: 'Sewage backup in basement level. Biohazard cleanup and sanitization.',
  },
  {
    externalId: 'mock-job-6',
    title: 'Flood Damage - Living Areas',
    status: 'PENDING',
    clientExternalId: 'mock-client-1',
    address: '99 Riverside Drive, Sydney NSW 2015',
    description: 'Flash flooding affected ground floor. Carpet and furniture damage.',
  },
]
