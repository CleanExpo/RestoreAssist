/**
 * Shared fixtures for the RA-7999 durable-engine tests. Real rows in the
 * test:db Postgres; "died" means a claimed row that was abandoned, and expiry
 * means backdating leaseExpiresAt in the database. Nothing sleeps.
 */
import { prisma } from "@/lib/prisma";
import { registerAgent } from "@/lib/agents/registry";
import type {
  AgentConfig,
  AgentHandler,
  AgentSlug,
  TaskOutput,
  WorkflowContext,
} from "@/lib/agents/types";
import type { TaskStatus, WorkflowStatus } from "@prisma/client";

export const RUN = `ra7999-${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2, 6)}`;
export const USER_ID = `${RUN}-user`;
export const OTHER_USER_ID = `${RUN}-other`;

/** Register a test agent in the in-memory registry and the AgentDefinition table. */
export async function registerTestAgent(
  name: string,
  handler: AgentHandler,
  timeoutMs = 15_000,
): Promise<string> {
  const slug = `${RUN}-${name}`;
  const config: AgentConfig = {
    slug: slug as AgentSlug,
    name: `Test agent ${name}`,
    description: "RA-7999 durable engine test agent",
    version: "1.0.0",
    capabilities: [],
    inputSchema: {},
    outputSchema: {},
    defaultProvider: "local",
    maxTokens: 100,
    temperature: 0,
    timeoutMs,
    maxRetries: 3,
    dependsOn: [],
  };
  registerAgent(config, handler);
  await ensureDefinition(slug);
  return slug;
}

export async function ensureDefinition(slug: string): Promise<void> {
  await prisma.agentDefinition.upsert({
    where: { slug },
    create: {
      slug,
      name: slug,
      capabilities: "[]",
      inputSchema: "{}",
      outputSchema: "{}",
      dependsOn: [],
    },
    update: {},
  });
}

export function output(tag: string, tokensUsed = 7): TaskOutput {
  return {
    success: true,
    data: { tag },
    metadata: { provider: "test", model: "test", tokensUsed, durationMs: 0 },
  };
}

export interface TaskSpec {
  key: string;
  agentSlug: string;
  status?: TaskStatus;
  attempts?: number;
  maxRetries?: number;
  dependsOn?: string[];
  input?: Record<string, unknown>;
}

/** Create a workflow and its tasks; returns task ids by key. */
export async function makeWorkflow(
  tasks: TaskSpec[],
  opts: { status?: WorkflowStatus; userId?: string; config?: string } = {},
): Promise<{ workflowId: string; ids: Record<string, string> }> {
  const wf = await prisma.agentWorkflow.create({
    data: {
      name: `${RUN} workflow`,
      userId: opts.userId ?? USER_ID,
      taskGraph: "{}",
      status: opts.status ?? "RUNNING",
      totalTasks: tasks.length,
      config: opts.config ?? null,
      lastActivityAt: new Date(),
    },
  });
  const ids: Record<string, string> = {};
  for (const [i, spec] of tasks.entries()) {
    const row = await prisma.agentTask.create({
      data: {
        workflowId: wf.id,
        agentSlug: spec.agentSlug,
        taskType: spec.key,
        displayName: spec.key,
        sequenceOrder: i,
        dependsOnTaskIds: (spec.dependsOn ?? []).map((k) => ids[k]),
        input: JSON.stringify({
          userId: opts.userId ?? USER_ID,
          data: spec.input ?? {},
        }),
        status: spec.status ?? "READY",
        attempts: spec.attempts ?? 0,
        maxRetries: spec.maxRetries ?? 3,
      },
    });
    ids[spec.key] = row.id;
  }
  return { workflowId: wf.id, ids };
}

export function task(id: string) {
  return prisma.agentTask.findUniqueOrThrow({ where: { id } });
}

export function workflow(id: string) {
  return prisma.agentWorkflow.findUniqueOrThrow({ where: { id } });
}

export function logs(taskId: string) {
  return prisma.agentTaskLog.findMany({
    where: { taskId },
    orderBy: { timestamp: "asc" },
  });
}

export function context(workflowId: string): WorkflowContext {
  return {
    workflowId,
    userId: USER_ID,
    completedOutputs: {},
    sharedState: {},
  };
}

/** Move a claimed task's lease into the past by `ms` (database clock). */
export async function expireLease(taskId: string, ms = 60_000): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "AgentTask"
    SET "leaseExpiresAt" = (now() AT TIME ZONE 'UTC') - (${ms}::double precision * interval '1 millisecond')
    WHERE id = ${taskId}`;
}

/** Shift a claimed task's lease back by `ms`, as if that much time had passed. */
export async function ageLease(taskId: string, ms: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "AgentTask"
    SET "leaseExpiresAt" = "leaseExpiresAt" - (${ms}::double precision * interval '1 millisecond')
    WHERE id = ${taskId}`;
}

/** Write a legacy unleased RUNNING row's startedAt `ms` ago (or NULL). */
export async function setLegacyStartedAgo(
  taskId: string,
  ms: number | null,
): Promise<void> {
  if (ms === null) {
    await prisma.$executeRaw`
      UPDATE "AgentTask" SET status = 'RUNNING', "startedAt" = NULL
      WHERE id = ${taskId}`;
    return;
  }
  await prisma.$executeRaw`
    UPDATE "AgentTask"
    SET status = 'RUNNING',
        "startedAt" = (now() AT TIME ZONE 'UTC') - (${ms}::double precision * interval '1 millisecond')
    WHERE id = ${taskId}`;
}

export async function backdateWorkflowActivity(
  workflowId: string,
  ms: number,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "AgentWorkflow"
    SET "lastActivityAt" = (now() AT TIME ZONE 'UTC') - (${ms}::double precision * interval '1 millisecond')
    WHERE id = ${workflowId}`;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function cleanupWorkflows(): Promise<void> {
  await prisma.agentWorkflow.deleteMany({
    where: { userId: { in: [USER_ID, OTHER_USER_ID] } },
  });
}

export async function cleanup(): Promise<void> {
  await cleanupWorkflows();
  await prisma.agentDefinition.deleteMany({
    where: { slug: { startsWith: RUN } },
  });
}
