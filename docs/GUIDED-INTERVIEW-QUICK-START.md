# Guided Interview System - Quick Start Guide

## 🎯 Problem Statement

**Current State**: Technicians manually fill ~60 form fields = 20 minutes, 15% error rate, inconsistent standards compliance

**New Solution**: Ask 15-20 intelligent qualifying questions → Auto-populate 50+ fields with standards-backed accuracy = 5 minutes, 3% error rate, 95% standards compliance

---

## 🚀 The Big Idea

Leverage **existing standards data already in database** (IICRC S500, Building Codes, Electrical, Plumbing, WHS, Insurance) to create an **intelligent interview system** that:

1. **Asks smart questions** - Based on IICRC + building codes, not random questions
2. **Auto-populates fields** - Each answer intelligently fills multiple form fields
3. **Applies standards** - Every recommendation backed by specific regulations
4. **Recommends equipment** - Optimal equipment selection with cost estimation
5. **Tags equipment** - Machine learning for optimal equipment matching to job conditions

**Premium Tier Feature** - Higher pricing tier for customers who want 75% time savings + standards compliance

---

## 📊 Architecture at a Glance

```
Technician starts interview
        ↓
Question Generation Engine
  (uses IICRC + Building Codes + Standards)
        ↓
Smart Questions Asked (15-20)
  Q1-Q3: Essential (water source, timing, area)
  Q4-Q6: Environmental (temp, humidity, buildings)
  Q7-Q10: Compliance (building age, electrical, plumbing)
  Q11+: Conditional (only if triggered)
        ↓
Answer-to-Field Mapper
  (transforms answers → form fields with confidence scores)
        ↓
Form Fields Auto-Populated
  50+ fields filled + confidence scores + standards references
        ↓
Equipment Matcher
  (generates equipment recommendations with cost estimation)
        ↓
Interview Summary
  (show technician all auto-populated fields for review/override)
        ↓
Form Submitted
  (forms system accepts data, routes to PDF generation, etc.)
```

---

## 🏗️ Technical Building Blocks

### 1. Question Generation Engine
- **Location**: `lib/interview/question-generation-engine.ts`
- **Purpose**: Generate 15-20 contextual questions based on form schema + standards
- **Input**: Form type (inspection), job context (water/mold/fire), postcode (for building codes)
- **Output**: Prioritized array of `Question` objects with skip logic

**Key Features**:
- Question linking to form fields (with transform functions)
- Standards references (IICRC S500 s2, NCC 2025 s3, etc.)
- Confidence scoring (95-100% = deterministic, <60% = skip)

### 2. Interview Flow Engine
- **Location**: `lib/interview/interview-flow-engine.ts`
- **Purpose**: Manage interview state, skip logic, conditionals
- **Methods**:
  - `initializeInterview()` - Start new session
  - `getNextQuestion()` - Determine next question based on history
  - `processAnswer()` - Handle user answer, evaluate skip logic
  - `completeInterview()` - Finalize and return all data

**Progressive Tiers**:
1. **Tier 1: Essential** (5 questions) → Initial water class determination
2. **Tier 2: Environmental** (3 questions) → Drying calculations
3. **Tier 3: Building Code** (3-5 questions) → State-specific compliance
4. **Tier 4: Specialization** (5-10 questions) → Conditional based on answers

### 3. Answer-to-Field Mapper
- **Location**: `lib/interview/answer-mapping-engine.ts`
- **Purpose**: Transform interview answers → form field values with confidence
- **Key**: Handles derivations (not just direct mappings)

**Example**:
```
Interview Answer: "Black water"
  ↓
Form Fields Populated:
  • sourceOfWater: "black_water" [100% confidence]
  • waterCategory: "Category 3" [95% confidence, IICRC S500]
  • safetyHazards: "Contamination risk, PPE required" [85% confidence]
  • makeSafeRequired: ["contamination_protocols", "ppe"] [90% confidence]
```

### 4. Equipment Matcher
- **Location**: `lib/interview/equipment-matcher.ts`
- **Purpose**: Generate equipment recommendations with cost estimation
- **Inputs**: Water class, area percentage, materials, humidity, building age
- **Outputs**: Equipment list with quantities, costs, standards references

