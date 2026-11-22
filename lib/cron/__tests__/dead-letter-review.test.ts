/**
 * RA-8429: the dead-letter review must not let tasks in a workflow it will
 * never re-queue (a CANCELLED workflow) fill its oldest-first batch.
 *
 * The fake below is stateful and reads the `where` clause generically, so it
 * honours whatever filter the query carries; it has no knowledge of RA-8429.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tasks: [] as Record<string, unknown>[],
  workflows: [] as Record<string, unknown>[],
}));

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "workflow") {
      const wf = db.workflows.find((w) => w.id === row.workflowId);
      return !!wf && matches(wf, cond as Row);
    }
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; lt?: unknown };
      if (c.in !== undefined && !c.in.includes(value)) return false;
      if (c.lt !== undefined && !((value as number | Date) < (c.lt as number | Date))) {
        return false;
      }
      return true;
    }
    return value === cond;
  });
}

vi.mock("@/lib/prisma", () => {
  const agentTask = {
    findMany: async (args: {
      where?: Row;
      take?: number;
      orderBy?: { updatedAt?: "asc" | "desc" };
      include?: { workflow?: unknown };
    }) => {
      let rows = db.tasks.filter((t) => matches(t, args.where));
      if (args.orderBy?.updatedAt === "asc") {
        rows = [...rows].sort(
          (a, b) => (a.updatedAt as Date).getTime() - (b.updatedAt as Date).getTime(),
        );
      }
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      return rows.map((t) => ({
        ...t,
        workflow: args.include?.workflow
          ? { status: db.workflows.find((w) => w.id === t.workflowId)?.status }
          : undefined,
      }));
    },
    updateMany: async (args: { where?: Row; data: Row }) => {
      const hit = db.tasks.filter((t) => matches(t, args.where));
      for (const t of hit) Object.assign(t, args.data, { updatedAt: new Date() });
      return { count: hit.length };
    },
  };
  const agentWorkflow = {
    updateMany: async (args: { where?: Row; data: Row }) => {
      const hit = db.workflows.filter((w) => matches(w, args.where));
      for (const w of hit) Object.assign(w, args.data);
      return { count: hit.length };
    },
    update: async (args: { where: { id: string }; data: Row }) => {
      const wf = db.workflows.find((w) => w.id === args.where.id);
      if (!wf) throw new Error("workflow not found");
      Object.assign(wf, args.data);
      return wf;
    },
  };
  const client = {
    agentTask,
    agentWorkflow,
    // RA-8000: the workflow row lock; the real lock is tested in workflow-lock-order.test.ts.
    $queryRaw: async () => [],
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return { prisma: client };
});

vi.mock("@/lib/agents", () => ({ logAgentEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/agents/lease", () => ({ unskipUpstreamFailed: vi.fn(async () => 0) }));

import { reviewDeadLetterTasks } from "../dead-letter-review";

const HOUR = 60 * 60 * 1000;

function deadLetter(id: string, workflowId: string, ageMs: number): Row {
  return {
    id,
    workflowId,
    status: "DEAD_LETTER",
    errorCode: "TIMEOUT",
    errorMessage: "timed out",
    attempts: 3,
    updatedAt: new Date(Date.now() - ageMs),
  };
}

describe("RA-8429 dead-letter review and cancelled workflows", () => {
  beforeEach(() => {
    db.tasks = [];
    db.workflows = [];
  });

  it("re-queues a task in a FAILED workflow even when 20 older tasks sit in CANCELLED workflows", async () => {
    for (let i = 0; i < 20; i++) {
      db.workflows.push({ id: `wf-cancelled-${i}`, status: "CANCELLED" });
      // Older than the FAILED-workflow task, so oldest-first puts them ahead.
      db.tasks.push(deadLetter(`t-cancelled-${i}`, `wf-cancelled-${i}`, 48 * HOUR + i * 1000));
    }
    db.workflows.push({ id: "wf-failed", status: "FAILED" });
    db.tasks.push(deadLetter("t-failed", "wf-failed", 2 * HOUR));

    await reviewDeadLetterTasks();

    const failedWorkflowTask = db.tasks.find((t) => t.id === "t-failed");
    expect(failedWorkflowTask?.status).toBe("READY");
    expect(db.workflows.find((w) => w.id === "wf-failed")?.status).toBe("RUNNING");
    // Tasks in cancelled workflows are never re-queued.
    expect(
      db.tasks.filter((t) => String(t.id).startsWith("t-cancelled-") && t.status !== "DEAD_LETTER"),
    ).toHaveLength(0);
  });
});
