/**
 * Setup-wizard step controller — the pure navigation logic behind the
 * "locked one-step-at-a-time" onboarding wizard (Phase 4).
 *
 * The wizard shows exactly ONE step at a time and refuses to advance past a
 * `required` step until it is complete. Keeping this logic pure (no store, no
 * DOM) makes the locking behaviour exhaustively unit-testable; the SetupStepper
 * component and SetupShell are thin consumers.
 */

export interface WizardStepDef {
  key: string;
  title: string;
  /** The user must complete this step before the wizard will advance past it. */
  required: boolean;
}

/**
 * Canonical wizard order. `required` mirrors the hard gates the setup checks
 * enforce (`byok_keys` + `business_profile`); everything else is optional and
 * skippable so the user can always reach the finish line. Keep in sync with the
 * card order rendered by SetupShell.
 */
export const WIZARD_STEPS: WizardStepDef[] = [
  { key: "welcome", title: "Welcome", required: false },
  { key: "ai_key", title: "Add your AI key", required: true },
  { key: "business", title: "Business details", required: true },
  { key: "branding", title: "Branding", required: false },
  { key: "pricing", title: "Pricing", required: false },
  { key: "storage", title: "Storage", required: false },
  { key: "integrations", title: "Integrations", required: false },
  { key: "first_report", title: "Your first report", required: false },
];

export interface WizardState {
  currentIndex: number;
  currentStep: WizardStepDef;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  /** Can the user move forward from the current step right now? */
  canAdvance: boolean;
  /** Every required step is complete → the wizard may finish. */
  allRequiredComplete: boolean;
  completedCount: number;
}

/**
 * Compute navigation state for a cursor position + completion map. Pure.
 * `completion[key] === true` marks a step done; anything else is incomplete.
 */
export function computeWizardState(
  currentIndex: number,
  completion: Record<string, boolean>,
  steps: WizardStepDef[] = WIZARD_STEPS,
): WizardState {
  const clamped = Math.max(0, Math.min(currentIndex, steps.length - 1));
  const currentStep = steps[clamped];
  const canAdvance =
    !currentStep.required || completion[currentStep.key] === true;
  const allRequiredComplete = steps.every(
    (s) => !s.required || completion[s.key] === true,
  );
  const completedCount = steps.filter(
    (s) => completion[s.key] === true,
  ).length;

  return {
    currentIndex: clamped,
    currentStep,
    totalSteps: steps.length,
    isFirstStep: clamped === 0,
    isLastStep: clamped === steps.length - 1,
    canAdvance,
    allRequiredComplete,
    completedCount,
  };
}

/**
 * Index of the first incomplete required step — where the wizard should open so
 * a returning user lands on the first thing that still needs them. Falls back to
 * the last step (the finish line) when every required step is done.
 */
export function firstIncompleteRequiredIndex(
  completion: Record<string, boolean>,
  steps: WizardStepDef[] = WIZARD_STEPS,
): number {
  const idx = steps.findIndex(
    (s) => s.required && completion[s.key] !== true,
  );
  return idx === -1 ? steps.length - 1 : idx;
}
