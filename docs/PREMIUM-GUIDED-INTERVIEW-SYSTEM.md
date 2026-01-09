# Premium Guided Interview System - Design Document

## Executive Summary

Transform the inspection form into an **intelligent guided interview** that leverages existing regulatory/standards data to ask qualifying questions, auto-populate form fields, and ensure comprehensive data capture. This becomes a **premium tier feature** with higher pricing.

**Key Innovation**: Instead of technician manually filling ~60 fields, the system asks 15-20 intelligent qualifying questions that intelligently populate 50+ form fields with standards-backed accuracy.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│         Guided Interview System (Premium)            │
│  Leverage existing IICRC + Regulatory Standards     │
└────────────────┬────────────────────────────────────┘
                 │
         ┌───────┴────────┬───────────────┬─────────────┐
         │                │               │             │
    ┌────▼────┐   ┌──────▼──────┐  ┌────▼───┐  ┌─────▼─────┐
    │Question │   │Interview    │  │Answer  │  │Equipment  │
    │Generator│   │Engine       │  │-to-   │  │Matcher    │
    │Engine   │   │             │  │Field  │  │           │
    │         │   │•Progressive │  │Mapper │  │•Optimal   │
    │•IICRC  │   │  flow       │  │       │  │  equipment│
    │•Building│   │•Skip logic  │  │•Form  │  │  selection│
    │  codes  │   │•Branching   │  │  auto-│  │•Cost      │
    │•Elec/  │   │•Validation  │  │  fill │  │  estimation│
    │  Plumb  │   │             │  │       │  │           │
    │•WHS/   │   │             │  │       │  │           │
    │  Insurance │   │             │  │       │  │           │
    └────────┘   └─────────────┘  └───────┘  └───────────┘
         │              │             │           │
         └──────────────┴─────────────┴───────────┘
                        │
                   Database
            (Standards + Regulatory Data)
```

---

## 2. Question Generation Engine

### 2.1 Architecture

The **QuestionGenerationEngine** analyzes form structure + standards data to generate context-aware questions:

```typescript
// Core Interface
interface QuestionGenerationContext {
  // Form Schema
  formSchema: InspectionFormSchema
  currentAnswers: Map<string, any>
  completionPercentage: number

  // Standards Context
  waterCategory?: string        // Category 1/2/3
  waterClass?: string          // Class 1/2/3/4
  jobType?: string             // WATER_DAMAGE, MOLD, FIRE
  postcode?: string            // For building code
  propertyAge?: number         // Year built

  // Business Context
  userId: string
  userTierLevel: 'standard' | 'premium' | 'enterprise'
  technicianExperience: 'novice' | 'experienced' | 'expert'
}

interface Question {
  id: string
  sequenceNumber: number        // Order in interview
  text: string                 // Question text
  type: 'yes_no' | 'multiple_choice' | 'text' | 'numeric' | 'measurement' | 'location'

  // Standards Backing
  standardsReference: string[]  // ["IICRC S500 4.2", "NCC 2025 s3.2"]
  standardsJustification: string // Why we're asking this

  // Logic & Dependencies
  condition?: string            // When to show this question
  triggerFields?: string[]      // Which form fields does answer affect
  skipLogic?: {                // Skip to next question based on answer
    answerValue: any
    nextQuestionId: string
  }[]

  // Answer Options
  options?: {
    label: string
    value: any
    helperText?: string
    triggersFollowUp?: boolean
  }[]

  // Answer Mapping
  fieldMappings: {
    formFieldId: string
    transformFunction?: (answer: any) => any
    confidence: number          // 0-100 confidence in mapping
  }[]

  // Tips for Technician
  fieldGuidance?: string       // Context on why we're asking
  exampleAnswer?: string       // Example of good answer
}
```

### 2.2 Question Types by Standard Source

#### A. IICRC S500 Questions (Water Damage)

**Tier 1: Water Source & Timing** (Required questions)
```
Q1: "Where did the water come from?"
  - Clean water (supply line burst, roof leak)
  - Grey water (washing machine, dishwasher, toilet overflow)
  - Black water (sewage backup, contaminated)
  FieldMappings: sourceOfWater, waterCategory (inferred)
  StandardsRef: ["IICRC S500 s2", "AS 3500 Plumbing"]

