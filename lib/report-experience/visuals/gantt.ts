/**
 * RA-8107: versioned work programme (Gantt) with changes against the plan.
 *
 * Pure and deterministic: the same two revisions, clock and zone always give
 * the same rows. Nothing here invents a date. A task with a missing, naive
 * (no offset) or reversed date has no bar and says so; a task removed from the
 * current revision stays visible so a slip cannot be hidden by deleting it.
 */
import { addDays, assertTimeZone, dayNumber, formatLocalDate, toLocalDate } from "./time";

export type GanttStatus = "planned" | "in-progress" | "complete" | "blocked";

export type GanttTask = Readonly<{
  id: string;
  label: string;
  /** YYYY-MM-DD, or an instant with an offset. Null or absent means no date recorded. */
  start?: string | null;
  end?: string | null;
  status?: GanttStatus;
}>;

export type GanttRevision = Readonly<{
  revision: string;
  createdAt: string;
  tasks: readonly GanttTask[];
}>;

export type GanttBar = Readonly<{ start: string; end: string; days: number }>;

export type GanttChange =
  | "unchanged"
  | "moved"
  | "resized"
  | "moved-and-resized"
  | "added"
  | "removed"
  | "dates-removed";

export type GanttDateProblem = "start-or-end-missing-or-invalid" | "end-before-start";

export type GanttRow = Readonly<{
  id: string;
  label: string;
  status: GanttStatus;
  plan: GanttBar | null;
  current: GanttBar | null;
  change: GanttChange;
  startShiftDays: number;
  durationDeltaDays: number;
  late: boolean;
  dateState: "dated" | "no-date" | "removed";
  dateProblem: GanttDateProblem | null;
  /** Percent of the shared axis; null when the bar does not exist. */
  leftPct: number | null;
  widthPct: number | null;
  planLeftPct: number | null;
  planWidthPct: number | null;
}>;

export type GanttTableRow = Readonly<{
  id: string;
  label: string;
  status: GanttStatus;
  planned: string;
  current: string;
  change: GanttChange;
  late: boolean;
}>;

export type GanttModel = Readonly<{
  planRevision: string;
  currentRevision: string;
  today: string;
  axis: Readonly<{ start: string; end: string; days: number }> | null;
  rows: readonly GanttRow[];
  table: readonly GanttTableRow[];
}>;

function bar(task: GanttTask | undefined, timeZone: string): { bar: GanttBar | null; problem: GanttDateProblem | null } {
  if (!task) return { bar: null, problem: null };
  const start = toLocalDate(task.start, timeZone);
  const end = toLocalDate(task.end, timeZone);
  if (!start || !end) return { bar: null, problem: "start-or-end-missing-or-invalid" };
  const days = dayNumber(end) - dayNumber(start) + 1;
  if (days < 1) return { bar: null, problem: "end-before-start" };
  return { bar: { start, end, days }, problem: null };
}

function indexTasks(revision: GanttRevision): Map<string, GanttTask> {
  const map = new Map<string, GanttTask>();
  for (const task of revision.tasks) {
    if (map.has(task.id)) throw new Error(`Gantt revision ${revision.revision} has a duplicate task id: ${task.id}`);
    map.set(task.id, task);
  }
  return map;
}

function classify(plan: GanttBar | null, current: GanttBar | null, inPlan: boolean, inCurrent: boolean): GanttChange {
  if (!inPlan && inCurrent) return "added";
  if (inPlan && !inCurrent) return "removed";
  if (plan && !current) return "dates-removed";
  if (!plan || !current) return "unchanged";
  const shift = dayNumber(current.start) - dayNumber(plan.start);
  const delta = current.days - plan.days;
  if (shift !== 0 && delta !== 0) return "moved-and-resized";
  if (shift !== 0) return "moved";
  if (delta !== 0) return "resized";
  return "unchanged";
}

function describe(b: GanttBar | null, empty: string): string {
  return b ? `${formatLocalDate(b.start)} to ${formatLocalDate(b.end)}` : empty;
}

export function buildGantt(input: {
  plan: GanttRevision;
  current: GanttRevision;
  now: string;
  timeZone: string;
}): GanttModel {
  assertTimeZone(input.timeZone);
  const today = toLocalDate(input.now, input.timeZone);
  if (!today) throw new Error("Gantt needs a clock time with an offset");
  const planTasks = indexTasks(input.plan);
  const currentTasks = indexTasks(input.current);

  const ids = [...currentTasks.keys(), ...[...planTasks.keys()].filter((id) => !currentTasks.has(id))];

  const drafts = ids.map((id) => {
    const p = planTasks.get(id);
    const c = currentTasks.get(id);
    const planBar = bar(p, input.timeZone).bar;
    const { bar: currentBar, problem } = bar(c, input.timeZone);
    const change = classify(planBar, currentBar, !!p, !!c);
    const task = (c ?? p)!;
    const status: GanttStatus = task.status ?? "planned";
    const late = !!currentBar && status !== "complete" && dayNumber(currentBar.end) < dayNumber(today);
    return { id, task, status, planBar, currentBar, problem, change, late, inCurrent: !!c };
  });

  const dated = drafts.flatMap((d) => [d.planBar, d.currentBar]).filter((b): b is GanttBar => b !== null);
  let axis: GanttModel["axis"] = null;
  if (dated.length > 0) {
    const first = Math.min(...dated.map((b) => dayNumber(b.start)));
    const last = Math.max(...dated.map((b) => dayNumber(b.end)));
    const startDate = addDays("1970-01-01", first);
    axis = { start: startDate, end: addDays("1970-01-01", last), days: last - first + 1 };
  }
  const pct = (b: GanttBar | null) =>
    axis && b
      ? {
          left: ((dayNumber(b.start) - dayNumber(axis.start)) / axis.days) * 100,
          width: (b.days / axis.days) * 100,
        }
      : null;

  const rows: GanttRow[] = drafts.map((d) => {
    const cur = pct(d.currentBar);
    const pl = pct(d.planBar);
    return {
      id: d.id,
      label: d.task.label,
      status: d.status,
      plan: d.planBar,
      current: d.currentBar,
      change: d.change,
      startShiftDays: d.planBar && d.currentBar ? dayNumber(d.currentBar.start) - dayNumber(d.planBar.start) : 0,
      durationDeltaDays: d.planBar && d.currentBar ? d.currentBar.days - d.planBar.days : 0,
      late: d.late,
      dateState: !d.inCurrent ? "removed" : d.currentBar ? "dated" : "no-date",
      dateProblem: d.inCurrent && !d.currentBar ? d.problem : null,
      leftPct: cur ? cur.left : null,
      widthPct: cur ? cur.width : null,
      planLeftPct: pl ? pl.left : null,
      planWidthPct: pl ? pl.width : null,
    };
  });

  const table: GanttTableRow[] = drafts.map((d) => ({
    id: d.id,
    label: d.task.label,
    status: d.status,
    planned: planTasks.has(d.id) ? describe(d.planBar, "No date recorded") : "Not in the original plan",
    current: d.inCurrent ? describe(d.currentBar, "No date recorded") : "Removed from the current plan",
    change: d.change,
    late: d.late,
  }));

  return {
    planRevision: input.plan.revision,
    currentRevision: input.current.revision,
    today,
    axis,
    rows,
    table,
  };
}
