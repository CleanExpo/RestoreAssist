/**
 * Agent Definitions barrel export.
 * Importing this module auto-registers all agents via side-effects.
 */

// Each import triggers registerAgent() at module scope
import './report-analysis'
import './classification'
import './scope-generation'

export { reportAnalysisConfig } from './report-analysis'
export { classificationConfig } from './classification'
export { scopeGenerationConfig } from './scope-generation'
