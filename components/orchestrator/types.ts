/**
 * Orchestrator Component Type Definitions
 *
 * This file contains all TypeScript type definitions used across
 * the RestoreAssist Orchestrator dashboard components.
 */

/**
 * Available input methods for starting a workflow
 */
export type InputMethod = 'text' | 'pdf' | 'word' | 'api'

/**
 * Phase state indicators
 */
export type PhaseState = 'complete' | 'active' | 'upcoming'

/**
 * Orchestrator workflow phases
 */
export type OrchestratorPhase = 'initiation' | 'processing' | 'qa' | 'output'

/**
 * Workflow status
 */
export type WorkflowStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'

/**
 * Phase color configuration
 */
export interface PhaseColorConfig {
  DEFAULT: string
  light: string
  dark: string
}

/**
 * Complete phase configuration
 */
export interface PhaseConfig {
  id: OrchestratorPhase
  label: string
  description: string
  color: PhaseColorConfig
}

/**
 * Phase progress information
 */
export interface PhaseProgress {
  currentPhase: OrchestratorPhase
  completedPhases: OrchestratorPhase[]
  progressPercentage: number
  estimatedTimeRemaining?: string
}

/**
 * Workflow metadata
 */
export interface WorkflowMetadata {
  id: string
  title: string
  inputMethod: InputMethod
  status: WorkflowStatus
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
  userId: string
}

/**
 * Active workflow information
 */
export interface ActiveWorkflow extends WorkflowMetadata {
  progress: PhaseProgress
  currentStepDescription?: string
}

/**
 * Orchestrator dashboard statistics
 */
export interface OrchestratorStats {
  activeProcesses: number
  completedToday: number
  averageTimePerReport: string
  iicrcCompliantPercentage: number
}

/**
 * Input method card configuration
 */
export interface InputMethodCard {
  id: InputMethod
  title: string
  description: string
  icon: any // Lucide icon component
  badge?: string
  gradient: string
  iconColor: string
  enabled?: boolean
}

/**
 * Workflow step information
 */
export interface WorkflowStep {
  phase: OrchestratorPhase
  stepNumber: number
  description: string
  startedAt?: Date
  completedAt?: Date
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  errorMessage?: string
}

/**
 * Complete workflow data
 */
export interface WorkflowData {
  metadata: WorkflowMetadata
  steps: WorkflowStep[]
  progress: PhaseProgress
  inputData?: any
  outputData?: any
  errors?: string[]
}

/**
 * Dashboard filter options
 */
export interface DashboardFilters {
  status?: WorkflowStatus[]
  inputMethod?: InputMethod[]
  dateRange?: {
    start: Date
    end: Date
  }
  phase?: OrchestratorPhase[]
}

/**
 * Workflow analytics data
 */
export interface WorkflowAnalytics {
  totalWorkflows: number
  completionRate: number
  averageDuration: number
  failureRate: number
  mostUsedInputMethod: InputMethod
  phaseBreakdown: Record<OrchestratorPhase, number>
  dailyCompletions: Array<{
    date: string
    count: number
  }>
}

/**
 * Error information
 */
export interface WorkflowError {
  code: string
  message: string
  phase: OrchestratorPhase
  timestamp: Date
  recoverable: boolean
  suggestion?: string
}

/**
 * User preferences for orchestrator
 */
export interface OrchestratorPreferences {
  defaultInputMethod?: InputMethod
  autoSaveEnabled: boolean
  notificationsEnabled: boolean
  preferredOutputFormat: 'pdf' | 'docx' | 'both'
  showProgressDetails: boolean
}

/**
 * API response types
 */
export interface OrchestratorApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: Date
}

/**
 * Workflow creation payload
 */
export interface CreateWorkflowPayload {
  inputMethod: InputMethod
  title?: string
  inputData?: any
  metadata?: Record<string, any>
}

/**
 * Workflow update payload
 */
export interface UpdateWorkflowPayload {
  workflowId: string
  updates: {
    status?: WorkflowStatus
    progress?: Partial<PhaseProgress>
    currentStepDescription?: string
    outputData?: any
  }
}

/**
 * Phase color constants for easy access
 */
export const PHASE_COLORS: Record<OrchestratorPhase, PhaseColorConfig> = {
  initiation: {
    DEFAULT: '#2563EB',
    light: '#DBEAFE',
    dark: '#1E3A8A'
  },
  processing: {
    DEFAULT: '#9333EA',
    light: '#F3E8FF',
    dark: '#581C87'
  },
  qa: {
    DEFAULT: '#06B6D4',
    light: '#CFFAFE',
    dark: '#164E63'
  },
  output: {
    DEFAULT: '#10B981',
    light: '#D1FAE5',
    dark: '#064E3B'
  }
}

/**
 * Default phase configurations
 */
export const DEFAULT_PHASES: PhaseConfig[] = [
  {
    id: 'initiation',
    label: 'Initiation',
    description: 'Input collection & validation',
    color: PHASE_COLORS.initiation
  },
  {
    id: 'processing',
    label: 'Processing',
    description: 'AI analysis & report generation',
    color: PHASE_COLORS.processing
  },
  {
    id: 'qa',
    label: 'Q&A',
    description: 'Quality assurance & review',
    color: PHASE_COLORS.qa
  },
  {
    id: 'output',
    label: 'Output',
    description: 'Final report delivery',
    color: PHASE_COLORS.output
  }
]