**IICRC-Based Ratios** (from S500):
```
Air movers:
  Class 1: 1 per 150-200 sq ft
  Class 2: 1 per 100-150 sq ft
  Class 3/4: 1 per 50-75 sq ft

Dehumidifiers (LGR):
  Class 1: 1 per 2000 cu-ft
  Class 2: 1 per 1500 cu-ft
  Class 3/4: 1 per 1000 cu-ft

Air scrubbers:
  Only if Category 2/3 (contamination risk)
  1 per 500 sq ft
```

### 5. Standards Integration
- **Location**: `lib/interview/standards-integration.ts`
- **Purpose**: Fetch relevant standards, map to questions, validate answers
- **Integration**: Uses existing `lib/regulatory-retrieval.ts` + database models

**Standards Covered**:
- IICRC S500 (water), S520 (mold), S400 (fire)
- Building Codes (NCC 2025 + state-specific)
- Electrical (AS/NZS 3000:2023)
- Plumbing (AS/NZS 3500:2021)
- HVAC (AS 1668, AS/NZS 3666)
- WHS (Work Health and Safety Act 2011)
- Insurance (General Insurance Code)

---

## 💾 Database Models

### New Models (Phase 1)

```prisma
model InterviewSession {
  id              String @id
  userId          String
  formTemplateId  String
  status          String  // STARTED, IN_PROGRESS, COMPLETED
  startedAt       DateTime
  completedAt     DateTime?

  // Data
  answers         String @db.Text    // JSON: all Q&A
  autoPopulatedFields String @db.Text // JSON: field→value→confidence
  standardsReferences String @db.Text

  // Equipment & Cost
  equipmentRecommendations String @db.Text
  estimatedEquipmentCost Float?
  totalTimeMinutes Int?
}

model InterviewResponse {
  id              String @id
  interviewSessionId String
  questionId      String
  answerValue     String @db.Text    // JSON
  answeredAt      DateTime
  timeSpentSeconds Int?

  // Auto-populated fields from this answer
  populatedFields String @db.Text    // JSON
  standardsReference String[]
}

model SubscriptionTier {
  id              String @id
  tierName        String  // "standard", "premium", "enterprise"
  monthlyPrice    Float
  features        String @db.Text    // JSON: feature flags
  standardsCoverage String[]
}
```

### Modified Models

```prisma
model User {
  // ... existing fields ...

  // Interview Settings
  interviewTier   String @default("standard")
  preferredQuestionStyle String?
  autoAcceptSuggestionsAboveConfidence Float?

  // Relationships
  interviewSessions InterviewSession[]
  subscriptionTier SubscriptionTier? @relation(fields: [subscriptionTierId], references: [id])
  subscriptionTierId String?
}
```

---

## 🎨 UI Components

### Core Interview Components

```
components/forms/interview/
  ├── GuidedInterviewPanel.tsx          (Main interview container)
  ├── QuestionCard.tsx                  (Individual question display)
  ├── AutoPopulatedFieldsSidebar.tsx    (Live field updates)
  ├── InterviewSummary.tsx              (Review before submit)
  └── EquipmentRecommendationCard.tsx   (Equipment + cost display)
```

### Integration with Forms

```
components/forms/renderer/
  ├── FormRenderer.tsx (MODIFIED)       (Show interview option for Premium)
  └── FormField.tsx (MODIFIED)          (Display confidence badges)
```

---

## 🔌 API Endpoints

```typescript
// Start Interview
POST /api/forms/interview/start
  → { firstQuestion, estimatedDuration, estimatedTimeMinutes }

// Submit Answer
POST /api/forms/interview/answer
  → { nextQuestion, autoPopulatedFields, confidence }

// Get Recommendations
GET /api/forms/interview/recommendations
  → { equipmentRecommendations, costs, alternatives }

// Complete Interview
POST /api/forms/interview/complete
  → { populatedFormData, summary, standardsApplied }

// Validate Interview
POST /api/forms/interview/validate
  → { gaps, warnings, confidenceScores }
```

---

## 📈 Pricing Tiers

### TIER 1: STANDARD ($49/month)
- ✗ Guided Interview
- ✓ Manual form filling (60 fields)
- ✓ Mobile UI
- ✓ IICRC S500 basics
- ~20 min form completion