Q2: "How many hours ago did the loss occur?"
  - < 12 hours ago
  - 12-48 hours ago
  - 48-72 hours ago
  - > 72 hours ago
  FieldMappings: timeSinceLoss, waterCategory (category 2→3 if >72hrs)
  StandardsRef: ["IICRC S500 s3", "QDC Moisture Thresholds"]
```

**Tier 2: Material Assessment** (Environment-dependent)
```
Q3: "What materials are wet?" (Multi-select)
  - Drywall
  - Wood flooring
  - Carpet
  - Concrete
  - Structural timber
  FieldMappings: affectedMaterials[], waterClass (inferred from materials)
  StandardsRef: ["IICRC S500 s4", "NCC 2025 Building Materials"]
```

**Tier 3: Environmental Data**
```
Q4: "What's the current temperature?" (numeric, 10-30°C typical)
  FieldMappings: temperatureCurrent
  StandardsRef: ["IICRC S500 Psychrometric s7"]

Q5: "What's the current humidity?" (numeric, 30-100% RH)
  FieldMappings: humidityCurrent
  StandardsRef: ["IICRC S500 Psychrometric s7"]
```

#### B. Building Code Questions (State-Specific)

**Detected by Postcode → State Building Code**
```
Q6: "What building age?" (if postcode = QLD)
  - Pre-1990 (may need asbestos survey)
  - 1990-2010 (lead paint possible)
  - Post-2010
  FieldMappings: buildingAge
  StandardsRef: ["QDC 4.5 Building Materials", "Environmental Protection Reg"]
  FollowUpCondition: If pre-1990 → "Has asbestos survey been done?"
```

**Structural Assessment (Automatically triggered if damage > 30% of area)**
```
Q7: "Is structural damage visible?" (yes/no/maybe)
  FieldMappings: structuralDamage
  StandardsRef: ["NCC 2025 s3", "Building Standards - Structural"]
  ConditionalShow: If affectedArea > 30% of total property
```

#### C. Electrical Standards Questions (AS/NZS 3000)

**Triggered if electrical equipment affected**
```
Q8: "Is electrical equipment damaged?" (yes/no)
  → If YES:
    Q8a: "Which type?" (multi-select)
      - Power outlets
      - Light fixtures
      - Panel/switchboard
      - Appliances
    FieldMappings: electricalHazards
    StandardsRef: ["AS/NZS 3000:2023 s7", "WHS Electrical Safety"]
    FollowUp: "Has power been isolated to affected area?"
```

#### D. Plumbing Standards Questions (AS/NZS 3500)

**Triggered if plumbing materials affected**
```
Q9: "What plumbing materials affected?" (if sourceOfWater = supply line)
  - PVC pipes
  - Copper pipes
  - Steel pipes
  - Fittings/connections
  FieldMappings: plumbingMaterials[]
  StandardsRef: ["AS/NZS 3500:2021 s2", "AS 3500 Drainage"]
```

#### E. Work Health & Safety Questions (WHS Act 2011)

**Safety-focused qualifying questions**
```
Q10: "Are there visible safety hazards?" (yes/no/unsure)
  FieldMappings: safetyHazards
  StandardsRef: ["Work Health and Safety Act 2011", "SWMS Site Setup"]

Q11: "Does the property need make-safe work before assessment?"
  - Electrical isolation required
  - Asbestos precautions
  - Contamination protocols
  - Structural support
  FieldMappings: makeSafeRequired[], makeSafeType
  StandardsRef: ["WHS Act 2011", "Building Standards Safety"]
```

#### F. Insurance-Specific Questions

**Premium Feature: Insurance Policy Questions**
```
Q12: "Is this a claim under insurance?" (yes/no/unsure)
  → If YES:
    Q12a: "Insurance company?" (text autocomplete)
    Q12b: "Policy type?" (Contents, Building, Both)
    FieldMappings: insurerName, coverType
    StandardsRef: ["General Insurance Code of Practice", "NECA Standards"]

Q13: "What's the claim amount?" (numeric estimate)
  FieldMappings: estimatedClaimAmount
  StandardsRef: ["Insurance Standards", "IICRC Estimating Guidelines"]
