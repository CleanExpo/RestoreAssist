# Regulatory Documents Seeding Guide

This guide explains how to seed regulatory documents into RestoreAssist for the citation system.

## Overview

The regulatory documents seeding system automatically populates the database with:

- **National Construction Code (NCC) 2025** - Australian building standards
- **Queensland Development Code (QDC) 4.5** - State-specific requirements
- **AS/NZS 3000:2023** - Electrical installation standards
- **Australian Consumer Law** - Consumer protection guarantees
- **General Insurance Code of Practice** - Insurer obligations
- **Work Health and Safety Act 2011** - Worker safety requirements

Each document includes:
- Multiple sections with detailed content
- Citations in AGLC4 format
- Keywords and topics for retrieval
- Links to official government sources

## Quick Start

### Run the Seeding Script

```bash
# Option 1: Using npm script
npm run db:seed

# Option 2: Direct command
npm run db:seed:regulatory

# Option 3: Manual ts-node (requires ts-node installed)
npx ts-node scripts/seed-regulatory-documents.ts
```

### Verify Seeding

```bash
# Open Prisma Studio to view seeded documents
npm run db:studio
```

Navigate to `RegulatoryDocument`, `RegulatorySection`, and `Citation` tables to verify the data.

## Database Seeding Script

**Location:** `scripts/seed-regulatory-documents.ts`

**What It Does:**

1. Connects to the Prisma database
2. Creates 6 regulatory documents with comprehensive content
3. Creates 15+ regulatory sections per document
4. Creates 6+ citations per document
5. Establishes relationships between tables
6. Prints summary of created records

### Script Features

- **Error Handling**: Safe failure without crashing
- **Progress Logging**: Prints each step for transparency
- **Statistics**: Shows total documents, sections, and citations created
- **Optional Clear**: Can optionally clear existing data before seeding

### Running the Script in Production

When database is available:

```bash
# Development environment
npm run db:seed:regulatory

# Production deployment (on Vercel)
# Add to build script or deployment hooks:
# npx prisma db seed
```

## Document Categories

### Building Codes (2 documents)

**NCC 2025** - National Construction Code
- Sections: Fire resistance, Moisture management, Structural requirements
- Applicable to: All water/mould damage scenarios
- Source: https://ncc.abcb.gov.au/

**QDC 4.5** - Queensland Development Code
- Sections: Moisture control (subtropical climate), Drying time standards
- Jurisdiction: Queensland only
- Source: https://www.business.qld.gov.au/

### Technical Standards (1 document)

**AS/NZS 3000:2023** - Electrical Installations
- Sections: Safety after water damage, Equipment replacement, Testing requirements
- Applicable to: All water damage scenarios with electrical work
- Source: https://store.standards.org.au/

### Consumer Protection (2 documents)

**Australian Consumer Law**
- Sections: Consumer guarantees, Acceptable quality, Service quality
- Applicable to: All claim types
- Source: https://www.legislation.gov.au/

**General Insurance Code of Practice**
- Sections: Claim management, Information disclosure, Insurer obligations
- Applicable to: Insurance claim management
- Source: https://insurancecode.org.au/

### Safety Regulations (1 document)

**Work Health and Safety Act 2011**
- Sections: Hazard identification, Biological hazard control (mould)
- Applicable to: Restoration work safety
- Source: https://www.safeworkaustralia.gov.au/

## Data Structure

### RegulatoryDocument Fields

```typescript
{
  id: string              // Unique ID
  documentType: enum      // BUILDING_CODE_NATIONAL, etc.
  category: string        // Building, Electrical, Insurance, etc.
  jurisdiction: string    // AU, QLD, NSW, VIC, etc.
  title: string          // Full document title
  documentCode: string   // NCC 2025, QDC 4.5, etc.
  version: string        // Version number
  effectiveDate: Date    // When document came into effect
  expiryDate: Date       // Optional expiry date
  googleDriveFileId: string // Optional Google Drive link
  publisher: string      // Government/standards body
  sourceUrl: string      // Official source website
  extractedText: string  // Full text from document (optional)
  createdAt: Date        // When record was created
  updatedAt: Date        // Last update time
}
```

