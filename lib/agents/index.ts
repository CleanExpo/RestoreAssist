/**
 * Agent Orchestration Framework — public API.
 *
 * Import this module to access the full agent framework.
 * Side-effect: importing registers all agent definitions.
 */

// Register all agent definitions (side-effect imports)
import './definitions'

// Core types
export type {
  AgentSlug,
  AIProviderType,
  AgentConfig,
  AgentCapability,
  AgentHandler,
  TaskInput,
  TaskOutput,
  TaskOutputMetadata,
  ExecutionResult,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  TaskGraphJSON,
  ClassifiedError,
} from './types'

// Registry
export {
  registerAgent,
  getAgent,
  getAgentHandler,
  getAllAgents,
  getAgentsByCapability,
  validateDependencies,
  syncToDatabase,
} from './registry'

// Orchestrator
export {
  createWorkflow,
  getExecutableTasks,
  advanceWorkflow,
  getWorkflowStatus,
  getWorkflowContext,
  cancelWorkflow,
  resumeWorkflow,
} from './orchestrator'

// Executor
export { executeTask, executeBatch } from './executor'

// Workflow templates
export { quickAssessmentWorkflow } from './workflows'

// Logger
export { logAgentEvent, getTaskLogs, getWorkflowLogs } from './logger'

// Error handling
export { classifyError, isRetryable, getRetryDelay } from './error-handler'