```

---

## 3. Interview Flow Engine

### 3.1 Progressive Disclosure Pattern

Start with **5 essential questions**, then branch into 10-15 contextual questions:

```
┌─────────────────────────────────────┐
│  Start Interview                    │
│  "Let's assess this property..."   │
└──────────────┬──────────────────────┘
               │
        ┌──────▼───────┐
        │  Q1: Source  │ (REQUIRED)
        │  Q2: Timing  │ (REQUIRED)
        │  Q3: Area %  │ (REQUIRED)
        │  Q4: Temp    │ (REQUIRED)
        │  Q5: Humidity│ (REQUIRED)
        └──────┬───────┘
               │ (5 answers → Initial classification)
        ┌──────▼──────────────────────┐
        │ BRANCHING LOGIC             │
        │ IF sourceOfWater = Supply:  │
        │   → Ask Plumbing Questions  │
        │ IF sourceOfWater = Sewage:  │
        │   → Ask Contamination Q     │
        │ IF waterClass = 4:          │
        │   → Ask Structural Q        │
        │ IF postcode = QLD:          │
        │   → Ask Building Code Q     │
        └──────┬──────────────────────┘
               │
        ┌──────▼────────────────────────┐
        │ CONTEXTUAL QUESTIONS (10-15)  │
        │ - Electrical (if needed)      │
        │ - Plumbing (if needed)        │
        │ - Safety (if needed)          │
        │ - Insurance (if premium tier) │
        └──────┬────────────────────────┘
               │
        ┌──────▼─────────────────────────┐
        │ REVIEW & CONFIRM               │
        │ Show auto-populated fields     │
        │ Allow manual edits             │
        │ Confidence scores per field    │
        └────────────────────────────────┘
```

### 3.2 Skip Logic Implementation

```typescript
interface SkipLogic {
  // Based on previous answer, skip N questions
  previousQuestionId: string
  answerValue: any
  skipToQuestionId: string  // Jump to this question
  reason: string            // "Not applicable for clean water"
}

// Example
const skipLogics: SkipLogic[] = [
  {
    previousQuestionId: 'Q1_water_source',
    answerValue: 'clean_water',
    skipToQuestionId: 'Q6_materials', // Skip "contamination level" Q
    reason: "Clean water doesn't require contamination assessment"
  },
  {
    previousQuestionId: 'Q3_materials',
    answerValue: ['drywall', 'carpet'], // Contains porous
    skipToQuestionId: 'Q8_structural', // Skip to critical assessment
    reason: "Porous materials require extensive evaluation"
  }
]
```

### 3.3 Conditional Questions

```typescript
interface ConditionalQuestion {
  questionId: string
  showWhen: {
    field: string              // Which field to evaluate
    operator: '==', '!=', '>', '<', 'includes', 'excludes'
    value: any
  }[]
  logicOperator: 'AND' | 'OR'
}

// Examples
const conditionalQuestions = [
  {
    questionId: 'Q7_asbestos',
    showWhen: [
      { field: 'buildingAge', operator: '<', value: 1990 }
    ]
  },
  {
    questionId: 'Q8_structural',
    showWhen: [
      { field: 'affectedAreaPercentage', operator: '>', value: 30 },
      { field: 'waterClass', operator: 'includes', value: ['3', '4'] }
    ],
    logicOperator: 'AND'
  }
]
```

---

## 4. Answer-to-Field Mapper

### 4.1 Intelligent Field Population

When technician answers a question, the system intelligently populates multiple form fields:

```typescript
interface QuestionAnswerMapping {
  questionId: string
  answer: any

  // Direct mappings (1:1)
  directFieldMappings: {
    formFieldId: string
    value: any              // Direct value or use answer
    confidence: number      // 0-100
  }[]

  // Derived mappings (1:N with transformation)
  derivedFieldMappings: {
    formFieldId: string
    transformer: (answer: any, context: Context) => any
    confidence: number
  }[]

  // Standard-backed mappings
  standardsReference: string[]
}