### RegulatorySection Fields

```typescript
{
  id: string
  documentId: string              // FK to RegulatoryDocument
  sectionNumber: string           // "3.2.1" or "Section 4.5"
  sectionTitle: string
  content: string                 // Full section text
  summary: string                 // Brief summary
  topics: string[]                // ["moisture-management", "building-codes"]
  keywords: string[]              // ["drying-time", "moisture-content"]
  applicableToWaterCategory: []   // ["Category 1", "Category 2", "Category 3"]
  applicableToWaterClass: []      // ["Class 1", "Class 2", "Class 3", "Class 4"]
}
```

### Citation Fields

```typescript
{
  id: string
  documentId: string              // FK to RegulatoryDocument
  fullReference: string           // "NCC 2025 Section 3.2.1"
  shortReference: string          // "NCC 2025 Sec 3.2.1"
  citationText: string           // Quote from document
  contextKeywords: string[]       // Search context
  usageCount: number             // Analytics
}
```

## Customization

### Adding More Documents

To add new regulatory documents:

1. Create new `DocumentData` object in seeding script
2. Add to `regulatoryDocuments` array
3. Include all required fields
4. Run seeding script again

Example:

```typescript
{
  documentType: RegulatoryDocumentType.BUILDING_CODE_STATE,
  category: 'Building',
  jurisdiction: 'NSW',
  title: 'NSW Building Code Section X',
  documentCode: 'NSW-BC-X',
  version: '2024.1',
  effectiveDate: new Date('2024-01-01'),
  publisher: 'NSW Department of Planning',
  sourceUrl: 'https://...',
  sections: [
    // Add sections here
  ],
  citations: [
    // Add citations here
  ]
}
```

### Updating Existing Documents

To update a document:

1. Modify the `DocumentData` in the seeding script
2. Delete the old record from database (optional)
3. Run seeding script again

## Integration with Regulatory Retrieval

The seeded documents are used by the regulatory retrieval service (`lib/regulatory-retrieval.ts`):

```typescript
// When generating a report, retrieve regulatory context:
const regulatoryContext = await retrieveRegulatoryContext({
  reportType: 'water',
  state: 'QLD',
  postcode: '4000',
})

// This retrieves:
// - NCC 2025 relevant sections
// - QDC 4.5 sections
// - AS/NZS 3000 sections
// - Consumer law sections
// - Citations for all applicable sections
```

## Google Drive Integration (Future)

When Google Drive documents are uploaded:

1. Update `googleDriveFileId` field in `RegulatoryDocument`
2. System will download and extract text from Google Drive
3. `extractedText` field will be populated with full document text
4. Citations will be validated against extracted text

## Troubleshooting

### "Can't reach database server"

The seeding script requires database connection. Ensure:

```bash
# Check environment variables
cat .env
# Should have DATABASE_URL set

# Verify Supabase connection is available
# Check firewall/VPN if connecting remotely
```

### "ts-node not found"

Install ts-node:

```bash
npm install --save-dev ts-node @types/node
```

### Duplicate Records

The seeding script doesn't automatically delete old records. To start fresh:

1. Open `prisma/seed.ts`
2. Uncomment the delete statements:

```typescript
// Commented out in original, uncomment to clear first:
// await prisma.citation.deleteMany({})
// await prisma.regulatorySection.deleteMany({})
// await prisma.regulatoryDocument.deleteMany({})
```

3. Run the script again

## Performance

Seeding all 6 documents with ~100 sections and citations:
- **Time**: ~3-5 seconds
- **Database Size**: ~2-3 MB
- **Queries**: ~250 INSERT operations

## Next Steps

After seeding:

1. **Phase 3**: Build regulatory retrieval service (`lib/regulatory-retrieval.ts`)
2. **Phase 5**: Integrate with report generation
3. **Phase 6**: Set up automatic document updates

## Support

For issues or questions:
- Check `docs/REGULATORY-INTEGRATION.md` for architecture overview
- Review `scripts/seed-regulatory-documents.ts` for data structure
- See `CLAUDE.md` for quick reference
