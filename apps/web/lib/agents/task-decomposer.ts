/**
 * Task Decomposer — converts a WorkflowDefinition into concrete
 * database-ready task records and a TaskGraphJSON DAG.
 */

import type {
  WorkflowDefinition,
  WorkflowStep,
  TaskGraphJSON,
  TaskGraphNode,
  TaskGraphEdge,
  WorkflowContext,
  TaskInput,
} from './types'

interface DecomposedTask {
  id: string
  agentSlug: string
  taskType: string
  displayName: string
  sequenceOrder: number
  parallelGroup: number
  dependsOnTaskIds: string[]
  input: string // JSON
}

interface DecomposeResult {
  tasks: DecomposedTask[]
  taskGraph: TaskGraphJSON
}

/**
 * Decompose a workflow definition into concrete tasks with a DAG.
 */
export function decompose(
  definition: WorkflowDefinition,
  params: { userId: string; reportId?: string; inspectionId?: string; config?: Record<string, unknown> }
): DecomposeResult {
  const { steps } = definition
  const stepIdToTaskId = new Map<string, string>()
  const tasks: DecomposedTask[] = []
  const nodes: TaskGraphNode[] = []
  const edges: TaskGraphEdge[] = []

  // Generate stable task IDs based on step IDs
  for (const step of steps) {
    stepIdToTaskId.set(step.id, `task_${step.id}`)
  }

  // Build an empty context for input mapping
  const emptyContext: WorkflowContext = {
    workflowId: '',
    userId: params.userId,
    reportId: params.reportId,
    inspectionId: params.inspectionId,
    completedOutputs: {},
    sharedState: params.config ?? {},
  }

  // Sort steps by parallelGroup for deterministic ordering
  const sortedSteps = [...steps].sort(
    (a, b) => a.parallelGroup - b.parallelGroup
  )

  for (let i = 0; i < sortedSteps.length; i++) {
    const step = sortedSteps[i]
    const taskId = stepIdToTaskId.get(step.id)!

    // Resolve dependency step IDs to task IDs
    const dependsOnTaskIds = step.dependsOn
      .map((depStepId) => stepIdToTaskId.get(depStepId))
      .filter((id): id is string => id !== undefined)

    // Generate initial input using the mapping function
    let input: TaskInput
    try {
      input = step.inputMapping(emptyContext)
    } catch {
      input = {
        userId: params.userId,
        reportId: params.reportId,
        inspectionId: params.inspectionId,
        data: {},
      }
    }

    tasks.push({
      id: taskId,
      agentSlug: step.agentSlug,
      taskType: step.taskType,
      displayName: step.displayName,
      sequenceOrder: i,
      parallelGroup: step.parallelGroup,
      dependsOnTaskIds,
      input: JSON.stringify(input),
    })

    nodes.push({
      id: taskId,
      agentSlug: step.agentSlug,
      taskType: step.taskType,
      parallelGroup: step.parallelGroup,
    })

    for (const depTaskId of dependsOnTaskIds) {
      edges.push({ from: depTaskId, to: taskId })
    }
  }

  const taskGraph: TaskGraphJSON = { nodes, edges }

  // Validate the DAG
  const validation = validateDAG(taskGraph)
  if (!validation.valid) {
    throw new Error(`Invalid workflow DAG: ${validation.errors.join(', ')}`)
  }

  return { tasks, taskGraph }
}

/**
 * Validate that the task graph is a valid DAG (no cycles).
 * Uses Kahn's algorithm for topological sort.
 */
export function validateDAG(graph: TaskGraphJSON): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const nodeIds = new Set(graph.nodes.map((n) => n.id))

  // Check all edges reference valid nodes
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Edge references unknown node: ${edge.from}`)
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge references unknown node: ${edge.to}`)
    }
  }

  if (errors.length > 0) return { valid: false, errors }

  // Kahn's algorithm for cycle detection
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of graph.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
    adjacency.get(edge.from)?.push(edge.to)
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  let visited = 0
  while (queue.length > 0) {
    const current = queue.shift()!
    visited++
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  if (visited !== graph.nodes.length) {
    errors.push('Task graph contains a cycle')
    return { valid: false, errors }
  }

  return { valid: true, errors: [] }
}
