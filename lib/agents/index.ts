/**
 * Agent Orchestration Framework — public API.
 *
 * Import this module to access the full agent framework.
 * Side-effect: importing registers all agent definitions.
 */

// Register all agent definitions (side-effect imports)
import "./definitions";

// Core types
export type {
  AgentSlug,
  AIProviderType,
  AgentConfig,
  AgentCapability,
  AgentHandler,
  AgentHandlerOptions,
  TaskInput,
  TaskOutput,
  TaskOutputMetadata,
  ExecutionResult,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  TaskGraphJSON,
  ClassifiedError,
} from "./types";

// Registry
export {
  registerAgent,
  getAgent,
  getAgentHandler,
  getAllAgents,
  getAgentsByCapability,
  validateDependencies,
  syncToDatabase,
} from "./registry";

// Orchestrator
export {
  createWorkflow,
  getExecutableTasks,
  advanceWorkflow,
  getWorkflowStatus,
  getWorkflowContext,
  cancelWorkflow,
  resumeWorkflow,
} from "./orchestrator";

// Executor
export { executeTask, executeBatch, claimTask } from "./executor";

// Leases and the expired-lease sweep (RA-7999)
export {
  sweepExpiredLeases,
  liveLeaseSql,
  LEASE_MARGIN_MS,
  LEGACY_UNLEASED_AFTER_MS,
} from "./lease";
export type { SweepResult } from "./lease";

// Workflow templates
export { quickAssessmentWorkflow } from "./workflows";

// Logger
export { logAgentEvent, getTaskLogs, getWorkflowLogs } from "./logger";

// Error handling
export { classifyError, isRetryable, getRetryDelay } from "./error-handler";