// Example: Answer to Q1 "Source = Black Water"
{
  questionId: 'Q1_water_source',
  answer: 'black_water',
  directFieldMappings: [
    { formFieldId: 'sourceOfWater', value: 'black_water', confidence: 100 },
  ],
  derivedFieldMappings: [
    {
      formFieldId: 'waterCategory',
      transformer: (answer) => 'Category 3', // Per IICRC S500
      confidence: 95
    },
    {
      formFieldId: 'safetyHazards',
      transformer: (answer) => 'Biological contamination risk - PPE required',
      confidence: 85
    },
    {
      formFieldId: 'makeSafeRequired',
      transformer: (answer) => ['biological_protocols', 'ppe_requirements'],
      confidence: 90
    }
  ],
  standardsReference: ['IICRC S500 s2', 'WHS Act 2011', 'AS 3500 Drainage']
}
```

### 4.2 Confidence Scoring

Each field population gets a confidence score (0-100):
- **95-100**: Deterministic from standards (water source → category)
- **80-95**: High confidence derived (materials + moisture → class)
- **60-80**: Moderate confidence (time + humidity → recommendation)
- **<60**: Low confidence (skip, or request manual entry)

```typescript
interface FieldPopulation {
  formFieldId: string
  populatedValue: any
  confidence: number        // 0-100
  standardsReference: string
  techniciansNote?: string  // Editable by tech
  source: 'direct' | 'derived' | 'calculated'

  // Allow technician to override
  isOverrideable: boolean
  originalValue?: any       // If tech modified
}
```

### 4.3 Real-Time Form Update UI

As technician answers questions, show live field updates:

```tsx
<InterviewPanel>
  <Question number={3} text="What's the affected area percentage?">
    <RadioGroup>
      <Option value="0-10">0-10%</Option>
      <Option value="10-30">10-30%</Option>
      <Option value="30-50">30-50%</Option>
      <Option value=">50">>50%</Option>
    </RadioGroup>
  </Question>

  <AutoPopulatedFields>
    <Field
      label="Water Class"
      value="Class 2"
      confidence={95}
      source="IICRC S500 derived from materials + moisture"
      editable
    />
    <Field
      label="Recommended Dehumidifier Type"
      value="LGR (Low Grain Refrigeration)"
      confidence={85}
      source="Calculated from area & humidity delta"
      editable
    />
  </AutoPopulatedFields>
</InterviewPanel>
```

---

## 5. Equipment Matcher

### 5.1 Optimal Equipment Selection

Based on interview answers, recommend optimal equipment with cost estimation:

```typescript
interface EquipmentRecommendation {
  equipmentId: string
  equipmentType: 'dehumidifier' | 'air_mover' | 'air_scrubber' | 'heater' | 'monitor'

  // IICRC-Based Calculation
  quantity: number
  reasoning: string  // "1 LGR per 1250 cu-ft per IICRC S500"

  // Specification
  specification: {
    type?: string      // "LGR" vs "Conventional" for dehumidifiers
    capacity?: number  // 90-180 pints/day
    wattage?: number
  }

  // Cost
  dailyRentalCost: number
  estimatedDaysNeeded: number
  totalEstimatedCost: number

  // Standards Backing
  standardsReference: string  // "IICRC S500 s6"

  // Tagging (Premium Feature)
  equipmentTags: {
    materialType?: string[]   // Wood, drywall, etc.
    waterCategory?: string
    waterClass?: string
    environmentalCondition?: string
    optimalFor?: string[]     // "fast-drying", "porous-materials", etc.
  }
}
```

### 5.2 Equipment Recommendation Algorithm

```
IF waterClass = 4:
  → 1 air mover per 50-75 sq ft (vs 150-200 for Class 1)
  → 1 LGR dehumidifier per 1000 cu-ft (vs 1250-2250 for Class 1)
  → 1 air scrubber per 500 sq ft
  → Confidence = 100 (per IICRC S500)

IF materials include porous (wood, drywall, carpet):
  → Recommend FASTER equipment settings
  → Add air scrubbers for antimicrobial
  → Confidence = 90 (IICRC material-specific guidance)

IF building age < 1980 AND water category = 3:
  → Asbestos survey required before drying
  → Add structural engineer recommendation
  → Confidence = 95 (WHS + Building codes)

IF postcode in high-humidity region:
  → Dehumidifier type = LGR (faster extraction)
  → Increase capacity recommendations
  → Confidence = 80 (Environmental factors)
```

### 5.3 Equipment Tagging System

Link equipment specifications to job conditions:

```typescript
interface EquipmentTag {
  // What is this equipment optimized for?
  tagType: 'material' | 'waterclass' | 'climate' | 'phase' | 'safety'

