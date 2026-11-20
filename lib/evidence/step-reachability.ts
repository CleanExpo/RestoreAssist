/**
 * RA-8388 AMENDMENT 01 §C / AMENDMENT 03 §N: can a step actually reach its
 * own minimum?
 *
 * `moisture_survey` asks for five evidence items. The capture page showed a
 * Capture button only while a class had NO captured item, and a tick once it
 * had one:
 *
 *     hasCaptured ? <CheckCircle2 /> : <Button>Capture</Button>
 *
 * So a technician could capture at most one item per class on the step, and
 * the step's ceiling was the number of classes it offered - three, against a
 * minimum of five. The step could never be satisfied, the workflow reported
 * gaps the technician could not clear, and the job could not be submitted.
 *
 * **The minimum is not lowered.** IICRC S500:2021 §10.2 names readings on
 * walls at 150mm, 600mm and 1200mm plus floors and ceilings: five is the
 * clinical floor, and the one-capture-per-class lock is the defect.
 *
 * The rule lives here, and not in the page, for a reason that is not tidiness.
 * A rule written as a JSX ternary cannot be read by a test - it is reachable
 * only by rendering the page - so nothing could prove the ceiling was wrong
 * until a technician met it on a wet site. Expressed as a function, both the
 * required and the optional sections of the capture page call it, and
 * `__tests__/step-reachability.test.ts` asserts the ceiling of every mandatory
 * step of every workflow against that step's own minimum.
 */

import type { EvidenceClass } from "@prisma/client";
import type { WorkflowStepDefinition } from "./workflow-definitions";

/**
 * How many items a technician may capture for one evidence class on one step.
 *
 * A policy rather than a constant so the reachability test can evaluate the
 * ceiling under the OLD one-per-class rule as a negative control. A test that
 * can only ever see the current rule would pass just as happily if the rule
 * were deleted.
 */
export type CapturesPerClassPolicy = (evidenceClass: EvidenceClass) => number;

/**
 * The current rule: no per-class cap.
 *
 * There is deliberately no exception list. A cap on any single class brings
 * back the whole defect kind for that class - five moisture readings, three
 * damage photos and two ambient readings are all ordinary field work, and a
 * technician who mistypes one deletes it and takes it again. Whether a step
 * has enough evidence is the completion gate's question, which it answers by
 * counting what was actually captured; it is not the capture button's question
 * to pre-empt.
 */
export const CAPTURES_PER_CLASS_UNCAPPED: CapturesPerClassPolicy = () =>
  Number.POSITIVE_INFINITY;

/**
 * Whether the Capture control stays available for this class.
 *
 * The ONE place the page asks. Both the required-evidence and
 * optional-evidence sections call it, so the two cannot drift apart - they
 * were separate ternaries holding the same idea, which is how one of them
 * would have been fixed and the other left.
 */
export function canCaptureAnother(
  evidenceClass: EvidenceClass,
  capturedCount: number,
  policy: CapturesPerClassPolicy = CAPTURES_PER_CLASS_UNCAPPED,
): boolean {
  return capturedCount < policy(evidenceClass);
}

/**
 * The most evidence items this step can hold, summed over every class it
 * offers. `Infinity` under the current policy, a small integer under a capped
 * one.
 */
export function stepCaptureCeiling(
  step: Pick<
    WorkflowStepDefinition,
    "requiredEvidenceClasses" | "optionalEvidenceClasses"
  >,
  policy: CapturesPerClassPolicy = CAPTURES_PER_CLASS_UNCAPPED,
): number {
  const classes = [
    ...step.requiredEvidenceClasses,
    ...step.optionalEvidenceClasses,
  ];
  return classes.reduce((total, cls) => total + policy(cls), 0);
}

/**
 * Whether the step's minimum is attainable at all.
 *
 * A step offering no evidence class has a ceiling of zero and is unreachable
 * whatever its minimum, which is a different defect from a cap being too low
 * and is worth the distinct answer.
 */
export function stepMinimumIsReachable(
  step: Pick<
    WorkflowStepDefinition,
    "requiredEvidenceClasses" | "optionalEvidenceClasses" | "minimumEvidenceCount"
  >,
  policy: CapturesPerClassPolicy = CAPTURES_PER_CLASS_UNCAPPED,
): boolean {
  return stepCaptureCeiling(step, policy) >= step.minimumEvidenceCount;
}
