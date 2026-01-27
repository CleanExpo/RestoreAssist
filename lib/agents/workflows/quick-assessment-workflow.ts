/**
 * Quick Assessment Workflow — the simplest workflow to prove the framework.
 *
 * DAG:
 *   Group 0: report-analysis (no dependencies)
 *   Group 1: classification (depends on report-analysis)
 *   Group 2: scope-generation (depends on classification)
 *
 * This workflow takes a technician's field notes and produces:
 * 1. Structured analysis of the report
 * 2. IICRC S500 category/class classification
 * 3. Scope of works items
 */

import type { WorkflowDefinition } from '../types'

export const quickAssessmentWorkflow: WorkflowDefinition = {
  name: 'Quick Assessment',
  description: 'Analyzes a technician report, classifies the damage, and generates scope of works.',
  steps: [
    {
      id: 'report-analysis',
      agentSlug: 'report-analysis',
      taskType: 'analyze',
      displayName: 'Analyzing technician report...',
      parallelGroup: 0,
      dependsOn: [],
      optional: false,
      inputMapping: (ctx) => ({
        userId: ctx.userId,
        reportId: ctx.reportId,
        data: {
          reportId: ctx.reportId,
          technicianNotes: ctx.sharedState.technicianNotes ?? '',
          propertyAddress: ctx.sharedState.propertyAddress ?? '',
          propertyPostcode: ctx.sharedState.propertyPostcode ?? '',
        },
      }),
    },
    {
      id: 'classification',
      agentSlug: 'classification',
      taskType: 'classify',
      displayName: 'Classifying damage (IICRC S500)...',
      parallelGroup: 1,
      dependsOn: ['report-analysis'],
      optional: false,
      inputMapping: (ctx) => ({
        userId: ctx.userId,
        reportId: ctx.reportId,
        data: {
          waterSource: ctx.sharedState.waterSource ?? '',
          affectedSquareFootage: ctx.sharedState.affectedSquareFootage ?? 100,
          moistureReadings: ctx.sharedState.moistureReadings,
          environmentalData: ctx.sharedState.environmentalData,
        },
      }),
    },
    {
      id: 'scope-generation',
      agentSlug: 'scope-generation',
      taskType: 'generate',
      displayName: 'Generating scope of works...',
      parallelGroup: 2,
      dependsOn: ['classification'],
      optional: false,
      inputMapping: (ctx) => ({
        userId: ctx.userId,
        reportId: ctx.reportId,
        data: {
          affectedAreas: ctx.sharedState.affectedAreas ?? [],
        },
      }),
    },
  ],
}