  examples: {
    // Material tags
    'porous-materials': "Optimized for drywall, carpet, wood",
    'structural-timber': "LGR to prevent case hardening",

    // Water class tags
    'class-4-aggressive': "High-capacity for saturated environments",
    'category-3-antimicrobial': "Configured for contamination control",

    // Climate tags
    'high-humidity-climate': "LGR for coastal/tropical regions",
    'low-humidity-climate': "Conventional sufficient, faster extraction",

    // Phase tags
    'make-safe-phase': "Isolated, limited access equipment",
    'active-drying-phase': "Full system deployment",
    'verification-phase': "Monitoring equipment only",

    // Safety tags
    'asbestos-containment': "Sealed systems, HEPA filters mandatory",
    'contamination-control': "Antimicrobial pre-treatment, sealed ducts"
  }

  // Maintenance & Certification
  requiresTraining: boolean
  certificationRequired?: string  // "HEPA filter management", "WHS confined space"
}
```

---

## 6. Premium Feature Tier Structure

### 6.1 Feature Tiers & Pricing

```
┌─────────────────────────────────────────────────────────┐
│              PRICING TIER MATRIX                        │
├──────────────┬──────────────┬──────────────┬────────────┤
│ FEATURE      │ STANDARD     │ PREMIUM      │ ENTERPRISE │
├──────────────┼──────────────┼──────────────┼────────────┤
│Base Forms    │ $49/mo       │ $149/mo      │ Custom     │
│ • 13 fields  │              │              │            │
│ • Mobile UI  │              │              │            │
│              │              │              │            │
│Guided        │ ✗            │ ✓            │ ✓ (Advanced│
│Interview     │              │              │  + API)    │
│ • 15-20 Q's  │              │              │            │
│ • Auto-fill  │              │              │            │
│ • IICRC only │              │              │            │
│              │              │              │            │
│Standards     │ IICRC S500   │ IICRC +      │ ALL        │
│Coverage      │ only         │ Building +   │ Standards  │
│              │              │ Electrical + │ + Custom   │
│              │              │ Plumbing +   │ Rules      │
│              │              │ WHS + Ins.   │            │
│              │              │              │            │
│Equipment     │ Calc (basic) │ Calc +       │ Intelligent│
│Recommendations│             │ Tagging      │ Matching + │
│              │              │              │ Equipment  │
│              │              │              │ Benchmarking│
│              │              │              │            │
│Advanced AI   │ None         │ Basic        │ Advanced   │
│Quality Check │              │ (Validation) │ (Predictive)│
│              │              │              │            │
│API Access    │ None         │ None         │ ✓ (Full)  │
│              │              │              │            │
│Support       │ Email        │ Email +      │ Dedicated  │
│              │              │ Chat         │ Support +  │
│              │              │              │ Training   │
├──────────────┼──────────────┼──────────────┼────────────┤
│ MONTHLY COST │ $49           │ $149         │ $499+      │
├──────────────┼──────────────┼──────────────┼────────────┤
│ ANNUAL COST  │ $490 (save 10)│ $1,490 (save│ $4,990 +   │
│              │              │ 15%)         │            │
└──────────────┴──────────────┴──────────────┴────────────┘
```

### 6.2 Premium Feature Benefits

**For PREMIUM Tier ($149/mo):**
- ✅ Guided Interview with 15-20 intelligent questions
- ✅ Auto-population from IICRC + Building + Electrical + Plumbing + WHS + Insurance standards
- ✅ Equipment recommendations with tagging (optimal for job conditions)
- ✅ Confidence scoring on all auto-populated fields
- ✅ Premium support (chat + email)
- ✅ Form completion time: **~5 min** (vs ~20 min manual)

**For ENTERPRISE Tier ($499+/mo):**
- ✅ Everything in Premium PLUS:
- ✅ Custom question templates per client
- ✅ Full API access (integrate into field management software)
- ✅ Equipment benchmarking (compare across jobs)
- ✅ Predictive AI (predict outcomes based on historical data)
- ✅ Custom standards/regulations per client
- ✅ Dedicated success manager
- ✅ Form completion time: **~3 min** (AI-driven)

---

## 7. Implementation Structure

### 7.1 Core Services to Build

```typescript
// 1. QuestionGenerationEngine
lib/interview/question-generation-engine.ts
  → generateQuestionsForForm()
  → generateContextualQuestions()
  → rankQuestionsByPriority()

