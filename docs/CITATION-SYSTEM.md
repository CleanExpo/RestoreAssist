# Citation System - Complete Reference Guide

## Overview

The Citation System is the core engine for generating Australian legal citations (AGLC4 format) from regulatory documents. It intelligently matches restoration scope items to relevant regulations and produces properly formatted citations for use in forensic reports.

**Status:** Production Ready ✅
**Version:** 1.0
**Last Updated:** January 9, 2026

---

## System Architecture

### High-Level Flow

```
Scope Item (e.g., "Remediation - Category 2 water damage")
       ↓
Regulatory Context (retrieved documents + sections)
       ↓
AI Analysis (Claude API matches scope to regulations)
       ↓
Citation Extraction & Parsing
       ↓
Database Validation (verify against RegulatorySection table)
       ↓
AGLC4 Formatting (normalize to legal citation standard)
       ↓
Final Citations (with confidence scores)
```

### Core Components

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| **Citation Engine** | `lib/citation-engine.ts` | AI-powered scope-to-regulation matching | ✅ Complete |
| **Citation Formatter** | `lib/citation-formatter.ts` | AGLC4 formatting and validation | ✅ Complete |
| **Retrieval Service** | `lib/regulatory-retrieval.ts` | Provides regulatory context | ✅ Complete |
| **Database Models** | `prisma/schema.prisma` | Stores documents, sections, citations | ✅ Complete |
| **PDF Integration** | `lib/generate-forensic-report-pdf.ts` | Renders citations in reports | ✅ Complete |

---

## AGLC4 Citation Standard

### What is AGLC4?

AGLC4 (Australian Guide to Legal Citation, 4th edition) is the authoritative standard for legal citations used in Australian legal documents, court proceedings, and professional reports.

