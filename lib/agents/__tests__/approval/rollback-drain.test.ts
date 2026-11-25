/**
 * RA-8000 AC5d (partial) — the R1 rollback drain, run for real against
 * Postgres after the 1b migrations. Pause one workflow through 1b code, run the
 * committed drain, and assert nothing a pre-1b client cannot read is left.
 * Running it twice proves it is idempotent. The step that reads the drained
 * workflow with a client generated from the pre-1b schema is NOT in this test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { advanceWorkflow, createWorkflow, executeTask } from "@/lib/agents";
import type { AgentSlug, WorkflowDefinition } from "@/lib/agents/types";
import { USER_ID, cleanup, context, output, registerTestAgent } from "../durable/fixtures";

const DRAIN = readFileSync(
  join(process.cwd(), "scripts/ops/ra-8000-rollback-drain.sql"),
  "utf8",
)
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

let slug = "";

describe.skipIf(!process.env.DATABASE_URL)("RA-8000 rollback drain", () => {
  beforeAll(async () => {
    slug = await registerTestAgent("drain", async () => output("x"));
  });
  afterAll(async () => {
    await cleanup();
  });

  it("leaves no AWAITING_APPROVAL task or PAUSED workflow of the run, and a second run changes nothing", async () => {
    const step = (id: string, group: number, dependsOn: string[], requiresApproval = false) => ({
      id,
      agentSlug: slug as AgentSlug,
      taskType: id,
      displayName: id,
      parallelGroup: group,
      dependsOn,
      optional: false,
      requiresApproval,
      inputMapping: () => ({ userId: USER_ID, data: {} }),
    });
    const definition: WorkflowDefinition = {
      name: "drain",
      description: "drain",
      steps: [step("a", 0, []), step("b", 1, ["a"], true), step("c", 2, ["b"])],
    };
    const { workflowId } = await createWorkflow(definition, { userId: USER_ID });
    for (let i = 0; i < 2; i++) {
      const { nextExecutable } = await advanceWorkflow(workflowId);
      for (const t of nextExecutable) await executeTask(t, context(workflowId));
    }
    const before = await prisma.agentTask.findMany({ where: { workflowId } });
    expect(before.map((t) => t.status).sort()).toEqual(["AWAITING_APPROVAL", "COMPLETED", "PENDING"]);

    await prisma.$executeRawUnsafe(DRAIN);

    const rows = await prisma.agentTask.findMany({ where: { workflowId }, orderBy: { sequenceOrder: "asc" } });
    expect(rows.find((r) => r.taskType === "b")).toMatchObject({ status: "CANCELLED", errorCode: "ROLLBACK_1B" });
    expect(rows.find((r) => r.taskType === "c")).toMatchObject({ status: "SKIPPED", errorCode: "ROLLBACK_1B" });
    expect(rows.find((r) => r.taskType === "a")?.status).toBe("COMPLETED");
    const wf = await prisma.agentWorkflow.findUniqueOrThrow({ where: { id: workflowId } });
    expect(wf.status).toBe("CANCELLED");
    expect(wf.completedAt).not.toBeNull();
    expect(await prisma.agentTask.count({ where: { workflowId, status: "AWAITING_APPROVAL" } })).toBe(0);

    await prisma.$executeRawUnsafe(DRAIN);
    const again = await prisma.agentTask.findMany({ where: { workflowId }, orderBy: { sequenceOrder: "asc" } });
    expect(again.map((r) => [r.status, r.errorCode])).toEqual(rows.map((r) => [r.status, r.errorCode]));
  });
});