// 2. InterviewFlowEngine
lib/interview/interview-flow-engine.ts
  → initializeInterview()
  → getNextQuestion()
  → processAnswer()
  → determineSkipLogic()
  → evaluateConditionalQuestions()

// 3. AnswerMappingEngine
lib/interview/answer-mapping-engine.ts
  → mapAnswerToFields()
  → calculateFieldConfidence()
  → populateFormFields()
  → detectConflicts()  // If manual entry differs from auto-filled

// 4. EquipmentMatcher
lib/interview/equipment-matcher.ts
  → recommendEquipment()
  → calculateEquipmentNeeds()
  → addEquipmentTags()
  → estimateCosts()

// 5. StandardsIntegration
lib/interview/standards-integration.ts
  → fetchRelevantStandards()
  → mapStandardsToQuestions()
  → validateAnswersAgainstStandards()

// 6. InterviewValidator
lib/interview/interview-validator.ts
  → validateAnswer()
  → checkForGaps()
  → suggestFollowUpQuestions()
```

### 7.2 UI Components

```typescript
// 1. GuidedInterviewPanel
components/forms/interview/GuidedInterviewPanel.tsx
  - Question display (5 types)
  - Answer input
  - Skip/Back navigation
  - Progress indicator
  - Standards reference display

// 2. QuestionCard
components/forms/interview/QuestionCard.tsx
  - Question text + guidance
  - Standards backing
  - Field mapping indicators
  - Confidence badges

// 3. AutoPopulatedFieldsSidebar
components/forms/interview/AutoPopulatedFieldsSidebar.tsx
  - Live field updates as answers progress
  - Confidence scores
  - Standards reference
  - Manual override option

// 4. InterviewSummary
components/forms/interview/InterviewSummary.tsx
  - Show all auto-populated fields
  - Confidence heatmap
  - Allow editing before submission
  - Equipment recommendations

// 5. EquipmentRecommendationCard
components/forms/interview/EquipmentRecommendationCard.tsx
  - Equipment type + quantity
  - Specification details
  - Cost estimation
  - Standards backing (IICRC reference)
```

### 7.3 API Endpoints

```typescript
// 1. Start Interview
POST /api/forms/interview/start
  Params: formId, userId, jobContext
  Returns: firstQuestion, estimatedDuration

// 2. Submit Answer
POST /api/forms/interview/answer
  Params: questionId, answer, context
  Returns: nextQuestion, autoPopulatedFields, confidence

// 3. Get Recommendations
GET /api/forms/interview/recommendations
  Params: interviewId, partialAnswers
  Returns: equipmentRecommendations, costs, alternatives

// 4. Complete Interview
POST /api/forms/interview/complete
  Params: interviewId, allAnswers
  Returns: populatedFormData, summary

// 5. Validate Interview
POST /api/forms/interview/validate
  Params: interviewId, formData
  Returns: gaps, warnings, confidence scores
```

---

## 8. Database Changes

### 8.1 New Models

```prisma
// Interview Session Tracking
model InterviewSession {
  id              String @id
  userId          String
  formTemplateId  String
  formSubmissionId String?

  status          InterviewStatus  // STARTED, IN_PROGRESS, COMPLETED, ABANDONED
  startedAt       DateTime
  completedAt     DateTime?
  abandonedAt     DateTime?

  totalQuestionsAsked  Int
  totalAnswersGiven    Int
  estimatedTimeMinutes Int
  actualTimeMinutes    Int?

  // Interview Data
  answers         String? @db.Text  // JSON: all answers
  autoPopulatedFields String? @db.Text  // JSON: field→value→confidence
  standardsReferences String? @db.Text  // JSON: questions→standards

  // Equipment Recommendations
  equipmentRecommendations String? @db.Text  // JSON: array
  estimatedEquipmentCost Float?

  // Relations
  user            User @relation(fields: [userId], references: [id])
  formTemplate    FormTemplate @relation(fields: [formTemplateId], references: [id])
  formSubmission  FormSubmission? @relation(fields: [formSubmissionId], references: [id])
}

enum InterviewStatus {
  STARTED
  IN_PROGRESS
  COMPLETED
  ABANDONED
}

