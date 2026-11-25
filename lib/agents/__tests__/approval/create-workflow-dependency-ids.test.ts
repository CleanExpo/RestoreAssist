/**
 * RA-8000 (separate bug found while building slice 1b): createWorkflow stored
 * the decomposer's step-based names ("task_<step>") in dependsOnTaskIds, but
 * the task rows get their own ids, so markTasksReady could never see a
 * dependency complete and no dependent task was ever promoted.
 *
 * Existing stored workflows created before this fix keep the old ids and stay
 * stuck; this test covers new workflows only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createWorkflow, quickAssessmentWorkflow } from "@/lib/agents";
import type { AgentSlug, WorkflowDefinition } from "@/lib/agents/types";
import { USER_ID, cleanup, output, registerTestAgent } from "../durable/fixtures";

let slug = "";

describe.skipIf(!process.env.DATABASE_URL)("createWorkflow dependency ids", () => {
  beforeAll(async () => {
    slug = await registerTestAgent("dep-ids", async () => output("x"));
  });
  afterAll(async () => {
    await cleanup();
  });

  it("stores the ids of real task rows, never step-based names", async () => {
    const step = (id: string, group: number, dependsOn: string[]) => ({
      id,
      agentSlug: slug as AgentSlug,
      taskType: id,
      displayName: id,
      parallelGroup: group,
      dependsOn,
      optional: false,
      inputMapping: () => ({ userId: USER_ID, data: {} }),
    });
    const definition: WorkflowDefinition = {
      name: "dep ids",
      description: "dep ids",
      steps: [step("a", 0, []), step("b", 1, ["a"]), step("c", 2, ["a", "b"])],
    };
    const { workflowId } = await createWorkflow(definition, { userId: USER_ID });
    const rows = await prisma.agentTask.findMany({ where: { workflowId } });
    const byType = new Map(rows.map((r) => [r.taskType, r]));
    const ids = new Set(rows.map((r) => r.id));

    for (const row of rows) {
      for (const dep of row.dependsOnTaskIds) expect(ids.has(dep)).toBe(true);
    }
    expect(byType.get("b")!.dependsOnTaskIds).toEqual([byType.get("a")!.id]);
    expect([...byType.get("c")!.dependsOnTaskIds].sort()).toEqual(
      [byType.get("a")!.id, byType.get("b")!.id].sort(),
    );
  });

  it("the real quick-assessment template pauses before classification only (rollback R0 is removing this flag)", async () => {
    const { workflowId } = await createWorkflow(quickAssessmentWorkflow, { userId: USER_ID });
    const rows = await prisma.agentTask.findMany({ where: { workflowId } });
    const flagged = rows.filter((r) => r.requiresApproval).map((r) => r.taskType);
    expect(flagged).toEqual(["classify"]);
    const analyze = rows.find((r) => r.taskType === "analyze")!;
    const classify = rows.find((r) => r.taskType === "classify")!;
    const generate = rows.find((r) => r.taskType === "generate")!;
    expect(analyze.status).toBe("READY");
    expect(classify.dependsOnTaskIds).toEqual([analyze.id]);
    expect(generate.dependsOnTaskIds).toEqual([classify.id]);
  });
});