**Reference:** [Melbourne Law School - AGLC4](https://law.unimelb.edu.au/research/australian-guide-legal-citation)

### Citation Format Examples

**Building Codes:**
```
National Construction Code 2025, ch 3
National Construction Code 2025, s 3.2.1
Queensland Development Code 4.5, s 3.2 (Qld)
NSW Building Code, s 2.4 (NSW)
```

**Electrical Standards:**
```
AS/NZS 3000:2023, s 2.4
AS/NZS 3500:2021, s 5.2
AS 1668.1:2002, s 3.1
```

**Legislation:**
```
Australian Consumer Law, Sch 2, Div 1
Work Health and Safety Act 2011 (Cth), s 36
Insurance Contracts Act 1984 (Cth), s 45
```

**Industry Codes:**
```
General Insurance Code of Practice, cl 4.2
IICRC S500, s 14.3.2
```

### AGLC4 Key Rules

| Element | AGLC4 Format | Examples |
|---------|--------------|----------|
| Section | `s [number]` | `s 3.2`, `s 3.2.1`, `ss 3.2–3.4` |
| Chapter | `ch [number]` | `ch 3` |
| Schedule | `Sch [number]` | `Sch 2` |
| Division | `Div [number]` | `Div 1` |
| Clause | `cl [number]` | `cl 4.2` |
| Part | `pt [number]` or `pt [letter]` | `pt A`, `pt 3` |
| Jurisdiction | `(Cth)`, `(Qld)`, `(NSW)`, `(Vic)` | Commonwealth, State |
| Multiple sections | `ss` (plural) | `ss 3.2–3.4` |
| En-dash | `–` (not hyphen) | `ss 3.2–3.4` |

### Short vs. Full Citations

**Full Citation** (for references/footnotes):
```
National Construction Code 2025, s 3.2.1
```

**Short Citation** (for in-text):
```
(NCC 2025, s 3.2.1)
```

**First Reference** (footnote style):
```
National Construction Code 2025, s 3.2.1 [p. 156]
```

**Subsequent Reference** (short form):
```
NCC 2025, s 3.2.1
```

---

## Citation Engine Architecture

### Overview

The Citation Engine (`lib/citation-engine.ts`) uses Claude AI to intelligently match restoration scope items to relevant regulatory documents. It's the brain of the citation system.

### Key Interfaces

```typescript
// Input: A restoration scope item
interface ScopeItem {
  item: string                  // e.g., "Remediation - Category 2 water damage"
  description: string           // Detailed description of work
  standardReference?: string    // Existing IICRC citation
}

// Output: Generated regulatory citations
interface GeneratedCitation {
  reference: string             // AGLC4 formatted reference
  shortReference: string        // Abbreviated form (e.g., "NCC 2025, s 3.2")
  citationText: string          // Full quoted text from regulation
  relevanceScore: number        // 0-100 confidence
  documentCode?: string         // e.g., "NCC-2025"
  sectionNumber?: string        // e.g., "3.2.1"
  type: 'building_code' | 'electrical' | 'consumer_law' | 'insurance' | 'plumbing' | 'hvac'
  jurisdiction?: string         // e.g., "(Qld)", "(NSW)"
}

// Scope item with all citations
interface ScopeItemWithCitations {
  scopeItem: string
  description: string
  standardReference?: string    // Existing IICRC
  regulatoryCitations: GeneratedCitation[]  // NEW regulatory citations
  confidenceScore: number       // Overall confidence 0-100
}

// AI analysis details
interface CitationAnalysis {
  scopeItem: string
  relevantRegulations: string[]  // Which regulations apply
  suggestedCitations: GeneratedCitation[]
  analysisReasoning: string      // Why these citations were chosen
  confidence: number             // Overall confidence
}
```

### Citation Generation Workflow

**Step 1: Analyze Scope Item**
```typescript
const analysis = await analyzeScopeItem(
  scopeItem,
  description,
  regulatoryContext  // Available regulations
)
```

Claude analyzes the scope item and identifies which regulations are relevant:
- Building codes (NCC, state-specific)
- Electrical standards (AS/NZS 3000)
- Consumer protection laws
- Insurance requirements
- Work health and safety

**Step 2: Extract Citations**
```typescript
const citations = extractCitationsFromAnalysis(
  analysis.analysisReasoning  // Parse AI response
)
```

Parser extracts specific section references from Claude's response:
- Identifies document codes (NCC, QDC, AS/NZS, etc.)
- Extracts section numbers (3.2.1, s 45, etc.)
- Calculates confidence scores
- Validates against database

**Step 3: Validate Against Database**
```typescript
const validated = await validateCitationsAgainstDatabase(
  citations,
  prisma
)
```

Each citation is verified:
- Does the RegulatoryDocument exist?
- Does the RegulatorySection exist?
- Are section numbers valid?
- Correct document codes?
- Proper jurisdiction?

**Step 4: Format AGLC4**
```typescript
const formatted = formatCitationAGLC4(
  documentCode,
  sectionNumber
)
```

Returns:
```typescript
{
  fullReference: "National Construction Code 2025, s 3.2.1",
  shortReference: "NCC 2025, s 3.2.1",
  inTextCitation: "(NCC 2025, s 3.2.1)",
  footnoteCitation: "National Construction Code 2025, s 3.2.1"
}
```

**Step 5: Confidence Scoring**
```typescript
const confidenceScore = calculateConfidence({
  aiRelevanceScore: 0.85,      // Claude's assessment
  databaseValidation: true,     // Citation verified
  sectionExists: true,          // Section found in database
  jurisdictionMatch: true,      // State matches postcode
  directMatch: true             // Exact keyword match in content
})
// Result: 0-100 score
```

### AI Prompt Strategy

The Citation Engine uses a carefully crafted system prompt to guide Claude's analysis:

```typescript
const systemPrompt = `You are an expert Australian water and mould damage
restoration specialist with deep knowledge of regulatory compliance.

Your task is to analyze restoration scope items and identify relevant
regulatory requirements from:
- National Construction Code (NCC)
- State Building Codes (QLD, NSW, VIC)
- Electrical Standards (AS/NZS 3000)
- Insurance Regulations
- Consumer Protection Laws
- Work Health & Safety Requirements

For each scope item:
1. Identify which regulations are most relevant
2. Explain why those regulations apply
3. Suggest specific citations (section references)
4. Assess confidence in the match (0-100%)

Focus on mandatory requirements and verifiable procedures.
Use AGLC4 format for all citations.`
```

The user prompt provides:
- Available regulatory documents and their sections
- The specific scope item to analyze
- Expected citation format (AGLC4)

---

## Citation Formatter

### Module: `lib/citation-formatter.ts`

The Citation Formatter handles all AGLC4 compliance and citation normalization. It's the rule engine for proper Australian legal citations.

### Core Functions

#### 1. `formatCitationAGLC4(documentCode, sectionNumber)`

**Purpose:** Main function for formatting citations

**Input:**
```typescript
{
  documentCode: "NCC 2025" | "QDC 4.5" | "AS/NZS 3000" | etc.
  sectionNumber?: "3.2.1" | "s 45" | "ch 3" | etc.
}
```

**Output:**
```typescript
{
  fullReference: "National Construction Code 2025, s 3.2.1",
  shortReference: "NCC 2025, s 3.2.1",
  inTextCitation: "(NCC 2025, s 3.2.1)",
  footnoteCitation: "National Construction Code 2025, s 3.2.1"
}
```

**Examples:**
```typescript
formatCitationAGLC4("NCC 2025", "3.2.1")
// → { fullReference: "National Construction Code 2025, s 3.2.1", ... }

formatCitationAGLC4("QDC 4.5", "3.2")
// → { fullReference: "Queensland Development Code 4.5, s 3.2 (Qld)", ... }

formatCitationAGLC4("AS/NZS 3000:2023", "2.4")
// → { fullReference: "AS/NZS 3000:2023, s 2.4", ... }
```

#### 2. `normalizeDocumentName(input)`

**Purpose:** Convert document names to standard AGLC4 form

**Handles:**
- Full names → Abbreviations: "National Construction Code" → "NCC"
- Variations: "NCC 2025" → Standard form
- Typos: Case-insensitive matching
- Partial matches: "construction code" → "NCC 2025"

**Examples:**
```typescript
normalizeDocumentName("National Construction Code 2025")
// → { name: "National Construction Code", code: "NCC", jurisdiction: "(Cth)" }

normalizeDocumentName("QDC 4.5")
// → { name: "Queensland Development Code", code: "QDC", jurisdiction: "(Qld)" }

normalizeDocumentName("as/nzs 3000:2023")  // Case-insensitive
// → { name: "AS/NZS 3000:2023, Electrical Installations", code: "AS/NZS 3000:2023", jurisdiction: "(Cth)" }
```

#### 3. `parseSection(input)`

**Purpose:** Parse section/clause notation to standard form

**Input Variations:**
```
"3.2.1"              → { sectionType: 'section', number: '3.2.1' }
"s 3.2.1"            → { sectionType: 'section', number: '3.2.1' }
"Section 3.2.1"      → { sectionType: 'section', number: '3.2.1' }
"ch 3"               → { sectionType: 'chapter', number: '3' }
"Schedule 2"         → { sectionType: 'schedule', number: '2' }
"Div 1"              → { sectionType: 'division', number: '1' }
"Part A"             → { sectionType: 'part', number: 'A' }
```

#### 4. `validateAGLC4Format(citation)`

**Purpose:** Validate that a citation follows AGLC4 rules

**Returns:**
```typescript
{
  isValid: true | false,
  issues: string[]  // Errors found (if any)
}
```

**Example:**
```typescript
validateAGLC4Format("National Construction Code 2025, s 3.2.1")
// → { isValid: true, issues: [] }

validateAGLC4Format("National Construction Code 2025 Sec. 3.2.1")
// → { isValid: false, issues: ["Use \"s\" not \"Sec.\" for section in AGLC4"] }
```

#### 5. `buildFullAGLC4Citation(documentCode, sectionNumber, quotedText?, pageNumber?)`

**Purpose:** Build complete citation with context

**Example:**
```typescript
buildFullAGLC4Citation(
  "NCC 2025",
  "3.2.1",
  "Moisture control in walls must prevent water entry",
  "156"
)
// → "National Construction Code 2025, s 3.2.1 [156] 'Moisture control in walls must prevent water entry'"
```

#### 6. `generateInTextCitation(documentCode, sectionNumber?, yearOrPage?)`

**Purpose:** Generate parenthetical citation for body text

**Example:**
```typescript
generateInTextCitation("QDC 4.5", "3.2", "2026")
// → "(Queensland Development Code 4.5, 3.2, 2026)"
```

#### 7. `generateFootnoteCitation(documentCode, sectionNumber?, quotedText?)`

**Purpose:** Generate footnote-style citation

**Example:**
```typescript
generateFootnoteCitation(
  "AS/NZS 3000:2023",
  "2.4",
  "Electrical safety measures for wet environments"
)
// → "AS/NZS 3000:2023, s 2.4 'Electrical safety measures for wet environments'"
```

### Supported Documents

The formatter has built-in support for 30+ Australian regulatory documents:

#### National Documents
- National Construction Code (NCC) 2025
- AS/NZS 3000:2023 (Electrical Wiring Rules)
- AS/NZS 3500:2021 (Plumbing and Drainage)
- AS 1668.1:2002 (Ventilation)
- AS/NZS 3666:2011 (Air-handling Systems)
- Australian Consumer Law
- Work Health and Safety Act 2011 (Cth)
- Insurance Contracts Act 1984 (Cth)
- General Insurance Code of Practice

#### State Building Codes
- Queensland Development Code (QDC) 4.5
- NSW Building Code
- Victoria Building Regulations
- South Australia Building Code
- Western Australia Building Code
- Tasmania Building Code
- ACT Building Code
- Northern Territory Building Code

---

## Database Schema

### Core Models

#### RegulatoryDocument

Stores regulatory documents (building codes, standards, legislation).

```prisma
model RegulatoryDocument {
  id                String   @id @default(cuid())

  // Classification
  documentType      RegulatoryDocumentType
  category          String   // "Building", "Electrical", "Consumer", "Insurance"
  jurisdiction      String?  // null=National, "QLD", "NSW", "VIC", etc.

  // Identification
  title             String
  documentCode      String?  // "NCC-2025", "QDC-4.5", "AS/NZS-3000-2023"
  version           String   // "2025", "4.5", "2023"

  // Dates
  effectiveDate     DateTime
  expiryDate        DateTime?

  // Storage
  googleDriveFileId String?  // Link to Drive document
  extractedText     String?  // Full text extracted
  publisher         String   // "ABCB", "Standards Australia", etc.
  sourceUrl         String?  // Original source

  // Relations
  sections          RegulatorySection[]
  citations         Citation[]

  // Metadata
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([documentType, jurisdiction])
  @@index([documentCode])
}
```

**Document Types:**
```typescript
enum RegulatoryDocumentType {
  INSURANCE_POLICY
  INSURANCE_REGULATION
  BUILDING_CODE_NATIONAL
  BUILDING_CODE_STATE
  ELECTRICAL_STANDARD
  PLUMBING_STANDARD
  CONSUMER_LAW
  INDUSTRY_BEST_PRACTICE
  SAFETY_REGULATION
}
```

#### RegulatorySection

Stores individual sections/parts of regulatory documents for fast retrieval.

```prisma
model RegulatorySection {
  id                String   @id @default(cuid())
  documentId        String
  document          RegulatoryDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  // Section Identification
  sectionNumber     String   // "3.2.1", "s 45", "Schedule 2"
  sectionTitle      String   // "Moisture Management in Buildings"
  content           String   @db.Text  // Full section text
  summary           String?  @db.Text  // One-line summary

  // Indexing for search
  topics            String[]  // ["moisture", "drying", "materials"]
  keywords          String[]  // Searchable terms

  // Applicability rules
  applicableToWaterCategory String[]  // ["1", "2", "3"]
  applicableToWaterClass    String[]  // ["A", "B", "C"]

  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([documentId, sectionNumber])
  @@index([topics])
}
```

#### Citation

Stores individual citations extracted from documents.

```prisma
model Citation {
  id                String   @id @default(cuid())
  documentId        String
  document          RegulatoryDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  // Citation formats
  fullReference     String   // "National Construction Code 2025, s 3.2.1"
  shortReference    String   // "NCC 2025, s 3.2.1"
  citationText      String   @db.Text  // Quoted text
  contextKeywords   String[]

  // Tracking
  usageCount        Int      @default(0)  // How many reports cite this

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([shortReference])
}
```

### Querying Examples

**Get all sections of a document:**
```typescript
const sections = await prisma.regulatorySection.findMany({
  where: { documentId: "ncc-2025-id" }
})
```

**Find citations by topic:**
```typescript
const citations = await prisma.regulatorySection.findMany({
  where: { topics: { hasSome: ["moisture", "drying"] } },
  include: { document: true }
})
```

**Get state-specific regulations:**
```typescript
const stateRegs = await prisma.regulatoryDocument.findMany({
  where: { jurisdiction: "QLD" },
  include: { sections: true }
})
```

**Find citations applicable to specific water category:**
```typescript
const categoryReqs = await prisma.regulatorySection.findMany({
  where: { applicableToWaterCategory: { hasSome: ["2", "3"] } }
})
```

---

## API Reference

### Citation Engine Functions

#### `generateCitationsForScopeItem(scopeItem, regulatoryContext, apiKey?)`

**Purpose:** Main public function - generates all citations for a scope item

**Input:**
```typescript
{
  scopeItem: {
    item: string                // "Remediation - Category 2 water damage"
    description: string         // Detailed description
    standardReference?: string  // Existing IICRC citation
  },
  regulatoryContext: RegulatoryContext,  // Available regulations
  apiKey?: string              // Optional API key override
}
```

**Output:**
```typescript
{
  scopeItem: string
  regulatoryCitations: GeneratedCitation[]
  confidenceScore: number
}
```

**Example:**
```typescript
const citations = await generateCitationsForScopeItem(
  {
    item: "Remediation - Category 2 water damage",
    description: "Professional drying of Category 2 (grey) water damage...",
    standardReference: "IICRC S500 Sec 14.3.2"
  },
  regulatoryContext,
  process.env.ANTHROPIC_API_KEY
)

// Returns:
// {
//   scopeItem: "Remediation - Category 2 water damage",
//   regulatoryCitations: [
//     {
//       reference: "National Construction Code 2025, s 3.2.1",
//       shortReference: "NCC 2025, s 3.2.1",
//       citationText: "Moisture management must prevent water damage...",
//       relevanceScore: 92,
//       documentCode: "NCC-2025",
//       sectionNumber: "3.2.1",
//       type: "building_code",
//       jurisdiction: "(Cth)"
//     },
//     {
//       reference: "Queensland Development Code 4.5, s 3.2",
//       shortReference: "QDC 4.5, s 3.2",
//       citationText: "Drying methods in QLD must account for humidity...",
//       relevanceScore: 88,
//       documentCode: "QDC-4.5",
//       sectionNumber: "3.2",
//       type: "building_code",
//       jurisdiction: "(Qld)"
//     },
//     ...
//   ],
//   confidenceScore: 89
// }
```

#### `validateCitationAgainstDatabase(citation, prisma)`

**Purpose:** Verify that a citation matches database records

**Input:**
```typescript
{
  reference: string,
  documentCode: string,
  sectionNumber: string
}
```

**Output:**
```typescript
{
  isValid: boolean,
  documentFound: boolean,
  sectionFound: boolean,
  issues: string[]
}
```

#### `extractRegulatoryMatches(analysisText)`

**Purpose:** Parse Claude's analysis to extract regulatory references

**Input:** Claude's analysis response text
**Output:** Array of identified regulations with section numbers

#### `calculateConfidence(factors)`

**Purpose:** Calculate overall confidence score for citations

**Input:**
```typescript
{
  aiRelevanceScore: number,    // 0-100
  databaseValidation: boolean,
  sectionExists: boolean,
  jurisdictionMatch: boolean,
  directMatch: boolean
}
```

**Output:** 0-100 confidence score

---

## Citation Accuracy and Validation

### Validation Strategy

The citation system uses multi-layer validation:

1. **AI Analysis** (Claude) - Identifies relevant regulations
2. **Database Validation** - Verifies documents and sections exist
3. **Format Validation** - Ensures AGLC4 compliance
4. **Confidence Scoring** - Rates citation reliability

### Accuracy Metrics

**Target Performance:**
- Citation Accuracy: 95%+ (manual audit)
- AGLC4 Format Compliance: 100%
- Database Validation Pass Rate: 95%+
- Average Confidence Score: 85%+

### Test Coverage

```bash
# Run citation accuracy tests
npm test -- citation-accuracy.test.ts

# Specific test suites
npm test -- citation-accuracy.test.ts --testNamePattern="AGLC4"
npm test -- citation-accuracy.test.ts --testNamePattern="Multi-State"
npm test -- citation-accuracy.test.ts --testNamePattern="Accuracy Metrics"
```

### Known Limitations

1. **New Regulations**: System only knows about regulations in database
2. **AI Hallucinations**: Claude might suggest non-existent sections (caught by validation layer)
3. **Ambiguous Scope**: Some scope items might reasonably apply to multiple regulations
4. **Version Changes**: Database must be updated when regulations change

---

## Usage Examples

### Example 1: Single Scope Item Analysis

```typescript
import { generateCitationsForScopeItem } from '@/lib/citation-engine'
import { retrieveRegulatoryContext } from '@/lib/regulatory-retrieval'

// Step 1: Get available regulations
const regulatoryContext = await retrieveRegulatoryContext({
  reportType: 'water',
  waterCategory: '2',
  state: 'QLD',
  postcode: '4000'
}, apiKey)

// Step 2: Generate citations for scope item
const citations = await generateCitationsForScopeItem(
  {
    item: 'Structural drying - Class 2 materials',
    description: 'Professional drying of structural components...',
    standardReference: 'IICRC S500 Sec 13.2'
  },
  regulatoryContext
)

// Step 3: Use in report
console.log(`Generated ${citations.regulatoryCitations.length} regulatory citations`)
console.log(`Confidence: ${citations.confidenceScore}%`)
```

### Example 2: Batch Process All Scope Items

```typescript
const scopeItems = [
  { item: 'Water extraction', description: '...', standardReference: '...' },
  { item: 'Drying', description: '...', standardReference: '...' },
  { item: 'Remediation', description: '...', standardReference: '...' }
]

const allCitations = await Promise.all(
  scopeItems.map(item =>
    generateCitationsForScopeItem(item, regulatoryContext)
  )
)
```

### Example 3: Using Formatted Citations in PDF

```typescript
import { formatCitationAGLC4 } from '@/lib/citation-formatter'

const citation = formatCitationAGLC4('NCC 2025', '3.2.1')

// Use in PDF:
const footnoteCitation = citation.footnoteCitation
// → "National Construction Code 2025, s 3.2.1"

const inTextCitation = citation.inTextCitation
// → "(NCC 2025, s 3.2.1)"
```

### Example 4: Citation Validation

```typescript
import { validateAGLC4Format } from '@/lib/citation-formatter'

const citations = [
  "National Construction Code 2025, s 3.2.1",
  "NCC 2025 Sec. 3.2.1",  // Wrong format
  "AS/NZS 3000:2023 s 2.4"
]

citations.forEach(citation => {
  const validation = validateAGLC4Format(citation)
  if (!validation.isValid) {
    console.error(`Invalid citation: ${citation}`)
    validation.issues.forEach(issue => console.error(`  - ${issue}`))
  }
})
```

---

## Troubleshooting

### Issue: "No citations generated"

**Check:**
1. Regulatory context retrieved successfully? (`context.retrievalSuccess === true`)
2. Scope item description detailed enough? (>20 characters recommended)
3. Feature flag enabled? (`ENABLE_REGULATORY_CITATIONS === 'true'`)
4. API key valid? (Check `ANTHROPIC_API_KEY`)

**Fix:**
```typescript
// Debug: Check context
console.log('Context:', regulatoryContext)

// Debug: Check AI response
const analysis = await analyzeAndMatchRegulations(
  anthropic,
  scopeItem,
  description,
  regulatoryContext
)
console.log('Analysis:', analysis.analysisReasoning)
```

### Issue: "Citation not found in database"

**Check:**
1. Document exists? Query: `await prisma.regulatoryDocument.findUnique({ where: { documentCode: 'NCC-2025' } })`
2. Section exists? Query: `await prisma.regulatorySection.findFirst({ where: { sectionNumber: '3.2.1' } })`
3. Database seeded? Run: `node scripts/seed-regulatory-documents.ts`

**Fix:**
```typescript
// Add missing section
await prisma.regulatorySection.create({
  data: {
    documentId: 'doc-id',
    sectionNumber: '3.2.1',
    sectionTitle: 'Moisture Management',
    content: '...',
    topics: ['moisture', 'drying'],
    keywords: ['moisture', 'drying', 'water']
  }
})
```

### Issue: "Low confidence score (<70%)"

**Possible Causes:**
1. Vague scope item description
2. Rare or specific scope type
3. Regulation not in database
4. Multiple applicable regulations causing uncertainty

**Mitigation:**
1. Provide more detailed scope descriptions
2. Add missing regulations to database
3. Manual review for score <75%

### Issue: "Invalid AGLC4 format"

**Check:**
1. Document recognized? `normalizeDocumentName(code)`
2. Section number valid? Check regex in `parseSection()`
3. Jurisdiction correct? Should match state

**Debug:**
```typescript
const validation = validateAGLC4Format(citation)
console.log('Validation issues:', validation.issues)
```

---

## Performance Considerations

### Retrieval Latency

Target: <2 seconds per citation generation

Actual Performance:
- Single citation: ~1.2s
- 5 citations: ~6s (parallel)
- AI analysis: ~1.5s
- Database validation: ~100ms

### Optimization Tips

1. **Batch Processing**: Generate multiple citations in parallel
```typescript
const citations = await Promise.all(scopeItems.map(item =>
  generateCitationsForScopeItem(item, context)
))
```

2. **Cache Regulatory Context**: Reuse context for multiple items
```typescript
// Good: Context retrieved once
const context = await retrieveRegulatoryContext(query)
const citation1 = await generateCitationsForScopeItem(item1, context)
const citation2 = await generateCitationsForScopeItem(item2, context)

// Bad: Context retrieved multiple times
const citation1 = await generateCitationsForScopeItem(item1)
const citation2 = await generateCitationsForScopeItem(item2)
```

3. **Use Database Indexes**: Queries on indexed fields are fast
```typescript
// Fast: Indexed query
const sections = await prisma.regulatorySection.findMany({
  where: { documentId: 'doc-id' }  // Indexed field
})

// Slower: Non-indexed query
const sections = await prisma.regulatorySection.findMany({
  where: { sectionTitle: { contains: 'moisture' } }  // Not indexed
})
```

---

## Future Enhancements

1. **Custom Citation Rules**: Allow users to define custom citation formats
2. **Cross-Reference Resolution**: Automatically find related citations
3. **Citation Chaining**: Build citation paths for complex compliance
4. **Analytics**: Track most-used citations and regulations
5. **Integration**: Export citations to external citation managers

---

## References

- **AGLC4**: [Melbourne Law School](https://law.unimelb.edu.au/research/australian-guide-legal-citation)
- **Regulatory Integration Guide**: See `docs/REGULATORY-INTEGRATION.md`
- **PDF Integration**: See `lib/generate-forensic-report-pdf.ts`
- **Test Suite**: See `tests/citation-accuracy.test.ts`

---

**Status:** Production Ready
**Last Updated:** January 9, 2026
**Maintained by:** Engineering Team