// Individual Question Response Tracking
model InterviewResponse {
  id              String @id
  interviewSessionId String

  questionId      String
  questionText    String
  answerValue     String? @db.Text  // JSON serialized
  answerType      String  // yes_no, multiple_choice, etc.

  answeredAt      DateTime
  timeSpentSeconds Int?

  // Field Auto-Population from this Answer
  populatedFields String? @db.Text  // JSON: [{fieldId, value, confidence}]
  standardsReference String[]

  // Relations
  interviewSession InterviewSession @relation(fields: [interviewSessionId], references: [id])
}

// Track Standards Used in Interview
model InterviewStandardsMapping {
  id              String @id
  interviewSessionId String

  standardCode    String  // "IICRC S500", "NCC 2025", etc.
  standardTitle   String
  questionsUsing  String[] // Array of question IDs
  fieldsAffected  String[] // Array of form field IDs
  confidence      Float   // 0-100

  retrievedAt     DateTime @default(now())
  usageCount      Int @default(1)

  interviewSession InterviewSession @relation(fields: [interviewSessionId], references: [id])
}
```

### 8.2 User Model Modifications

```prisma
model User {
  // ... existing fields ...

  // Interview Preferences
  interviewTier   String @default("standard")  // standard, premium, enterprise
  preferredQuestionStyle String? // verbose, concise, technical
  autoAcceptSuggestionsAboveConfidence Float? // e.g., 90 (auto-accept 90%+ confident suggestions)

  // Interview History
  interviewSessions InterviewSession[]

  // Tier Pricing
  subscriptionTier SubscriptionTier? @relation(fields: [subscriptionTierId], references: [id])
  subscriptionTierId String?
}

model SubscriptionTier {
  id              String @id
  tierName        String  // "standard", "premium", "enterprise"
  monthlyPrice    Float
  features        String? @db.Text  // JSON: feature flags
  maxFormFields   Int
  maxQuestionsPerInterview Int
  standardsCoverage String[] // ["iicrc", "building", "electrical", "whs"]

  users           User[]
}
```

---

## 9. Question Database Schema

### 9.1 Questions Table

```prisma
model InterviewQuestion {
  id              String @id

  // Basic
  text            String
  type            String  // yes_no, multiple_choice, text, numeric, measurement, location

  // Standards Backing
  standardsReferences String[]  // JSON array: ["IICRC S500 4.2", "NCC 2025 s3"]
  standardsJustification String @db.Text

  // Form Integration
  targetFormFields String[]  // JSON array of formFieldIds
  fieldMappings   String @db.Text  // JSON: transformation logic

  // Logic
  sequenceNumber  Int?  // Order in interview
  condition       String? @db.Text  // Skip condition
  skipLogic       String? @db.Text  // JSON: answer→nextQuestion mapping

  // UI
  fieldGuidance   String?
  exampleAnswer   String?
  helperText      String?

  // Admin
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  isActive        Boolean @default(true)

  // Tier-specific
  minTier         String @default("standard")  // Minimum tier to show

  // Usage Analytics
  usageCount      Int @default(0)
  averageTimeSeconds Int?
}
```

---

## 10. Integration Points

### 10.1 With Existing Form System

```
┌─────────────────────────────────────┐
│   Guided Interview (NEW)            │
│   - 15-20 smart questions           │
│   - Standards-backed               │
└────────┬────────────────────────────┘
         │ Auto-populates
         ↓
┌─────────────────────────────────────┐
│   FormRenderer (MODIFIED)           │
│   - Show auto-populated fields     │
│   - Confidence badges              │
│   - Allow manual overrides         │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   FormSubmission (EXISTING)         │
│   - Accepts auto-populated data    │
│   - Tracks data source            │
└─────────────────────────────────────┘
```

### 10.2 With Equipment System

```
Interview Answers
  → Equipment Matcher
    → Recommendations (LGR dehumidifier, air movers, etc.)
    → Cost estimation
    → Equipment tagging (optimal for porous materials, class 3, etc.)
    → Integrate with Equipment Rental/Purchase system
```

### 10.3 With Regulatory System

```
Interview Question Generated
  → Standards retrieval (lib/regulatory-retrieval.ts)
  → Specific sections fetched (building codes, electrical, WHS)
  → Questions mapped to standard sections
  → Answer validated against standards
  → Citations included in PDF output