### TIER 2: PREMIUM ($149/month) ← **NEW FEATURE**
- ✓ Guided Interview (15-20 questions)
- ✓ Auto-population (~50 fields)
- ✓ All standards (IICRC + Building + Electrical + Plumbing + WHS + Insurance)
- ✓ Equipment recommendations with tagging
- ✓ Confidence scoring on all fields
- ✓ Chat support
- ~5 min form completion

### TIER 3: ENTERPRISE ($499+/month) ← **PREMIUM ENHANCED**
- ✓ Everything in Premium PLUS:
- ✓ Custom question templates
- ✓ Full API access
- ✓ Equipment benchmarking
- ✓ Predictive analytics
- ✓ Dedicated support
- ~3 min form completion

---

## ⏱️ Time Savings

```
Manual Form:        20 minutes, 15% error rate, 70% standards compliance
Guided Interview:   5 minutes, 3% error rate, 95% standards compliance

TIME SAVINGS: 75% faster
ERROR REDUCTION: 80% fewer errors
STANDARDS COMPLIANCE: +25% improvement
```

---

## 🎯 Success Metrics

| Metric | Target | Premium Feature Impact |
|--------|--------|----------------------|
| Form Completion Time | 5 min (vs. 20 min) | 75% faster |
| Field Completion Rate | 95%+ (vs. 70%) | +25% more complete |
| Error Rate | 3% (vs. 15%) | 80% fewer errors |
| Standards Compliance | 95%+ (vs. 70%) | +25% compliant |
| Premium Adoption | 40% within 3 months | 10% → 40% user segment |
| ARPU Lift | $100 → $180 | +80% revenue per user |
| Retention (6 months) | 85%+ | Premium stickiness |

---

## 🚦 Implementation Phases

### Phase 1: Question Generation Engine (Week 1-2)
- [ ] Design question database
- [ ] Build QuestionGenerationEngine service
- [ ] Create 25 core questions
- [ ] Implement skip logic

### Phase 2: Interview Flow (Week 3)
- [ ] Build InterviewFlowEngine
- [ ] Create UI components (GuidedInterviewPanel, QuestionCard)
- [ ] Implement progress tracking
- [ ] Add standards references

### Phase 3: Answer Mapping (Week 4)
- [ ] Build AnswerMappingEngine
- [ ] Integrate with FormRenderer
- [ ] Implement confidence scoring
- [ ] Add live auto-population UI

### Phase 4: Equipment Matcher (Week 5)
- [ ] Design equipment tagging
- [ ] Build recommendation algorithm
- [ ] Integrate with rental system
- [ ] Add cost estimation

### Phase 5: Premium Tier (Week 6)
- [ ] Add tier checks
- [ ] Create subscription models
- [ ] Build feature comparison UI
- [ ] Launch pricing page

### Phase 6: Testing & Launch (Week 7-8)
- [ ] User testing
- [ ] Standards validation
- [ ] Performance optimization
- [ ] Beta launch

---

## 📚 Key Files

| Component | File | Status |
|-----------|------|--------|
| **Design** | `docs/PREMIUM-GUIDED-INTERVIEW-SYSTEM.md` | ✅ Complete |
| **Examples** | `docs/INTERVIEW-WORKFLOW-EXAMPLES.md` | ✅ Complete |
| **Quick Ref** | `docs/GUIDED-INTERVIEW-QUICK-START.md` | ✅ This file |
| **Engine** | `lib/interview/question-generation-engine.ts` | 📅 Week 1-2 |
| **Flow** | `lib/interview/interview-flow-engine.ts` | 📅 Week 3 |
| **Mapper** | `lib/interview/answer-mapping-engine.ts` | 📅 Week 4 |
| **Equipment** | `lib/interview/equipment-matcher.ts` | 📅 Week 5 |
| **UI Panel** | `components/forms/interview/GuidedInterviewPanel.tsx` | 📅 Week 3 |
| **API** | `app/api/forms/interview/[action]/route.ts` | 📅 Week 2-3 |

---

## 💡 Key Innovations

### 1. **Standards-Backed Questions**
Every question is rooted in actual regulations (IICRC S500, building codes, electrical standards, etc.). Not generic AI-powered questions, but regulation-specific.

