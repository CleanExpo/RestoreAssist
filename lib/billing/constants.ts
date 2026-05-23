/**
 * Centralised billing constants. SP-3 Section 7.2.
 * Edit here once; 6 callsites import from this module.
 */

/** Free trial duration in days for new signups. Existing TRIAL users grandfathered. */
export const TRIAL_DAYS = 15;

/** Days remaining at which <TrialCountdownBanner> begins rendering. */
export const T_MINUS_BANNER_DAYS = 3;
