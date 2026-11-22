/**
 * RA-8429: a cancelled workflow must hold no retryable task. Before this fix
 * cancelWorkflow cancelled only PENDING and READY tasks, so a DEAD_LETTER task
 * kept its retryable errorCode for the 90 days until cleanup deleted it.
 *
 * The fake is stateful and reads `where` generically; assertions are on the
 * resulting rows, not on the call arguments.
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
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; notIn?: unknown[] };
      return (
        (c.in === undefined || c.in.includes(value)) &&
        (c.notIn === undefined || !c.notIn.includes(value))
      );
    }
    return value === cond;
  });
}

vi.mock("@/lib/prisma", () => {
  const client = {
    agentTask: {
      updateMany: async (args: { where?: Row; data: Row }) => {
        const hit = db.tasks.filter((t) => matches(t, args.where));
        for (const t of hit) Object.assign(t, args.data);
        return { count: hit.length };
      },
    },
    agentWorkflow: {
      // RA-8000: the status write is a compare-and-swap (updateMany).
      updateMany: async (args: { where?: Row; data: Row }) => {
        const hit = db.workflows.filter((w) => matches(w, args.where));
        for (const w of hit) Object.assign(w, args.data);
        return { count: hit.length };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return { prisma: client };
});

import { cancelWorkflow } from "../orchestrator";

describe("RA-8429 cancelWorkflow", () => {
  beforeEach(() => {
    db.workflows = [{ id: "wf-1", status: "PARTIALLY_FAILED" }];
    db.tasks = [
      { id: "t-done", workflowId: "wf-1", status: "COMPLETED" },
      { id: "t-dead", workflowId: "wf-1", status: "DEAD_LETTER", errorCode: "TIMEOUT" },
      { id: "t-failed", workflowId: "wf-1", status: "FAILED", errorCode: "RATE_LIMIT" },
      { id: "t-ready", workflowId: "wf-1", status: "READY" },
      { id: "t-pending", workflowId: "wf-1", status: "PENDING" },
      { id: "t-other-wf", workflowId: "wf-2", status: "DEAD_LETTER", errorCode: "TIMEOUT" },
    ];
  });

  it("leaves no DEAD_LETTER or FAILED task in the cancelled workflow", async () => {
    await cancelWorkflow("wf-1");

    const inWorkflow = db.tasks.filter((t) => t.workflowId === "wf-1");
    expect(inWorkflow.filter((t) => t.status === "DEAD_LETTER")).toHaveLength(0);
    expect(inWorkflow.filter((t) => t.status === "FAILED")).toHaveLength(0);
    expect(db.tasks.find((t) => t.id === "t-dead")?.status).toBe("CANCELLED");
    expect(db.tasks.find((t) => t.id === "t-failed")?.status).toBe("CANCELLED");
    expect(db.tasks.find((t) => t.id === "t-ready")?.status).toBe("CANCELLED");
    expect(db.tasks.find((t) => t.id === "t-pending")?.status).toBe("CANCELLED");
    // Completed work and other workflows are untouched.
    expect(db.tasks.find((t) => t.id === "t-done")?.status).toBe("COMPLETED");
    expect(db.tasks.find((t) => t.id === "t-other-wf")?.status).toBe("DEAD_LETTER");
    expect(db.workflows[0].status).toBe("CANCELLED");
  });
});