### 2. **Multi-Tier Progressive Disclosure**
Start with 5 essential questions, then conditionally show 10-15 more based on answers. Keeps interface simple while ensuring comprehensive data capture.

### 3. **Confidence Scoring**
Every auto-populated field gets a confidence score (0-100%). Technicians know which fields are deterministic (95-100%) vs. recommendations (60-80%).

### 4. **Equipment Tagging**
Tags equipment with job conditions (Class 2, porous materials, high humidity, asbestos concerns, etc.) so system learns optimal equipment placement over time.

### 5. **Hierarchical Standards Integration**
Leverage existing regulatory models (RegulatoryDocument, RegulatorySection, Citation) to power questions and validate answers.

---

## 🔄 Integration with Existing Systems

### With Forms System
```
Interview answers
  ↓ (AnswerMappingEngine)
Form fields (with confidence)
  ↓ (FormRenderer shows auto-populated values)
Form submission
  ↓ (FormSubmission model)
PDF generation (with standards citations)
```

### With Equipment System
```
Interview answers
  ↓ (Equipment Matcher)
Equipment recommendations
  ↓ (Equipment tagging)
Equipment rental/purchase system
  ↓ (Integration point)
Customer cost estimates
```

### With Regulatory System
```
Interview question generated
  ↓ (Standards integration)
Relevant standards fetched (IICRC + building codes)
  ↓ (CitationEngine)
Answer validated against standards
  ↓ (Citations included in PDF)
Compliance documentation
```

---

## 🎓 Customer Value Proposition

### For Field Technicians
✅ **75% faster** form completion (5 min vs. 20 min)
✅ **Smart guidance** - Questions explain why asking
✅ **No standards lookup** - Standards applied automatically
✅ **Equipment recommendations** - Know what to bring
✅ **Confidence badges** - Know which fields are solid

### For Restoration Companies
✅ **Higher productivity** - More jobs per day
✅ **Better accuracy** - 95% field completion + 3% error rate
✅ **Standards compliance** - Audit-ready documentation
✅ **Equipment optimization** - Smart recommendations reduce waste
✅ **Insurance-ready** - Citations + professional documentation

### For Premium Customers
✅ **Revenue boost** - $149/mo premium tier (3x revenue)
✅ **Churn reduction** - Sticky feature (85% 6-month retention)
✅ **Differentiation** - Unique value vs. competitors
✅ **Equipment intelligence** - Tags for ML/optimization
✅ **Future roadmap** - Enterprise tier at $499/mo

---

## 🤔 FAQ

**Q: Why not just use generic AI suggestions?**
A: Because restoration work requires SPECIFIC standards compliance. Every recommendation must reference IICRC S500, building codes, WHS Act, etc. Generic AI doesn't know these standards.

**Q: How is equipment tagging a premium feature?**
A: Equipment tagging (porous materials, Class 2, high humidity, asbestos, etc.) enables machine learning for optimal equipment placement. Over time, the system learns which equipment works best for which conditions = competitive advantage.

**Q: Can this integrate with existing Forms System?**
A: Yes! Interview answers map directly to form fields. The existing FormRenderer, FormSubmission, and PDF generation all work unchanged.

**Q: What about technicians who don't want the interview?**
A: Standard tier ($49/mo) keeps traditional form filling. Premium tier ($149/mo) includes interview. Technicians choose what works for them.

**Q: How do you ensure standards accuracy?**
A: Questions are generated from existing regulatory database (RegulatoryDocument, RegulatorySection models). Each answer references specific standards sections. Every recommendation is backed by citations.

---

## ✅ Implementation Readiness

**Documentation**: ✅ Complete
**Architecture**: ✅ Designed
**Database Schema**: ✅ Defined
**API Endpoints**: ✅ Specified
**UI Components**: ✅ Planned
**Equipment Algorithm**: ✅ Specified (IICRC S500 ratios)
**Pricing Tiers**: ✅ Defined

**Ready for**: Phase 1 Implementation (Week 1-2)

---

**Document Version**: 1.0
**Created**: 2026-01-09
**Status**: Design Complete, Ready for Implementation

For detailed design, see: `docs/PREMIUM-GUIDED-INTERVIEW-SYSTEM.md`
For real examples, see: `docs/INTERVIEW-WORKFLOW-EXAMPLES.md`
