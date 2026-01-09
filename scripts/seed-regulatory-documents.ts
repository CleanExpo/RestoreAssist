/**
 * Database Seeding Script for Regulatory Documents
 *
 * This script populates the database with Australian regulatory documents
 * including:
 * - National Construction Code (NCC)
 * - State-specific building codes (QLD, NSW, VIC)
 * - Electrical standards (AS/NZS 3000)
 * - Consumer protection laws
 * - Insurance regulations
 *
 * Usage:
 *   npx ts-node scripts/seed-regulatory-documents.ts
 *
 * Or in production:
 *   npx prisma db seed
 */

import { PrismaClient, RegulatoryDocumentType } from '@prisma/client'

const prisma = new PrismaClient()

interface DocumentData {
  documentType: RegulatoryDocumentType
  category: string
  jurisdiction: string | null
  title: string
  documentCode: string | null
  version: string
  effectiveDate: Date
  expiryDate: Date | null
  googleDriveFileId: string | null
  publisher: string
  sourceUrl: string | null
  sections: Array<{
    sectionNumber: string
    sectionTitle: string
    content: string
    summary?: string
    topics?: string[]
    keywords?: string[]
    applicableToWaterCategory?: string[]
    applicableToWaterClass?: string[]
  }>
  citations: Array<{
    fullReference: string
    shortReference: string
    citationText: string
    contextKeywords?: string[]
  }>
}

