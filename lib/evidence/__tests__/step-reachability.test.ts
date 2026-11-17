/**
 * RA-8388 criterion `reachable-minimums`.
 *
 * A mandatory step whose minimum exceeds what the capture screen will let a
 * technician capture is an unsatisfiable gate: the workflow reports a gap, the
 * technician captures everything the screen offers, the gap stays, and the job
 * cannot be submitted. That is what DRC NSW met on job NIR-2026-11-B3F306.
 *
 * The negative control is the point of this file. Asserting that today's rule
 * reaches today's minimums would pass just as happily if the rule were
 * deleted, because the current policy is uncapped and `x >= 5` is true for
 * `Infinity` however the ceiling is computed. So every assertion is also run
 * under `ONE_PER_CLASS` - the exact rule the capture page used to enforce -
 * and that run MUST find unreachable steps. If it ever stops finding them,
 * this file has stopped testing anything and says so.
 *
 * No minimum is lowered anywhere in this change. IICRC S500:2021 §10.2.
 */
import { describe, it, expect } from "vitest";
import type { EvidenceClass } from "@prisma/client";

import {
  WORKFLOW_TEMPLATES,
  type WorkflowStepDefinition,
  type JobType,
} from "@/lib/evidence/workflow-definitions";
import {
  canCaptureAnother,
  stepCaptureCeiling,
  stepMinimumIsReachable,
  CAPTURES_PER_CLASS_UNCAPPED,
  type CapturesPerClassPolicy,
} from "@/lib/evidence/step-reachability";

/**
 * The defect, preserved as a control rather than described in a comment.
 *
 * `hasCaptured ? <CheckCircle2 /> : <Button>Capture</Button>` allowed exactly
 * one item per class per step. This is that rule as a policy function.
 */
const ONE_PER_CLASS: CapturesPerClassPolicy = () => 1;

const everyStep = (): Array<{ jobType: JobType; step: WorkflowStepDefinition }> =>
  (Object.keys(WORKFLOW_TEMPLATES) as JobType[]).flatMap((jobType) =>
    WORKFLOW_TEMPLATES[jobType].steps.map((step) => ({ jobType, step })),
  );

const everyMandatoryStep = () => everyStep().filter(({ step }) => step.isMandatory);