```

---

## 11. Premium Feature Messaging

### 11.1 UI/UX Callouts

```
Standard Tier Shows:
────────────────────
"📋 Fill form manually"
(Blue badge, no AI assist)

Premium Tier Shows:
──────────────────
"✨ Guided Interview"
"Answer 15-20 smart questions"
"Auto-populate 50+ fields"
"Estimated time: 5 minutes"
(Green badge, premium feature highlight)

Enterprise Tier Shows:
──────────────────
"🚀 Advanced Interview"
"Custom questions for your workflows"
"Predictive field population"
"Equipment benchmarking"
"Estimated time: 3 minutes"
(Gold badge, enterprise highlight)
```

### 11.2 Feature Comparison Modal

```
┌──────────────────────────────────────────────────────────┐
│  FEATURE COMPARISON                  [Upgrade Now]       │
├──────────────────────────────────────────────────────────┤
│                    │ STANDARD │ PREMIUM  │ ENTERPRISE    │
│ ─────────────────┼──────────┼──────────┼───────────────│
│ Guided Interview │    ✗     │    ✓     │      ✓        │
│ Questions        │    —     │   15-20  │    20-40+     │
│ Auto-fill Fields │    ✗     │   ~50    │     ~60       │
│ Standards Used   │ IICRC    │ All 6    │   All + Custom│
│ Equipment Recs   │ Basic    │ Smart    │  Intelligent  │
│ ...              │          │          │               │
│                  │   $49/mo │ $149/mo  │   $499+/mo    │
└──────────────────────────────────────────────────────────┘
```

---

## 12. Success Metrics for Premium Feature

### 12.1 Time Savings
- **Standard**: 20 minutes average form completion
- **Premium**: 5 minutes (75% time savings)
- **Target**: Achieve 5-min average within first month of launch

### 12.2 Data Quality
- **Standard**: 70% field completion, ~20% errors
- **Premium**: 95%+ field completion, <5% errors
- **Target**: 95%+ accuracy on auto-populated fields

### 12.3 Feature Adoption
- **Target**: 40% of new accounts upgrade to Premium within 3 months
- **Retention**: 85%+ retention after 6 months
- **ARPU Lift**: $100 ARPU → $180 ARPU (after Premium adoption)

### 12.4 Standards Compliance
- **Target**: 100% of IICRC S500 requirements covered
- **Target**: 95%+ of state-specific building codes covered
- **Target**: WHS Act compliance for all recommended actions

---

## 13. Implementation Roadmap

### Phase 1: Question Generation Engine (Week 1-2)
- [ ] Design question database schema
- [ ] Build QuestionGenerationEngine service
- [ ] Create 25 core questions (IICRC + Building Codes)
- [ ] Implement skip logic & conditional questions

### Phase 2: Interview Flow & UI (Week 3)
- [ ] Build InterviewFlowEngine
- [ ] Create GuidedInterviewPanel UI components
- [ ] Implement progress tracking
- [ ] Add standards reference display

### Phase 3: Answer-to-Field Mapping (Week 4)
- [ ] Build AnswerMappingEngine
- [ ] Integrate with FormRenderer
- [ ] Implement confidence scoring
- [ ] Add live field auto-population UI

### Phase 4: Equipment Matcher (Week 5)
- [ ] Design equipment tagging system
- [ ] Build equipment recommendation algorithm
- [ ] Integrate with equipment rental system
- [ ] Add cost estimation

### Phase 5: Premium Tier Integration (Week 6)
- [ ] Add tier checks to interview system
- [ ] Create subscription tier models
- [ ] Build feature comparison UI
- [ ] Launch pricing page

### Phase 6: Testing & Refinement (Week 7-8)
- [ ] Technician user testing
- [ ] Equipment accuracy validation
- [ ] Standards compliance audit
- [ ] Performance optimization

---

## 14. Next Steps

1. **Approve Architecture** - User reviews this design document
2. **Phase 1 Implementation** - Build question database + generation engine
3. **Gather Sample Questions** - Collect 25 core questions from standards
4. **User Testing** - Get technician feedback on question wording
5. **Launch Premium Tier** - Roll out to beta users

---

**Document Version**: 1.0
**Created**: 2026-01-09
**Status**: Design Review Ready
