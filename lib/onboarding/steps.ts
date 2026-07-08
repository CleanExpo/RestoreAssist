/**
 * Onboarding checklist — single source of truth for turning the server's
 * canonical step set into rendered checklists.
 *
 * The server (`GET /api/onboarding/status`) owns the step set, completion,
 * required-ness, titles, and routes. Every client onboarding surface must
 * render THIS (derived from the API response) rather than its own hardcoded
 * list — otherwise the surfaces drift and show the user contradicting
 * checklists (which is exactly what happened: OnboardingClient re-injected a
 * stale `pricing`/`integration` fallback that duplicated the API's
 * `pricing_config`/`property_data`, and OnboardingGuide's completion map was
 * dead code that never matched).
 */

/** One step as returned by GET /api/onboarding/status `steps` map. */
export interface OnboardingApiStep {
  completed: boolean;
  required: boolean;
  title: string;
  description: string;
  route: string;
}

/** Full shape of the GET /api/onboarding/status response. */
export interface OnboardingStatusResponse {
  isComplete: boolean;
  incompleteSteps: string[];
  steps: Record<string, OnboardingApiStep>;
  nextStep: string | null;
}

/** A step shaped for checklist rendering. */
export interface OnboardingDisplayStep {
  id: string;
  title: string;
  description: string;
  href: string;
  time: string;
  completed: boolean;
  required: boolean;
}

/** Human time estimate per canonical step id. */
export const ONBOARDING_STEP_TIME: Record<string, string> = {
  ai_provider: "2 min",
  business_profile: "2 min",
  pricing_config: "5 min",
  first_inspection: "8 min",
  first_report: "10 min",
  property_data: "5 min",
};

const DEFAULT_STEP_TIME = "~5 min";

/**
 * Turn the server's canonical `steps` map into an ordered checklist. Preserves
 * the server's key order (its definition order) and never injects client-side
 * steps, so every surface that calls this renders the same list.
 */
export function toOnboardingDisplaySteps(
  steps: Record<string, OnboardingApiStep> | null | undefined,
): OnboardingDisplayStep[] {
  if (!steps) return [];
  return Object.entries(steps).map(([id, step]) => ({
    id,
    title: step.title,
    description: step.description,
    href: step.route,
    time: ONBOARDING_STEP_TIME[id] ?? DEFAULT_STEP_TIME,
    completed: step.completed,
    required: step.required,
  }));
}

/**
 * OnboardingGuide (the floating positional wizard) tracks completion by a
 * numeric step index, not by the API's string keys. This maps the relevant API
 * keys onto that widget's three positions. The previous implementation did
 * `parseInt(key.split("_")[1])`, which produced NaN for every key
 * (`"ai_provider" → "provider"`, `"first_inspection" → "inspection"`), so it
 * silently marked nothing complete.
 */
export const GUIDE_STEP_NUMBER_BY_KEY: Record<string, number> = {
  business_profile: 0,
  pricing_config: 1,
  first_report: 2,
};

/** Completed step indices for the OnboardingGuide widget, from the API steps. */
export function completedGuideStepNumbers(
  steps: Record<string, OnboardingApiStep> | null | undefined,
): number[] {
  if (!steps) return [];
  return Object.entries(steps)
    .filter(([, step]) => step.completed)
    .map(([key]) => GUIDE_STEP_NUMBER_BY_KEY[key])
    .filter((n): n is number => n !== undefined);
}