describe("step reachability - the current rule", () => {
  it("has mandatory steps to check, in more than one workflow", () => {
    // Guards the whole file: an empty iteration passes every `expect` below
    // without observing anything.
    const mandatory = everyMandatoryStep();
    expect(mandatory.length).toBeGreaterThan(20);
    expect(new Set(mandatory.map((m) => m.jobType)).size).toBeGreaterThan(5);
  });

  it("every mandatory step of every workflow can reach its own minimum", () => {
    const unreachable = everyMandatoryStep()
      .filter(({ step }) => !stepMinimumIsReachable(step))
      .map(
        ({ jobType, step }) =>
          `${jobType}/${step.stepKey}: ceiling ${stepCaptureCeiling(step)} < minimum ${step.minimumEvidenceCount}`,
      );

    expect(unreachable).toEqual([]);
  });

  it("offers at least one evidence class on every mandatory step", () => {
    // A ceiling of zero is a different fault from a cap set too low: the step
    // asks for evidence and gives no way to provide any.
    for (const { jobType, step } of everyMandatoryStep()) {
      const classCount =
        step.requiredEvidenceClasses.length + step.optionalEvidenceClasses.length;
      expect(
        classCount,
        `${jobType}/${step.stepKey} offers no evidence class`,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps the Capture control available after an item is captured", () => {
    // The client-visible behaviour: the button must not turn into a tick.
    expect(canCaptureAnother("MOISTURE_READING" as EvidenceClass, 0)).toBe(true);
    expect(canCaptureAnother("MOISTURE_READING" as EvidenceClass, 1)).toBe(true);
    expect(canCaptureAnother("MOISTURE_READING" as EvidenceClass, 4)).toBe(true);
    expect(canCaptureAnother("AMBIENT_ENVIRONMENTAL" as EvidenceClass, 1)).toBe(
      true,
    );
    expect(canCaptureAnother("PHOTO_DAMAGE" as EvidenceClass, 2)).toBe(true);
  });

  it("pins the moisture survey minimum at five - IICRC S500:2021 section 10.2", () => {
    // Lowering a minimum to make a gate pass is forbidden. If this literal
    // ever has to change, it changes here, deliberately, with the standard
    // named - not quietly inside a workflow template.
    const moisture = WORKFLOW_TEMPLATES.WATER_DAMAGE.steps.find(
      (s) => s.stepKey === "moisture_survey",
    );
    expect(moisture).toBeDefined();
    expect(moisture!.minimumEvidenceCount).toBe(5);
    expect(moisture!.requiredEvidenceClasses).toContain("MOISTURE_READING");
    expect(stepMinimumIsReachable(moisture!)).toBe(true);
  });

  it("pins the environmental readings minimum at two, both classes metadata", () => {
    const env = WORKFLOW_TEMPLATES.WATER_DAMAGE.steps.find(
      (s) => s.stepKey === "environmental_readings",
    );
    expect(env).toBeDefined();
    expect(env!.minimumEvidenceCount).toBe(2);
    expect(stepMinimumIsReachable(env!)).toBe(true);
  });
});

describe("step reachability - negative control: the rule this change removed", () => {
  it("finds mandatory steps that the one-per-class lock made unsatisfiable", () => {
    const unreachable = everyMandatoryStep()
      .filter(({ step }) => !stepMinimumIsReachable(step, ONE_PER_CLASS))
      .map(({ jobType, step }) => `${jobType}/${step.stepKey}`);

    // If this ever returns nothing, the ceiling computation has stopped
    // depending on the policy and the positive assertions above are vacuous.
    expect(unreachable.length).toBeGreaterThan(0);
  });

  it("proves the moisture survey was unsatisfiable: ceiling 3, minimum 5", () => {
    const moisture = WORKFLOW_TEMPLATES.WATER_DAMAGE.steps.find(
      (s) => s.stepKey === "moisture_survey",
    )!;
    // MOISTURE_READING + THERMAL_IMAGE + FLOOR_PLAN, one each.
    expect(stepCaptureCeiling(moisture, ONE_PER_CLASS)).toBe(3);
    expect(moisture.minimumEvidenceCount).toBe(5);
    expect(stepMinimumIsReachable(moisture, ONE_PER_CLASS)).toBe(false);
  });

  it("proves the lock blocked a second capture of the same class", () => {
    expect(
      canCaptureAnother("MOISTURE_READING" as EvidenceClass, 1, ONE_PER_CLASS),
    ).toBe(false);
    expect(
      canCaptureAnother("MOISTURE_READING" as EvidenceClass, 0, ONE_PER_CLASS),
    ).toBe(true);
  });

  it("the uncapped policy is genuinely uncapped", () => {
    expect(CAPTURES_PER_CLASS_UNCAPPED("MOISTURE_READING" as EvidenceClass)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

/**
 * Recorded, not fixed here.
 *
 * `validateWorkflowEvidence` compares a step's TOTAL evidence count to its
 * minimum and never consults `requiredEvidenceClasses`, which it selects but
 * does not read. So five thermal images satisfy `moisture_survey` as far as
 * the workflow gate is concerned, while `validateSubmissionPayload` then
 * refuses the submission for having no `MoistureReading` rows.
 *
 * It is left alone deliberately. Making the workflow gate class-aware makes
 * steps HARDER to pass, which is the opposite of this change's purpose and
 * would need its own evidence that no in-flight job is relying on the current
 * behaviour. The submission validator already catches the case, so the job
 * cannot actually be submitted on the wrong evidence - the cost is a confusing
 * message, not a bad record. Named limit, AMENDMENT 03 §R.
 */
describe("named limit: the workflow gate counts items, not classes", () => {
  it("documents that a step minimum is satisfied by any mix of its classes", () => {
    const moisture = WORKFLOW_TEMPLATES.WATER_DAMAGE.steps.find(
      (s) => s.stepKey === "moisture_survey",
    )!;
    // The optional classes count toward the same minimum as the required one.
    expect(moisture.optionalEvidenceClasses.length).toBeGreaterThan(0);
    expect(stepCaptureCeiling(moisture, ONE_PER_CLASS)).toBe(
      moisture.requiredEvidenceClasses.length +
        moisture.optionalEvidenceClasses.length,
    );
  });
});