const regulatoryDocuments: DocumentData[] = [
  {
    documentType: RegulatoryDocumentType.BUILDING_CODE_NATIONAL,
    category: 'Building',
    jurisdiction: 'AU',
    title: 'National Construction Code 2025',
    documentCode: 'NCC 2025',
    version: '2025.1',
    effectiveDate: new Date('2025-05-01'),
    expiryDate: null,
    googleDriveFileId: null, // To be populated when document uploaded
    publisher: 'Australian Building Codes Board (ABCB)',
    sourceUrl: 'https://ncc.abcb.gov.au/',
    sections: [
      {
        sectionNumber: '3.1.4',
        sectionTitle: 'Fire Resistance of Building Elements',
        content: `Buildings must be designed and constructed in such a way that the building elements are provided with appropriate fire resistance, having regard to the circumstances of the building.

Fire resistance levels are determined based on the building classification, height and use. The fire resistance requirements must be met through either:
1. Compliance with deemed-to-satisfy provisions
2. Performance solution demonstrating equivalent safety

Fire-resistant materials and construction methods must be selected to prevent the spread of fire and ensure structural stability.`,
        summary: 'Requirements for fire resistance of building elements based on building classification',
        topics: ['fire-safety', 'building-elements'],
        keywords: ['fire-resistance', 'fire-rating', 'structural-fire-safety'],
        applicableToWaterCategory: [],
        applicableToWaterClass: [],
      },
      {
        sectionNumber: '3.2.1',
        sectionTitle: 'Moisture Management - Drainage',
        content: `Buildings must be designed and constructed in such a way that moisture is managed to prevent moisture from:
1. Entering the building from the ground, or
2. Entering the building from outside, or
3. Being generated inside the building

This section requires proper:
- Ground drainage systems
- Roof and external wall drainage
- Ventilation to control internal moisture
- Materials selection to manage moisture`,
        summary: 'Building must have adequate moisture management to prevent water ingress',
        topics: ['moisture-management', 'drainage', 'water-management'],
        keywords: ['moisture', 'drainage', 'damp-proofing', 'ventilation'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'National Construction Code 2025 Volume 1 Section 3.2.1',
        shortReference: 'NCC 2025 Sec 3.2.1',
        citationText: 'Buildings must be designed and constructed in such a way that moisture is managed to prevent moisture from entering the building from the ground or outside',
        contextKeywords: ['moisture', 'drainage', 'water-damage'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.BUILDING_CODE_STATE,
    category: 'Building',
    jurisdiction: 'QLD',
    title: 'Queensland Development Code 4.5 - Plumbing and Drainage',
    documentCode: 'QDC 4.5',
    version: '2026.1',
    effectiveDate: new Date('2026-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Department of Local Government, Building and Planning (Queensland)',
    sourceUrl: 'https://www.business.qld.gov.au/',
    sections: [
      {
        sectionNumber: '3.1',
        sectionTitle: 'Moisture Control and Damp Proofing',
        content: `Buildings in Queensland must incorporate effective moisture control and damp proofing measures given the subtropical climate.

Buildings must be designed to:
1. Prevent moisture rising from the ground (rising damp)
2. Prevent moisture entering from the roof or walls (penetrating damp)
3. Include adequate ventilation to manage internal moisture
4. Use appropriate materials that resist moisture in Queensland's humid environment

The Queensland humidity levels (average >70%) require particular attention to ventilation and material selection to prevent mould growth and structural damage.`,
        summary: 'Queensland-specific moisture control requirements for subtropical climate',
        topics: ['moisture-control', 'damp-proofing', 'ventilation'],
        keywords: ['moisture-threshold', 'humidity', 'mould-prevention'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '3.2',
        sectionTitle: 'Drying Time Standards (Queensland)',
        content: `In Queensland, materials must dry to specific standards:
- Standard materials (drywall, carpet): 5-14 days at 50% RH
- Dense materials (concrete, timber): 14-30 days at 50% RH
- Class 4 materials (deep saturation): 30+ days depending on material

Queensland's humidity levels typically require:
- Extended drying times compared to southern states
- Active dehumidification (recommended RH 30-50%)
- Continuous air circulation (air movers at 6-8 air changes per hour)`,
        summary: 'Queensland moisture content standards for building materials',
        topics: ['drying-standards', 'moisture-content'],
        keywords: ['drying-time', 'moisture-content', 'relative-humidity'],
        applicableToWaterCategory: [],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'Queensland Development Code 4.5 Section 3.2 - Drying Standards',
        shortReference: 'QDC 4.5 Sec 3.2',
        citationText: 'Standard materials in Queensland must dry to 50% relative humidity within 5-14 days; dense materials may require 14-30 days or more depending on saturation level',
        contextKeywords: ['drying-time', 'relative-humidity', 'water-damage'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.ELECTRICAL_STANDARD,
    category: 'Electrical',
    jurisdiction: 'AU',
    title: 'AS/NZS 3000:2023 - Electrical installations (Wiring Rules)',
    documentCode: 'AS/NZS 3000:2023',
    version: '2023.1',
    effectiveDate: new Date('2023-06-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Standards Australia & Standards New Zealand',
    sourceUrl: 'https://store.standards.org.au/product/as-nzs-3000-2018',
    sections: [
      {
        sectionNumber: '2.4',
        sectionTitle: 'Safety - Electrical Safety After Water Damage',
        content: `After water damage, electrical installations must comply with safety requirements:

1. All wet electrical equipment must be isolated from supply before handling
2. Damaged electrical equipment must be:
   - Removed from service immediately
   - Not re-energized until inspected and certified safe
   - Replaced or repaired by competent licensed electrician

3. After drying, electrical systems must be:
   - Visually inspected for damage, corrosion, or contamination
   - Tested for insulation resistance before re-energization
   - Certified by licensed electrician as safe for use

Safety critical: Do not attempt to dry electrical equipment in place - it must be isolated and professionally tested.`,
        summary: 'Safety requirements for electrical installations after water damage',
        topics: ['electrical-safety', 'water-damage', 'isolation'],
        keywords: ['electrical-isolation', 'insulation-resistance', 'licensed-electrician'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '5.1',
        sectionTitle: 'Electrical Installation - Water Damage Recovery',
        content: `Electrical installations damaged by water must be recovered according to:

1. All moisture-damaged electrical equipment must be replaced, not dried in place
2. Temporary electrical systems for restoration work must comply with AS/NZS 3000
3. After remediation, all electrical systems must be retested and certified

Post-water damage requirements:
- Replace all wet electrical wiring and equipment
- Test insulation resistance of all circuits
- Inspect and replace surge protection devices
- Re-certify installation with electrical safety switch testing
- Provide Installation Completion Certificate`,
        summary: 'Electrical installation requirements for water damage recovery',
        topics: ['electrical-recovery', 'safety-compliance'],
        keywords: ['equipment-replacement', 'insulation-testing', 'certification'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'AS/NZS 3000:2023 Section 2.4 - Electrical Safety',
        shortReference: 'AS/NZS 3000 Sec 2.4',
        citationText: 'Wet electrical equipment must be isolated from supply and not re-energized until inspected and certified safe by licensed electrician',
        contextKeywords: ['electrical-safety', 'water-damage', 'licensing'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.CONSUMER_LAW,
    category: 'Consumer Protection',
    jurisdiction: 'AU',
    title: 'Australian Consumer Law (Schedule 2 of Competition and Consumer Act 2010)',
    documentCode: 'ACL',
    version: '2024.1',
    effectiveDate: new Date('2010-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Australian Competition and Consumer Commission (ACCC)',
    sourceUrl: 'https://www.legislation.gov.au/',
    sections: [
      {
        sectionNumber: 'Division 1, Section 139A',
        sectionTitle: 'Guarantees in connection with Supply of Goods',
        content: `The supplier of goods must ensure:

1. Goods are of acceptable quality - meaning goods:
   - Are as safe, durable and free from defects as a reasonable consumer would regard as acceptable having regard to the nature of the goods, price paid, and representations made about them

2. For water-damaged goods or repairs following water damage:
   - All restoration work must be performed with due care and skill
   - Materials used must be of a kind and quality that a consumer would regard as acceptable
   - Work must be completed within a reasonable time

3. Consumer rights to remedy:
   - Right to reject goods or services that don't meet guarantees
   - Right to have goods re-supplied or money refunded
   - Right to compensation for loss or damage`,
        summary: 'Consumer guarantees for acceptable quality of goods and services',
        topics: ['consumer-guarantees', 'acceptable-quality'],
        keywords: ['consumer-rights', 'defective-goods', 'remedy'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: 'Division 2, Section 139B',
        sectionTitle: 'Guarantees relating to Services',
        content: `Services must be supplied with due care and skill, and be fit for the purpose.

For water damage restoration services:
1. Services must be performed with due care and skill
2. Services must be completed within a reasonable time
3. Materials supplied must be of acceptable quality
4. Consumer has right to have services re-performed or money refunded

Suppliers must:
- Provide transparent pricing and scope of works
- Document all work performed
- Provide warranties on work completed
- Honor guarantees for period specified (minimum 12 months)`,
        summary: 'Consumer guarantees for quality of services',
        topics: ['service-quality', 'consumer-protection'],
        keywords: ['due-care', 'workmanship', 'warranty'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'Australian Consumer Law Section 139A - Guarantees in connection with Supply of Goods',
        shortReference: 'ACL Sec 139A',
        citationText: 'Goods and services must be of acceptable quality and fit for purpose; consumers have right to remedy including rejection, re-supply, refund, or compensation',
        contextKeywords: ['consumer-protection', 'acceptable-quality', 'consumer-rights'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.INSURANCE_REGULATION,
    category: 'Insurance',
    jurisdiction: 'AU',
    title: 'General Insurance Code of Practice 2024',
    documentCode: 'ICA-Code',
    version: '2024.1',
    effectiveDate: new Date('2024-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Insurance Council of Australia',
    sourceUrl: 'https://insurancecode.org.au/',
    sections: [
      {
        sectionNumber: '2.1',
        sectionTitle: 'Duty to Manage a Claim Fairly',
        content: `Insurers must:

1. Acknowledge claims promptly (within 1 business day of receiving notice)
2. Advise claims handling timeframe within 7 days
3. Provide fair claim assessment within reasonable timeframe (typically 30 days)
4. Request information only if reasonably necessary
5. Assess claims fairly and consistently

For water damage claims:
- Insurer must arrange prompt inspection
- Claim assessment must consider all evidence provided
- Insurer must explain decision if claim rejected
- Insurer must provide written explanation and right of review`,
        summary: 'Insurer obligations for fair claim management',
        topics: ['claims-management', 'insurer-obligations'],
        keywords: ['claim-notification', 'fair-assessment', 'timeframe'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: [],
      },
      {
        sectionNumber: '3.1',
        sectionTitle: 'Duty to Provide Accurate Information',
        content: `Insurers must:

1. Provide clear information about:
   - What is covered by the policy
   - What is excluded
   - Definition of key terms (e.g., "sudden accidental loss")
   - Claims procedures
   - Dispute resolution process

2. In water damage policies specifically:
   - Clarify whether gradual seepage is covered or excluded
   - Clarify whether flood is covered or requires separate policy
   - Define "reasonable care" requirements for maintenance
   - Specify temporary accommodation coverage during remediation
   - Define "reinstatement" vs "indemnity" basis`,
        summary: 'Insurer must provide clear information about policy coverage',
        topics: ['transparency', 'policy-information'],
        keywords: ['policy-terms', 'coverage-clarity', 'exclusions'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: [],
      },
    ],
    citations: [
      {
        fullReference: 'General Insurance Code of Practice 2024 Section 2.1 - Fair Claim Management',
        shortReference: 'ICA Code Sec 2.1',
        citationText: 'Insurers must acknowledge claims promptly and assess them fairly within a reasonable timeframe, typically 30 days, with clear communication',
        contextKeywords: ['insurance-obligations', 'claims-process', 'consumer-protection'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.SAFETY_REGULATION,
    category: 'Health & Safety',
    jurisdiction: 'AU',
    title: 'Work Health and Safety Act 2011 - Restoration Work Requirements',
    documentCode: 'WHS-Act',
    version: '2024.1',
    effectiveDate: new Date('2011-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Safe Work Australia / State WHS Regulators',
    sourceUrl: 'https://www.safeworkaustralia.gov.au/',
    sections: [
      {
        sectionNumber: '36',
        sectionTitle: 'PCBU Duty to Ensure Health and Safety',
        content: `A Person Conducting a Business or Undertaking (PCBU) must:

1. Ensure health and safety of workers and others
2. Identify hazards and control risks
3. Provide and maintain safe systems of work
4. Provide information, training and supervision

For water damage restoration work:
- Identify biological hazards (mould, bacteria, contamination)
- Identify physical hazards (electrical, structural damage)
- Implement control measures (containment, PPE, ventilation)
- Conduct health monitoring if Category 3 water exposure
- Provide training on biological hazard handling`,
        summary: 'Primary duty for health and safety in restoration work',
        topics: ['hazard-identification', 'hazard-control'],
        keywords: ['pcbu-duty', 'risk-management', 'worker-safety'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: [],
      },
      {
        sectionNumber: 'Chapters 5-7',
        sectionTitle: 'Hazard Control - Biological Hazards in Water Damage',
        content: `Work must eliminate biological hazards or reduce risks through:

1. Hierarchy of Control:
   - Eliminate: Remove contaminated materials immediately
   - Substitute: Replace with non-contaminated materials
   - Engineer: Install containment systems, HEPA filtration
   - Administrative: Work procedures, health monitoring
   - PPE: Respiratory protection, protective clothing

2. Specific hazards in water damage:
   - Mould (Aspergillus, Stachybotrys, Penicillium)
   - Bacteria (E. coli, Legionella in stagnant water)
   - Viruses from sewage contamination
   - Chemical hazards (pesticides, cleaning products)

3. Control measures required:
   - Containment to prevent spore/pathogen dispersal
   - HEPA air filtration during remediation
   - Full-body PPE and respiratory protection
   - Controlled waste disposal
   - Medical surveillance for high-risk workers`,
        summary: 'Hazard control requirements for biological agents in water damage',
        topics: ['biological-hazards', 'hazard-control'],
        keywords: ['mould', 'bacteria', 'ppe', 'medical-surveillance'],
        applicableToWaterCategory: ['Category 2', 'Category 3'],
        applicableToWaterClass: [],
      },
    ],
    citations: [
      {
        fullReference: 'Work Health and Safety Act 2011 Section 36 - PCBU Duty',
        shortReference: 'WHS Act Sec 36',
        citationText: 'Person conducting business must ensure health and safety of workers by identifying hazards, implementing control measures, and providing training and supervision',
        contextKeywords: ['worker-safety', 'hazard-control', 'regulatory-compliance'],
      },
    ],
  },

  // STATE-SPECIFIC BUILDING CODES

  {
    documentType: RegulatoryDocumentType.BUILDING_CODE_STATE,
    category: 'Building',
    jurisdiction: 'NSW',
    title: 'NSW Building Code Section 3 - Fire Resistance and Moisture Management',
    documentCode: 'NSW-BC-3',
    version: '2024.1',
    effectiveDate: new Date('2024-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'NSW Department of Planning, Industry and Environment',
    sourceUrl: 'https://www.planning.nsw.gov.au/',
    sections: [
      {
        sectionNumber: '3.2',
        sectionTitle: 'Moisture Management - NSW Requirements',
        content: `NSW buildings must incorporate moisture management specific to coastal and inland climates:

1. Coastal properties (up to 50km from coast):
   - Enhanced damp-proofing due to salt spray and humidity
   - Ventilation adequate for coastal humidity levels
   - Materials must resist salt corrosion

2. Inland properties:
   - Standard damp-proofing requirements
   - Ventilation adequate for inland climate
   - Materials appropriate to local conditions

3. All properties must include:
   - Ground drainage (150mm minimum below DPC)
   - Roof drainage to gutters and downpipes
   - Wall cavity drainage where applicable
   - Adequate ventilation (minimum 1/150 floor area opening)`,
        summary: 'NSW-specific moisture management for coastal and inland climates',
        topics: ['moisture-management', 'damp-proofing'],
        keywords: ['coastal-properties', 'salt-corrosion', 'ventilation'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '3.3',
        sectionTitle: 'Drying Time Standards (NSW)',
        content: `In NSW, materials must dry to specific standards:
- Standard materials: 7-14 days at 50% RH
- Dense materials: 14-28 days depending on thickness
- NSW humidity typically 40-70% (lower than Queensland)
- Active drying: Dehumidification to 30-50% RH recommended
- Air circulation: 6-8 air changes per hour`,
        summary: 'NSW moisture content standards for building materials',
        topics: ['drying-standards', 'moisture-content'],
        keywords: ['drying-time', 'humidity', 'air-circulation'],
        applicableToWaterCategory: [],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'NSW Building Code Section 3.2 - Moisture Management',
        shortReference: 'NSW-BC Sec 3.2',
        citationText: 'NSW buildings must include ground drainage, roof drainage, and adequate ventilation; coastal properties require enhanced damp-proofing',
        contextKeywords: ['moisture-management', 'damp-proofing', 'ventilation'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.BUILDING_CODE_STATE,
    category: 'Building',
    jurisdiction: 'VIC',
    title: 'Victoria Building Regulations Section 3 - Moisture and Durability',
    documentCode: 'VIC-BR-3',
    version: '2024.1',
    effectiveDate: new Date('2024-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Victorian Building Authority',
    sourceUrl: 'https://www.vba.vic.gov.au/',
    sections: [
      {
        sectionNumber: '3.2',
        sectionTitle: 'Moisture and Durability - Victoria Standards',
        content: `Victoria Building Regulations require:

1. Damp-proofing requirements:
   - Damp-proof course (DPC) to prevent rising moisture
   - DPC must be continuous (no bridges for moisture)
   - Minimum 150mm above ground level

2. Ventilation standards:
   - Minimum 1/150 of floor area for natural ventilation
   - Mechanical ventilation where natural inadequate
   - Continuous ventilation in wet areas (bathrooms, kitchens)

3. Water penetration prevention:
   - Proper roof design with adequate fall
   - Gutters and downpipes sized for local rainfall (75mm/hour)
   - Flashing at all vulnerable intersections
   - External walls protected from weather`,
        summary: 'Victoria moisture and durability standards',
        topics: ['moisture-management', 'damp-proofing'],
        keywords: ['damp-proof-course', 'ventilation', 'water-penetration'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '3.3',
        sectionTitle: 'Drying Standards (Victoria)',
        content: `Victoria materials drying standards:
- Standard materials: 10-18 days at 50% RH
- Dense materials: 18-35 days depending on type
- Victoria humidity: 35-65% (temperate climate)
- Dehumidification recommended to 30-50% RH
- Extended drying time in winter months`,
        summary: 'Victoria drying time requirements for building materials',
        topics: ['drying-standards', 'materials'],
        keywords: ['drying-time', 'relative-humidity', 'temperate-climate'],
        applicableToWaterCategory: [],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'Victoria Building Regulations Section 3.2 - Moisture and Durability',
        shortReference: 'VIC-BR Sec 3.2',
        citationText: 'Buildings must include damp-proof course minimum 150mm above ground, adequate ventilation, and protection from water penetration',
        contextKeywords: ['moisture-protection', 'damp-proofing', 'water-penetration'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.BUILDING_CODE_STATE,
    category: 'Building',
    jurisdiction: 'SA',
    title: 'South Australia Building Code - Moisture and Durability',
    documentCode: 'SA-BC-3',
    version: '2024.1',
    effectiveDate: new Date('2024-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'South Australian Housing Authority',
    sourceUrl: 'https://www.sa.gov.au/',
    sections: [
      {
        sectionNumber: '3.1',
        sectionTitle: 'Moisture Management - SA Climate Considerations',
        content: `South Australia building standards for arid/semi-arid climate:

1. Hot, dry climate considerations:
   - Condensation control in cooler months (May-September)
   - Heat and sun exposure management
   - Rapid moisture evaporation in summer

2. Damp-proofing:
   - DPC minimum 150mm above ground
   - Additional protection in flood-prone areas
   - Cavity drainage for multi-leaf construction

3. Ventilation:
   - Minimum 1/140 of floor area for natural ventilation
   - Mechanical ventilation for wet areas
   - Summer ventilation for heat management`,
        summary: 'SA moisture management for hot, dry climate',
        topics: ['moisture-management', 'climate-specific'],
        keywords: ['arid-climate', 'condensation-control', 'ventilation'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '3.2',
        sectionTitle: 'Drying Standards (South Australia)',
        content: `SA drying time standards (benefit from arid climate):
- Standard materials: 5-10 days at 50% RH
- Dense materials: 10-20 days
- SA humidity: 25-50% (dry climate advantage)
- Passive drying often sufficient
- Active dehumidification for accelerated drying`,
        summary: 'South Australia drying time standards',
        topics: ['drying-standards', 'climate'],
        keywords: ['fast-drying', 'low-humidity', 'arid-climate'],
        applicableToWaterCategory: [],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'South Australia Building Code - Moisture Management',
        shortReference: 'SA-BC - Moisture',
        citationText: 'SA buildings require DPC 150mm above ground and moisture management appropriate to hot, dry climate with condensation control',
        contextKeywords: ['moisture-management', 'arid-climate', 'drying'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.BUILDING_CODE_STATE,
    category: 'Building',
    jurisdiction: 'WA',
    title: 'Western Australia Building Code - Moisture and Durability',
    documentCode: 'WA-BC-3',
    version: '2024.1',
    effectiveDate: new Date('2024-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Department of Building and Planning, Western Australia',
    sourceUrl: 'https://dbca.wa.gov.au/',
    sections: [
      {
        sectionNumber: '3.1',
        sectionTitle: 'Moisture Management - WA Climate',
        content: `Western Australia building standards for diverse climates:

1. Northern WA (tropical):
   - High rainfall (up to 1500mm annually)
   - High humidity (70-85%)
   - Cyclone risk considerations

2. Southern WA (temperate to Mediterranean):
   - Moderate rainfall (up to 1000mm)
   - Lower humidity (40-65%)
   - Bushfire risk considerations

3. Damp-proofing requirements:
   - DPC minimum 150mm above ground
   - Enhanced in high-rainfall areas
   - Basement/below-ground protection where applicable

4. Ventilation:
   - Minimum 1/150 of floor area
   - Extended in tropical areas
   - Mechanical ventilation for wet areas`,
        summary: 'WA moisture management for diverse regional climates',
        topics: ['moisture-management', 'regional-variation'],
        keywords: ['tropical', 'temperate', 'cyclone-risk', 'ventilation'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '3.2',
        sectionTitle: 'Drying Standards (Western Australia)',
        content: `WA drying time standards (regional variation):
- Northern WA: 14-28 days (high humidity)
- Southern WA: 7-18 days (lower humidity)
- Dense materials: 20-35 days depending on climate zone
- Mechanical drying recommended for northern regions`,
        summary: 'WA drying standards for regional climate variation',
        topics: ['drying-standards', 'regional-variation'],
        keywords: ['tropical-drying', 'temperate-drying', 'climate-zone'],
        applicableToWaterCategory: [],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'Western Australia Building Code - Moisture Management',
        shortReference: 'WA-BC - Moisture',
        citationText: 'WA buildings require moisture management appropriate to regional climate with higher drying times in high-humidity tropical areas',
        contextKeywords: ['moisture-management', 'tropical', 'climate-zones'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.BUILDING_CODE_STATE,
    category: 'Building',
    jurisdiction: 'TAS',
    title: 'Tasmania Building Code - Moisture and Durability',
    documentCode: 'TAS-BC-3',
    version: '2024.1',
    effectiveDate: new Date('2024-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Tasmanian Building Authority',
    sourceUrl: 'https://www.ta.org.au/',
    sections: [
      {
        sectionNumber: '3.1',
        sectionTitle: 'Moisture Management - Tasmania Temperate Climate',
        content: `Tasmania building standards for cool temperate climate:

1. Climate considerations:
   - Cool, wet climate (rainfall 500-2000mm)
   - Condensation risk in cooler months (May-September)
   - Lower evaporation rates

2. Damp-proofing:
   - DPC minimum 150mm above ground
   - Extra protection due to high rainfall
   - Cavity drainage essential
   - Below-ground moisture protection

3. Ventilation:
   - Minimum 1/140 of floor area for natural ventilation
   - Mechanical ventilation strongly recommended
   - Continuous ventilation to prevent condensation
   - Summer ventilation for humidity control`,
        summary: 'Tasmania moisture management for cool, wet climate',
        topics: ['moisture-management', 'condensation-control'],
        keywords: ['cool-climate', 'high-rainfall', 'ventilation'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '3.2',
        sectionTitle: 'Drying Standards (Tasmania)',
        content: `Tasmania drying standards (cool, wet climate):
- Standard materials: 14-21 days at 50% RH
- Dense materials: 21-40+ days due to climate
- Tasmania humidity: 50-75% (persistently higher)
- Mechanical dehumidification essential
- Extended drying time in winter months
- Heat source recommended for accelerated drying`,
        summary: 'Tasmania drying time standards for cool climate',
        topics: ['drying-standards', 'extended-drying'],
        keywords: ['cool-climate', 'high-humidity', 'extended-drying'],
        applicableToWaterCategory: [],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'Tasmania Building Code - Moisture Management',
        shortReference: 'TAS-BC - Moisture',
        citationText: 'Tasmanian buildings require enhanced damp-proofing and ventilation due to cool, wet climate with high condensation risk',
        contextKeywords: ['moisture-management', 'cool-climate', 'condensation'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.BUILDING_CODE_STATE,
    category: 'Building',
    jurisdiction: 'ACT',
    title: 'ACT Building Code - Moisture and Durability',
    documentCode: 'ACT-BC-3',
    version: '2024.1',
    effectiveDate: new Date('2024-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'ACT Building and Construction Commission',
    sourceUrl: 'https://www.act.gov.au/',
    sections: [
      {
        sectionNumber: '3.1',
        sectionTitle: 'Moisture Management - ACT Temperate Climate',
        content: `ACT building standards for temperate inland climate:

1. Climate characteristics:
   - Moderate rainfall (600-700mm annually)
   - Four distinct seasons
   - Cold winters, hot summers
   - Lower humidity than coastal areas

2. Damp-proofing requirements:
   - DPC minimum 150mm above ground
   - Basement waterproofing where applicable
   - Cavity drainage for multi-leaf walls

3. Ventilation:
   - Minimum 1/150 of floor area
   - Seasonal ventilation management
   - Mechanical ventilation in wet areas
   - Summer cross-ventilation important`,
        summary: 'ACT moisture management for temperate climate',
        topics: ['moisture-management', 'damp-proofing'],
        keywords: ['temperate-climate', 'seasonal-variation', 'ventilation'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '3.2',
        sectionTitle: 'Drying Standards (ACT)',
        content: `ACT drying time standards (temperate inland):
- Standard materials: 8-15 days at 50% RH
- Dense materials: 15-28 days
- ACT humidity: 30-60% (lower than coastal)
- Seasonal variation: faster in summer, slower in winter
- Passive drying often adequate in dry season
- Dehumidification helpful in cooler months`,
        summary: 'ACT drying standards for temperate climate',
        topics: ['drying-standards', 'seasonal-variation'],
        keywords: ['temperate-climate', 'inland', 'drying-time'],
        applicableToWaterCategory: [],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'ACT Building Code - Moisture Management',
        shortReference: 'ACT-BC - Moisture',
        citationText: 'ACT buildings require DPC 150mm above ground and moisture management appropriate to temperate inland climate',
        contextKeywords: ['moisture-management', 'temperate-climate', 'inland'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.BUILDING_CODE_STATE,
    category: 'Building',
    jurisdiction: 'NT',
    title: 'Northern Territory Building Code - Moisture and Tropical Climate',
    documentCode: 'NT-BC-3',
    version: '2024.1',
    effectiveDate: new Date('2024-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'NT Department of Infrastructure, Planning and Logistics',
    sourceUrl: 'https://www.nt.gov.au/',
    sections: [
      {
        sectionNumber: '3.1',
        sectionTitle: 'Moisture Management - NT Tropical and Arid Climates',
        content: `NT building standards for diverse climates (tropical to arid):

1. Tropical NT (Darwin, Katherine region):
   - High rainfall (1200-1600mm annually in wet season)
   - Cyclone risk considerations
   - High humidity year-round (70-85%)
   - Seasonal cyclone wind-driven rain

2. Arid/Semi-arid NT (Alice Springs, Tennant Creek):
   - Low rainfall (200-400mm)
   - Extreme heat (50°C+ possible)
   - Low humidity (20-40%)
   - Rapid evaporation

3. Damp-proofing:
   - Tropical areas: Enhanced protection, cyclone-resistant
   - Arid areas: Standard DPC 150mm above ground
   - All areas: Cavity drainage and moisture barriers

4. Ventilation:
   - Tropical: Continuous ventilation, shading important
   - Arid: Natural ventilation adequate
   - Cyclone-resistant ventilation in tropical areas`,
        summary: 'NT moisture management for tropical and arid climates',
        topics: ['moisture-management', 'tropical-climate'],
        keywords: ['cyclone-resistant', 'tropical', 'arid', 'high-humidity'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '3.2',
        sectionTitle: 'Drying Standards (Northern Territory)',
        content: `NT drying standards (highly regional):

Tropical NT:
- Standard materials: 18-30 days at 50% RH
- Dense materials: 30-45+ days
- Humidity: 70-85% (very high)
- Mechanical dehumidification essential
- Extended drying in wet season

Arid NT:
- Standard materials: 3-8 days at 50% RH
- Dense materials: 8-15 days
- Humidity: 20-40% (very low)
- Passive drying very effective
- Fastest drying times in Australia`,
        summary: 'NT drying standards for tropical and arid regions',
        topics: ['drying-standards', 'regional-variation'],
        keywords: ['tropical-drying', 'arid-drying', 'regional-differences'],
        applicableToWaterCategory: [],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
    ],
    citations: [
      {
        fullReference: 'NT Building Code - Moisture Management',
        shortReference: 'NT-BC - Moisture',
        citationText: 'NT buildings must consider regional climate: tropical areas require enhanced protection and longer drying times; arid areas benefit from rapid evaporation',
        contextKeywords: ['tropical-climate', 'arid-climate', 'regional-variation'],
      },
    ],
  },

  // ADDITIONAL TECHNICAL STANDARDS

  {
    documentType: RegulatoryDocumentType.PLUMBING_STANDARD,
    category: 'Plumbing',
    jurisdiction: 'AU',
    title: 'AS/NZS 3500 - Plumbing and Drainage Standards',
    documentCode: 'AS/NZS 3500',
    version: '2023.1',
    effectiveDate: new Date('2023-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Standards Australia & Standards New Zealand',
    sourceUrl: 'https://store.standards.org.au/',
    sections: [
      {
        sectionNumber: '1.1',
        sectionTitle: 'Drainage System Design for Water Damage Prevention',
        content: `AS/NZS 3500 requires drainage systems to:

1. Discharge water rapidly to prevent ponding
2. Prevent water backing up into buildings
3. Use materials resistant to water and soil conditions
4. Include proper grading and slopes (minimum 1:100)

For water-damaged buildings:
- All damaged drainage must be replaced or renewed
- Connections must be watertight (tested at 100mm water head)
- Drainage capacity must be adequate for peak flows
- Proper ventilation of drains (anti-siphon protection)`,
        summary: 'Drainage system design requirements',
        topics: ['drainage-systems', 'water-management'],
        keywords: ['drainage-design', 'water-discharge', 'system-maintenance'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '2.2',
        sectionTitle: 'Water Supply Safety After Damage',
        content: `Water supply systems must be:
- Tested and flushed after water damage or contamination
- Disinfected if contaminated with category 2 or 3 water
- All fixtures replaced if sewage contamination present
- Pressure tested at 1.5x working pressure
- Documented as compliant before use`,
        summary: 'Water supply safety requirements after damage',
        topics: ['water-safety', 'testing-requirements'],
        keywords: ['disinfection', 'pressure-testing', 'contamination'],
        applicableToWaterCategory: ['Category 2', 'Category 3'],
        applicableToWaterClass: [],
      },
    ],
    citations: [
      {
        fullReference: 'AS/NZS 3500 - Plumbing and Drainage',
        shortReference: 'AS/NZS 3500',
        citationText: 'Drainage systems must discharge water rapidly and prevent backup; water supply systems must be tested and disinfected after contamination',
        contextKeywords: ['plumbing', 'drainage', 'water-safety'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.INDUSTRY_BEST_PRACTICE,
    category: 'HVAC & Ventilation',
    jurisdiction: 'AU',
    title: 'AS 1668 - Ventilation and Air Conditioning in Buildings',
    documentCode: 'AS 1668',
    version: '2023.1',
    effectiveDate: new Date('2023-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Standards Australia',
    sourceUrl: 'https://store.standards.org.au/',
    sections: [
      {
        sectionNumber: '1.2',
        sectionTitle: 'Air Change Rates for Water Damage Remediation',
        content: `AS 1668 specifies air change rates for damaged buildings:

1. Standard remediation areas:
   - 6-8 air changes per hour (ACH) for drying
   - 4-6 ACH for normal occupied space drying

2. High-contamination areas (Category 3 water):
   - 10-12 ACH required for biological hazard removal
   - HEPA filtration essential
   - Negative pressure to prevent spore dispersal

3. Equipment sizing:
   - Air movers and dehumidifiers sized for cubic volume
   - Continuous operation during drying phase
   - Air distribution patterns to prevent dead zones`,
        summary: 'Air change rates for water damage drying',
        topics: ['ventilation', 'air-circulation'],
        keywords: ['air-changes', 'hepa-filtration', 'equipment-sizing'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: ['Class 1', 'Class 2', 'Class 3', 'Class 4'],
      },
      {
        sectionNumber: '2.1',
        sectionTitle: 'Humidity Control in Remediated Buildings',
        content: `Ventilation must achieve target humidity levels:
- Target: 30-50% relative humidity during active drying
- Dehumidification essential in humid climates
- Continuous operation until target RH achieved
- Monitoring with calibrated hygrometers required
- Document humidity readings for compliance`,
        summary: 'Humidity control requirements for drying',
        topics: ['humidity-control', 'dehumidification'],
        keywords: ['relative-humidity', 'target-rh', 'monitoring'],
        applicableToWaterCategory: ['Category 1', 'Category 2', 'Category 3'],
        applicableToWaterClass: [],
      },
    ],
    citations: [
      {
        fullReference: 'AS 1668 - Ventilation and Air Conditioning',
        shortReference: 'AS 1668',
        citationText: 'Water damage drying requires 6-8 air changes per hour, 10-12 ACH for contaminated areas, with target relative humidity 30-50%',
        contextKeywords: ['ventilation', 'air-circulation', 'humidity-control'],
      },
    ],
  },

  {
    documentType: RegulatoryDocumentType.INDUSTRY_BEST_PRACTICE,
    category: 'Air Systems',
    jurisdiction: 'AU',
    title: 'AS/NZS 3666 - Air-handling Systems and Filters',
    documentCode: 'AS/NZS 3666',
    version: '2022.1',
    effectiveDate: new Date('2022-01-01'),
    expiryDate: null,
    googleDriveFileId: null,
    publisher: 'Standards Australia & Standards New Zealand',
    sourceUrl: 'https://store.standards.org.au/',
    sections: [
      {
        sectionNumber: '1.1',
        sectionTitle: 'HEPA Filtration for Mould-Contaminated Air',
        content: `Air handling systems must protect against mould spore dispersal:

1. HEPA filter requirements:
   - Minimum HEPA H13 rating (99.95% @ 0.3 micron)
   - H14 preferred for high contamination
   - Proper sealing to prevent bypass

2. Pre-filtration:
   - G3 or G4 pre-filter to extend HEPA life
   - Reduces particulate load on HEPA

3. Testing and certification:
   - System tested after filter installation
   - DOP (dioctyl phthalate) test to verify integrity
   - Air flow verification

4. Maintenance:
   - HEPA replacement per manufacturer schedule
   - Proper containment during filter changes
   - Disposal as hazardous material if contaminated`,
        summary: 'HEPA filtration for mould-contaminated spaces',
        topics: ['hepa-filtration', 'air-quality'],
        keywords: ['hepa-filter', 'mould-spores', 'filtration-efficiency'],
        applicableToWaterCategory: ['Category 2', 'Category 3'],
        applicableToWaterClass: [],
      },
      {
        sectionNumber: '2.1',
        sectionTitle: 'Ductwork Contamination and Remediation',
        content: `HVAC ductwork after water damage:

1. Assessment:
   - Visual inspection for mould growth
   - Air sampling if contamination suspected
   - Identification of contaminated sections

2. Remediation options:
   - Duct cleaning with HEPA-equipped equipment
   - Component replacement if heavily contaminated
   - Duct sealing to prevent spore dispersal

3. Documentation:
   - Pre and post-remediation air sampling
   - Cleaning records and disposal documentation
   - System performance testing`,
        summary: 'HVAC ductwork contamination assessment and remediation',
        topics: ['duct-contamination', 'remediation'],
        keywords: ['mould-growth', 'duct-cleaning', 'air-sampling'],
        applicableToWaterCategory: ['Category 2', 'Category 3'],
        applicableToWaterClass: [],
      },
    ],
    citations: [
      {
        fullReference: 'AS/NZS 3666 - Air-handling and Filters',
        shortReference: 'AS/NZS 3666',
        citationText: 'HEPA H13 or H14 filtration required for mould-contaminated spaces; ductwork must be assessed, cleaned, and documented',
        contextKeywords: ['hepa-filtration', 'mould-remediation', 'air-quality'],
      },
    ],
  },
]

async function main() {
  console.log('Starting to seed regulatory documents...')

  try {
    // Clear existing data (optional - comment out if you want to preserve existing records)
    // await prisma.citation.deleteMany({})
    // await prisma.regulatorySection.deleteMany({})
    // await prisma.regulatoryDocument.deleteMany({})

    for (const doc of regulatoryDocuments) {
      console.log(`Seeding: ${doc.title}...`)

      const createdDoc = await prisma.regulatoryDocument.create({
        data: {
          documentType: doc.documentType,
          category: doc.category,
          jurisdiction: doc.jurisdiction,
          title: doc.title,
          documentCode: doc.documentCode,
          version: doc.version,
          effectiveDate: doc.effectiveDate,
          expiryDate: doc.expiryDate,
          googleDriveFileId: doc.googleDriveFileId,
          publisher: doc.publisher,
          sourceUrl: doc.sourceUrl,
          sections: {
            create: doc.sections.map((section) => ({
              sectionNumber: section.sectionNumber,
              sectionTitle: section.sectionTitle,
              content: section.content,
              summary: section.summary,
              topics: section.topics || [],
              keywords: section.keywords || [],
              applicableToWaterCategory: section.applicableToWaterCategory || [],
              applicableToWaterClass: section.applicableToWaterClass || [],
            })),
          },
          citations: {
            create: doc.citations.map((citation) => ({
              fullReference: citation.fullReference,
              shortReference: citation.shortReference,
              citationText: citation.citationText,
              contextKeywords: citation.contextKeywords || [],
            })),
          },
        },
        include: {
          sections: true,
          citations: true,
        },
      })

      console.log(
        `✓ Created ${doc.title} with ${createdDoc.sections.length} sections and ${createdDoc.citations.length} citations`
      )
    }

    console.log('\n✓ Successfully seeded all regulatory documents!')
    console.log(`\nTotal documents created: ${regulatoryDocuments.length}`)

    // Print summary
    const stats = await prisma.regulatoryDocument.aggregate({
      _count: true,
    })
    const sectionStats = await prisma.regulatorySection.aggregate({
      _count: true,
    })
    const citationStats = await prisma.citation.aggregate({
      _count: true,
    })

    console.log(`\nDatabase Summary:`)
    console.log(`- RegulatoryDocuments: ${stats._count}`)
    console.log(`- RegulatorySection: ${sectionStats._count}`)
    console.log(`- Citations: ${citationStats._count}`)
  } catch (error) {
    console.error('Error seeding database:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
