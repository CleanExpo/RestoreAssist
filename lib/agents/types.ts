/**
 * Core type definitions for the Agent Orchestration Framework.
 *
 * Agents are specialized workers (AI-powered or local) that perform
 * discrete tasks within a workflow DAG. The orchestrator decomposes
 * complex requests into tasks, schedules them respecting dependencies,
 * and executes them via a pull-based polling model.
 */

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

export type AgentSlug =
  | 'report-analysis'
  | 'standards-compliance'
  | 'cost-estimation'
  | 'gap-analysis'
  | 'scope-generation'
  | 'equipment-matrix'
  | 'classification'
  | 'citation-extraction'
  | 'qa-review'
  | 'client-communication'
  | 'insurance-compliance'
  | 'photo-analysis'
  | 'psychrometric-calculation'
  | 'regulatory-compliance'

export type AIProviderType = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'local'

// ---------------------------------------------------------------------------
// Agent configuration (code-level source of truth)
// ---------------------------------------------------------------------------

export interface AgentCapability {
  name: string
  description: string
  inputFields: string[]
  outputFields: string[]
}

export interface AgentConfig {
  slug: AgentSlug
  name: string
  description: string
  version: string
  capabilities: AgentCapability[]
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  defaultProvider: AIProviderType
  defaultModel?: string
  maxTokens: number
  temperature: number
  timeoutMs: number
  maxRetries: number
  dependsOn: AgentSlug[]
}

// ---------------------------------------------------------------------------
// Task I/O
// ---------------------------------------------------------------------------

export interface TaskInput {
  userId: string
  reportId?: string
  inspectionId?: string
  data: Record<string, unknown>
  context?: Record<string, unknown>
}

export interface TaskOutputMetadata {
  provider: string
  model: string
  tokensUsed: number
  durationMs: number
  cost?: number
}

export interface TaskOutput {
  success: boolean
  data: Record<string, unknown>
  metadata: TaskOutputMetadata
  errors?: Array<{
    code: string
    message: string
    recoverable: boolean
  }>
}

export interface ExecutionResult {
  taskId: string
  status: 'COMPLETED' | 'FAILED' | 'RETRY'
  output?: TaskOutput
  error?: {
    code: string
    message: string
    retryable: boolean
    attempt: number
    maxRetries: number
  }
}

// ---------------------------------------------------------------------------
// Workflow definitions (templates)
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  id: string
  agentSlug: AgentSlug
  taskType: string
  displayName: string
  parallelGroup: number
  dependsOn: string[]            // Step IDs that must complete first
  inputMapping: (context: WorkflowContext) => TaskInput
  optional: boolean              // If true, failure doesn't block workflow
}

export interface WorkflowDefinition {
  name: string
  description: string
  steps: WorkflowStep[]
}

// ---------------------------------------------------------------------------
// Workflow execution context
// ---------------------------------------------------------------------------

export interface WorkflowContext {
  workflowId: string
  userId: string
  reportId?: string
  inspectionId?: string
  completedOutputs: Record<string, TaskOutput>  // agentSlug -> output
  sharedState: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Task graph (persisted as JSON in AgentWorkflow.taskGraph)
// ---------------------------------------------------------------------------

export interface TaskGraphNode {
  id: string
  agentSlug: AgentSlug
  taskType: string
  parallelGroup: number
}

export interface TaskGraphEdge {
  from: string
  to: string
}

export interface TaskGraphJSON {
  nodes: TaskGraphNode[]
  edges: TaskGraphEdge[]
}

// ---------------------------------------------------------------------------
// Agent handler function signature
// ---------------------------------------------------------------------------

export type AgentHandler = (input: TaskInput) => Promise<TaskOutput>

// ---------------------------------------------------------------------------
// Classified error (from error-handler)
// ---------------------------------------------------------------------------

export interface ClassifiedError {
  code: 'TIMEOUT' | 'RATE_LIMIT' | 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'AI_PROVIDER_ERROR' | 'UNKNOWN'
  message: string
  retryable: boolean
  retryAfterMs?: number
}
