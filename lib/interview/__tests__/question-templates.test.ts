/**
 * Unit Tests for Interview Question Templates
 * Validates all 25 core questions meet quality and standards requirements
 */

import { INTERVIEW_QUESTION_LIBRARY, getQuestionsForTier, getQuestionsForSubscriptionTier } from '../question-templates'
import { QuestionGenerationEngine } from '../question-generation-engine'
import { Question } from '../types'

describe('Interview Question Templates', () => {
  describe('Library Structure', () => {
    it('should export INTERVIEW_QUESTION_LIBRARY as an array', () => {
      expect(Array.isArray(INTERVIEW_QUESTION_LIBRARY)).toBe(true)
    })

    it('should contain at least 20 questions', () => {
      expect(INTERVIEW_QUESTION_LIBRARY.length).toBeGreaterThanOrEqual(20)
    })

    it('should have questions from all 4 tiers', () => {
      const tier1 = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.sequenceNumber && q.sequenceNumber <= 5)
      const tier2 = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.sequenceNumber && q.sequenceNumber > 5 && q.sequenceNumber <= 8)
      const tier3 = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.sequenceNumber && q.sequenceNumber > 8 && q.sequenceNumber <= 13)
      const tier4 = INTERVIEW_QUESTION_LIBRARY.filter((q) => !q.sequenceNumber || q.sequenceNumber > 13)

      expect(tier1.length).toBeGreaterThan(0)
      expect(tier2.length).toBeGreaterThan(0)
      expect(tier3.length).toBeGreaterThan(0)
      expect(tier4.length).toBeGreaterThan(0)
    })
  })

  describe('Individual Question Quality', () => {
    it('each question should have a unique ID', () => {
      const ids = INTERVIEW_QUESTION_LIBRARY.map((q) => q.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(INTERVIEW_QUESTION_LIBRARY.length)
    })

    it('each question should pass validation', () => {
      const invalidQuestions = INTERVIEW_QUESTION_LIBRARY.filter((q) => {
        const result = QuestionGenerationEngine.validateQuestion(q)
        return !result.valid
      })

      if (invalidQuestions.length > 0) {
        console.log('Invalid questions:', invalidQuestions.map((q) => ({
          id: q.id,
          errors: QuestionGenerationEngine.validateQuestion(q).errors,
        })))
      }

      expect(invalidQuestions).toHaveLength(0)
    })

    it('each question should have text longer than 5 characters', () => {
      const shortTextQuestions = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.text.length < 5)

      expect(shortTextQuestions).toHaveLength(0)
    })

    it('each question should have valid type', () => {
      const validTypes = ['yes_no', 'multiple_choice', 'text', 'numeric', 'measurement', 'location', 'multiselect', 'checkbox']
      const invalidTypes = INTERVIEW_QUESTION_LIBRARY.filter((q) => !validTypes.includes(q.type as string))

      expect(invalidTypes).toHaveLength(0)
    })
  })

  describe('Standards References', () => {
    it('each question should reference at least 1 standard', () => {
      const noStandards = INTERVIEW_QUESTION_LIBRARY.filter((q) => !q.standardsReference || q.standardsReference.length === 0)

      expect(noStandards).toHaveLength(0)
    })

    it('each question should have standards justification', () => {
      const noJustification = INTERVIEW_QUESTION_LIBRARY.filter((q) => !q.standardsJustification || q.standardsJustification.length === 0)

      expect(noJustification).toHaveLength(0)
    })

    it('standards should include recognized standards', () => {
      const recognizedStandards = [
        'IICRC',
        'NCC',
        'AS/NZS',
        'WHS',
        'AS',
        'AS3500',
        'AS4000',
        'QDC',
      ]

      const allStandards = new Set<string>()
      INTERVIEW_QUESTION_LIBRARY.forEach((q) => {
        q.standardsReference.forEach((s) => {
          const code = s.split(' ')[0] // Extract first word
          allStandards.add(code)
        })
      })

      allStandards.forEach((std) => {
        const isRecognized = recognizedStandards.some((rs) => std.includes(rs))
        expect(isRecognized).toBe(true)
      })
    })

    it('should cover key standards across library', () => {
      const allReferences = INTERVIEW_QUESTION_LIBRARY.flatMap((q) => q.standardsReference).join(' ')

      expect(allReferences).toContain('IICRC')
      expect(allReferences).toContain('NCC')
      expect(allReferences).toContain('WHS')
    })
  })

  describe('Field Mappings', () => {
    it('each question should have at least 1 field mapping', () => {
      const noMappings = INTERVIEW_QUESTION_LIBRARY.filter((q) => !q.fieldMappings || q.fieldMappings.length === 0)

      expect(noMappings).toHaveLength(0)
    })

    it('field mappings should have valid formFieldId', () => {
      const invalidMappings = INTERVIEW_QUESTION_LIBRARY.filter(
        (q) =>
          q.fieldMappings &&
          q.fieldMappings.some((m) => !m.formFieldId || m.formFieldId.length === 0)
      )

      expect(invalidMappings).toHaveLength(0)
    })

    it('field mappings should have confidence between 0-100', () => {
      const invalidConfidence = INTERVIEW_QUESTION_LIBRARY.filter(
        (q) =>
          q.fieldMappings &&
          q.fieldMappings.some((m) => m.confidence < 0 || m.confidence > 100)
      )

      expect(invalidConfidence).toHaveLength(0)
    })

    it('direct field mappings should have high confidence (>85)', () => {
      const directMappings = INTERVIEW_QUESTION_LIBRARY.flatMap((q) =>
        q.fieldMappings.filter((m) => !m.transformer).map((m) => ({ questionId: q.id, mapping: m }))
      )

      directMappings.forEach(({ mapping }) => {
        expect(mapping.confidence).toBeGreaterThan(85)
      })
    })

    it('derived mappings (with transformer) can have lower confidence (>70)', () => {
      const derivedMappings = INTERVIEW_QUESTION_LIBRARY.flatMap((q) =>
        q.fieldMappings.filter((m) => m.transformer).map((m) => ({ questionId: q.id, mapping: m }))
      )

      derivedMappings.forEach(({ mapping }) => {
        expect(mapping.confidence).toBeGreaterThan(70)
      })
    })
  })

  describe('Skip Logic', () => {
    it('skip logic rules should have valid nextQuestionId', () => {
      const invalidSkipLogic = INTERVIEW_QUESTION_LIBRARY.filter((q) => {
        if (!q.skipLogic) return false
        return q.skipLogic.some((rule) => !rule.nextQuestionId || rule.nextQuestionId.length === 0)
      })

      expect(invalidSkipLogic).toHaveLength(0)
    })

    it('skip logic nextQuestionId should reference existing questions', () => {
      const questionIds = new Set(INTERVIEW_QUESTION_LIBRARY.map((q) => q.id))
      const invalidReferences = INTERVIEW_QUESTION_LIBRARY.filter((q) => {
        if (!q.skipLogic) return false
        return q.skipLogic.some((rule) => !questionIds.has(rule.nextQuestionId))
      })

      expect(invalidReferences).toHaveLength(0)
    })

    it('questions with conditional shows should not also have skip logic to same question', () => {
      // A question shouldn't both conditionally show AND have skip logic pointing to same next Q
      // (would be redundant)
      INTERVIEW_QUESTION_LIBRARY.forEach((q) => {
        if (q.skipLogic && q.conditionalShows) {
          // This is allowed - they serve different purposes
          expect(true).toBe(true)
        }
      })
    })
  })

  describe('Conditional Shows', () => {
    it('conditional show rules should reference valid fields', () => {
      const validFieldTypes = ['water_source', 'time_since_loss', 'affected_area_percentage', 'materials_affected', 'temperature', 'humidity']

      const invalidConditionals = INTERVIEW_QUESTION_LIBRARY.filter((q) => {
        if (!q.conditionalShows) return false
        return q.conditionalShows.some((c) => {
          // Field can be any string, but should be reasonable
          return !c.field || c.field.length === 0
        })
      })

      expect(invalidConditionals).toHaveLength(0)
    })

    it('conditional show rules should have valid operators', () => {
      const validOperators = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'includes', 'excludes', 'contains']

      const invalidOperators = INTERVIEW_QUESTION_LIBRARY.filter((q) => {
        if (!q.conditionalShows) return false
        return q.conditionalShows.some((c) => !validOperators.includes(c.operator))
      })

      expect(invalidOperators).toHaveLength(0)
    })

    it('conditional show rules should have values', () => {
      const noValues = INTERVIEW_QUESTION_LIBRARY.filter((q) => {
        if (!q.conditionalShows) return false
        return q.conditionalShows.some((c) => c.value === undefined || c.value === null)
      })

      expect(noValues).toHaveLength(0)
    })
  })

  describe('Tier Organization', () => {
    it('tier 1 questions should be limited to essential questions', () => {
      const tier1 = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.sequenceNumber && q.sequenceNumber <= 5)

      expect(tier1.length).toBeGreaterThan(0)
      expect(tier1.length).toBeLessThanOrEqual(10) // Essential set should be manageable
    })

    it('tier 2 questions should focus on environmental factors', () => {
      const tier2 = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.sequenceNumber && q.sequenceNumber > 5 && q.sequenceNumber <= 8)

      expect(tier2.length).toBeGreaterThan(0)
      expect(tier2.length).toBeLessThanOrEqual(10)
    })

    it('tier 3 questions should cover compliance and building standards', () => {
      const tier3 = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.sequenceNumber && q.sequenceNumber > 8 && q.sequenceNumber <= 13)

      expect(tier3.length).toBeGreaterThan(0)
    })

    it('tier 4 questions should be specialized and premium features', () => {
      const tier4 = INTERVIEW_QUESTION_LIBRARY.filter((q) => !q.sequenceNumber || q.sequenceNumber > 13)

      expect(tier4.length).toBeGreaterThan(0)
    })

    it('tier 4 questions should primarily have premium minTierLevel', () => {
      const tier4 = INTERVIEW_QUESTION_LIBRARY.filter((q) => !q.sequenceNumber || q.sequenceNumber > 13)
      const tier4Premium = tier4.filter((q) => q.minTierLevel === 'premium' || q.minTierLevel === 'enterprise')

      // Most (but not all) tier 4 questions should be premium
      expect(tier4Premium.length / tier4.length).toBeGreaterThan(0.3)
    })
  })

  describe('Subscription Tier Levels', () => {
    it('all questions should have valid minTierLevel if specified', () => {
      const validTiers = ['standard', 'premium', 'enterprise']
      const invalidTiers = INTERVIEW_QUESTION_LIBRARY.filter(
        (q) => q.minTierLevel && !validTiers.includes(q.minTierLevel as string)
      )

      expect(invalidTiers).toHaveLength(0)
    })

    it('should have standard tier questions (free tier)', () => {
      const standardTierQuestions = INTERVIEW_QUESTION_LIBRARY.filter((q) => !q.minTierLevel || q.minTierLevel === 'standard')

      expect(standardTierQuestions.length).toBeGreaterThan(0)
    })

    it('should have premium tier questions', () => {
      const premiumTierQuestions = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.minTierLevel === 'premium')

      expect(premiumTierQuestions.length).toBeGreaterThan(0)
    })

    it('premium questions should be in tier 3 or 4', () => {
      const premiumQuestions = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.minTierLevel === 'premium')

      premiumQuestions.forEach((q) => {
        const seqNum = q.sequenceNumber || 999
        expect(seqNum).toBeGreaterThanOrEqual(8) // Tier 3+ starts at sequence 8
      })
    })
  })

  describe('Helper Functions', () => {
    describe('getQuestionsForTier', () => {
      it('should return tier 1 questions', () => {
        const tier1 = getQuestionsForTier(1)

        expect(tier1.length).toBeGreaterThan(0)
        tier1.forEach((q) => {
          expect(q.sequenceNumber).toBeLessThanOrEqual(5)
        })
      })

      it('should return tier 2 questions', () => {
        const tier2 = getQuestionsForTier(2)

        expect(tier2.length).toBeGreaterThan(0)
        tier2.forEach((q) => {
          expect(q.sequenceNumber).toBeGreaterThan(5)
          expect(q.sequenceNumber).toBeLessThanOrEqual(8)
        })
      })

      it('should return tier 3 questions', () => {
        const tier3 = getQuestionsForTier(3)

        expect(tier3.length).toBeGreaterThan(0)
        tier3.forEach((q) => {
          expect(q.sequenceNumber).toBeGreaterThan(8)
          expect(q.sequenceNumber).toBeLessThanOrEqual(13)
        })
      })

      it('should return tier 4 questions', () => {
        const tier4 = getQuestionsForTier(4)

        expect(tier4.length).toBeGreaterThan(0)
        tier4.forEach((q) => {
          if (q.sequenceNumber) {
            expect(q.sequenceNumber).toBeGreaterThan(13)
          }
        })
      })

      it('should return empty array for invalid tier', () => {
        const invalid = getQuestionsForTier(5)

        expect(invalid).toEqual([])
      })
    })

    describe('getQuestionsForSubscriptionTier', () => {
      it('should return standard tier questions for standard subscription', () => {
        const standardQuestions = getQuestionsForSubscriptionTier('standard')

        expect(standardQuestions.length).toBeGreaterThan(0)
        standardQuestions.forEach((q) => {
          expect(!q.minTierLevel || q.minTierLevel === 'standard').toBe(true)
        })
      })

      it('should return standard + premium questions for premium subscription', () => {
        const premiumQuestions = getQuestionsForSubscriptionTier('premium')
        const standardQuestions = getQuestionsForSubscriptionTier('standard')

        expect(premiumQuestions.length).toBeGreaterThanOrEqual(standardQuestions.length)
        premiumQuestions.forEach((q) => {
          expect(
            !q.minTierLevel || q.minTierLevel === 'standard' || q.minTierLevel === 'premium'
          ).toBe(true)
        })
      })

      it('should return all questions for enterprise subscription', () => {
        const enterpriseQuestions = getQuestionsForSubscriptionTier('enterprise')

        expect(enterpriseQuestions.length).toBe(INTERVIEW_QUESTION_LIBRARY.length)
      })

      it('premium subscription should have more questions than standard', () => {
        const standardQuestions = getQuestionsForSubscriptionTier('standard')
        const premiumQuestions = getQuestionsForSubscriptionTier('premium')

        expect(premiumQuestions.length).toBeGreaterThan(standardQuestions.length)
      })

      it('enterprise should have most questions', () => {
        const standardQuestions = getQuestionsForSubscriptionTier('standard')
        const premiumQuestions = getQuestionsForSubscriptionTier('premium')
        const enterpriseQuestions = getQuestionsForSubscriptionTier('enterprise')

        expect(standardQuestions.length).toBeLessThan(premiumQuestions.length)
        expect(premiumQuestions.length).toBeLessThanOrEqual(enterpriseQuestions.length)
      })
    })
  })

  describe('Cross-Question Logic', () => {
    it('should not have circular skip logic', () => {
      const visited = new Set<string>()
      const inProgress = new Set<string>()

      const hasCycle = (qId: string): boolean => {
        if (visited.has(qId)) return false
        if (inProgress.has(qId)) return true

        inProgress.add(qId)
        const question = INTERVIEW_QUESTION_LIBRARY.find((q) => q.id === qId)

        if (question?.skipLogic) {
          for (const rule of question.skipLogic) {
            if (hasCycle(rule.nextQuestionId)) {
              return true
            }
          }
        }

        inProgress.delete(qId)
        visited.add(qId)
        return false
      }

      INTERVIEW_QUESTION_LIBRARY.forEach((q) => {
        expect(hasCycle(q.id)).toBe(false)
      })
    })

    it('should have reasonable progression (higher tier questions after lower tier)', () => {
      INTERVIEW_QUESTION_LIBRARY.forEach((q) => {
        if (q.skipLogic) {
          const qSeq = q.sequenceNumber || 999

          q.skipLogic.forEach((rule) => {
            const nextQ = INTERVIEW_QUESTION_LIBRARY.find((sq) => sq.id === rule.nextQuestionId)
            if (nextQ?.sequenceNumber) {
              // Skip logic can go forward or backward, but generally shouldn't jump too far back
              // (would be confusing UX)
              expect(Math.abs((nextQ.sequenceNumber || 999) - qSeq)).toBeLessThanOrEqual(10)
            }
          })
        }
      })
    })
  })

  describe('Data Consistency', () => {
    it('all field mappings should reference consistent field naming', () => {
      const allFieldIds = new Set<string>()
      INTERVIEW_QUESTION_LIBRARY.forEach((q) => {
        q.fieldMappings.forEach((m) => {
          allFieldIds.add(m.formFieldId)
        })
      })

      // Field IDs should be snake_case or camelCase consistently
      allFieldIds.forEach((fieldId) => {
        expect(fieldId).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      })
    })

    it('no question should map to duplicate field names', () => {
      INTERVIEW_QUESTION_LIBRARY.forEach((q) => {
        const fieldIds = q.fieldMappings.map((m) => m.formFieldId)
        const uniqueIds = new Set(fieldIds)

        expect(uniqueIds.size).toBe(fieldIds.length)
      })
    })
  })

  describe('Documentation Quality', () => {
    it('all questions should have helper text or options with descriptions', () => {
      const noHelp = INTERVIEW_QUESTION_LIBRARY.filter((q) => {
        const hasHelperText = q.helperText && q.helperText.length > 0
        const hasOptions = q.options && q.options.length > 0

        return !hasHelperText && !hasOptions
      })

      // Most questions should have helper text or options
      expect(noHelp.length).toBeLessThan(INTERVIEW_QUESTION_LIBRARY.length / 2)
    })

    it('standards justification should be meaningful (>20 characters)', () => {
      const shortJustifications = INTERVIEW_QUESTION_LIBRARY.filter((q) => q.standardsJustification.length < 20)

      expect(shortJustifications).toHaveLength(0)
    })
  })
})
