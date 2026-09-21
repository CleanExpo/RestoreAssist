/**
 * RA-7614: the quick-assessment workflow passes sharedState.affectedAreas
 * (Prisma-shaped rows: affectedSquareFootage in sq ft) into
 * determineScopeItems, which treats that field as m².
 *
 * Provenance of the unit (unfixed main):
 *   app/api/agents/workflows/route.ts:48  — POST body `config`
 *   app/api/agents/workflows/route.ts:67  — passed to createWorkflow
 *   lib/agents/orchestrator.ts:54         — persisted as workflow.config
 *   lib/agents/task-decomposer.ts:62      — sharedState = params.config
 *   lib/agents/state-manager.ts:145       — sharedState = JSON.parse(config)
 *   lib/agents/workflows/quick-assessment-workflow.ts:72
 *       — scope-generation inputMapping copies ctx.sharedState.affectedAreas
 *   prisma/schema.prisma AffectedArea.affectedSquareFootage — stored in sq ft
 *
 * The same workflow's classification step (line 54) feeds
 * sharedState.affectedSquareFootage to classifyIICRC, which is sq-ft-native.
 * Callers that supply both fields therefore carry sq ft.
 *
 * Found by reading the code. This test must fail on the unfixed handler
 * before resolveAreaSqm is applied.
 */

import { describe, it, expect } from "vitest";
import { sqmToSqft } from "@/lib/units";
import { decompose } from "@/lib/agents/task-decomposer";
import { quickAssessmentWorkflow } from "@/lib/agents/workflows/quick-assessment-workflow";
import { scopeGenerationHandler } from "@/lib/agents/definitions/scope-generation";
import type { TaskInput } from "@/lib/agents/types";

const AREA_SQM = 22;
const AREA_SQFT = sqmToSqft(AREA_SQM);

const livingRoomArea = {
  roomZoneId: "Living room",
  affectedAreaSqm: AREA_SQM,
  affectedSquareFootage: AREA_SQFT,
  surfaceType: "carpet",
  moistureLevel: 10,
};

type ScopeItem = {
  itemType: string;
  quantity?: number;
  unit?: string;
};

function quantifiedItems(scopeItems: ScopeItem[]): ScopeItem[] {
  return scopeItems.filter(
    (item) => item.unit === "m²" && item.quantity != null,
  );
}

describe("quick-assessment workflow — RA-7614 scope units", () => {
  it("selects affectedAreaSqm and writes 22 m² scope quantities, not the ~236.8 sq-ft value", async () => {
    const { tasks } = decompose(quickAssessmentWorkflow, {
      userId: "user-1",
      config: { affectedAreas: [livingRoomArea] },
    });

    const scopeTask = tasks.find((t) => t.agentSlug === "scope-generation");
    expect(scopeTask).toBeDefined();

    const mapped = JSON.parse(scopeTask!.input) as TaskInput;
    expect(mapped.data.affectedAreas).toEqual([livingRoomArea]);

    const output = await scopeGenerationHandler({
      ...mapped,
      context: {
        classification: {
          data: { category: "2", class: "2" },
        },
      },
    });

    expect(output.success).toBe(true);
    const scopeItems = output.data.scopeItems as ScopeItem[];
    const quantified = quantifiedItems(scopeItems);
    expect(quantified.length).toBeGreaterThan(0);
    for (const item of quantified) {
      expect(item.quantity).toBeCloseTo(AREA_SQM, 5);
      expect(item.quantity).not.toBeCloseTo(AREA_SQFT, 0);
    }
  });
});
