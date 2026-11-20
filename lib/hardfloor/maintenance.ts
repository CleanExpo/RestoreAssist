/**
 * Hard Floor add-on — maintenance plan (step 10).
 *
 * Intervals are organisation-set. The only built-in default is for
 * high-traffic commercial resilient floors, where a full strip and seal is
 * typically needed every 6–12 months (CARSI SOP 9): re-inspect at 6 months,
 * strip due by 12. Other traffic levels must be set explicitly, so the app
 * never invents a frequency.
 */

import type { TrafficLevel } from "./types";

export const HIGH_TRAFFIC_STRIP_RANGE_MONTHS = { min: 6, max: 12 } as const;

export interface PlanIntervals {
  /** Months between maintenance visits (scrub-and-recoat or clean). */
  visitEveryMonths: number;
  /** Months until a full strip/restorative service is due. */
  restorativeDueMonths: number;
}

export interface MaintenancePlan {
  traffic: TrafficLevel;
  nextVisitAt: string;
  restorativeDueAt: string;
  intervals: PlanIntervals;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString();
}

export function defaultIntervals(traffic: TrafficLevel): PlanIntervals | null {
  if (traffic === "high") {
    return {
      visitEveryMonths: HIGH_TRAFFIC_STRIP_RANGE_MONTHS.min,
      restorativeDueMonths: HIGH_TRAFFIC_STRIP_RANGE_MONTHS.max,
    };
  }
  return null;
}

export function planMaintenance(args: {
  traffic: TrafficLevel;
  /** Completion date of the job just handed over (ISO). */
  completedAt: string;
  intervals?: PlanIntervals;
}): MaintenancePlan {
  const intervals = args.intervals ?? defaultIntervals(args.traffic);
  if (!intervals) {
    throw new Error(`Set maintenance intervals for ${args.traffic}-traffic floors; there is no default`);
  }
  if (
    !Number.isInteger(intervals.visitEveryMonths) || intervals.visitEveryMonths < 1 ||
    !Number.isInteger(intervals.restorativeDueMonths) || intervals.restorativeDueMonths < intervals.visitEveryMonths
  ) {
    throw new Error("Intervals must be whole months, with restorative due no sooner than the next visit");
  }
  return {
    traffic: args.traffic,
    nextVisitAt: addMonths(args.completedAt, intervals.visitEveryMonths),
    restorativeDueAt: addMonths(args.completedAt, intervals.restorativeDueMonths),
    intervals,
  };
}
