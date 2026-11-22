"use client";

import { useEffect, useState } from "react";
import type { GanttChange, GanttModel } from "@/lib/report-experience/visuals/gantt";
import { formatLocalDate } from "@/lib/report-experience/visuals/time";
import styles from "./visuals.module.css";

const CHANGE_TEXT: Record<GanttChange, string> = {
  unchanged: "As planned",
  moved: "Moved",
  resized: "Duration changed",
  "moved-and-resized": "Moved and duration changed",
  added: "Added since the plan",
  removed: "Removed from the plan",
  "dates-removed": "Dates removed",
  "dates-added": "Dates newly recorded",
};
const STATUS_TEXT = { planned: "Planned", "in-progress": "In progress", complete: "Complete", blocked: "Blocked" } as const;

function signed(n: number, unit: string): string {
  return `${n > 0 ? "+" : ""}${n} ${unit}${Math.abs(n) === 1 ? "" : "s"}`;
}

/**
 * Work programme with changes against the plan. The table below the chart is
 * the full content; the animated bars are an optional extra that is off by
 * default, pausable, and never runs for print or reduced-motion readers.
 */
export function ReportGantt({ model }: { model: GanttModel }) {
  const [play, setPlay] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(query.matches);
      if (query.matches) setPlay(false);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const changed = model.rows.filter((row) => row.change !== "unchanged");
  const late = model.rows.filter((row) => row.late);

  return (
    <section className={styles.panel} aria-labelledby="gantt-title" data-motion={play ? "on" : "off"} data-testid="report-gantt">
      <h3 id="gantt-title">Work programme</h3>
      <p className={styles.sub}>
        Current revision {model.currentRevision} compared with plan revision {model.planRevision}. Dates as at{" "}
        {formatLocalDate(model.today)}.
      </p>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          aria-pressed={play}
          disabled={reduced || !model.axis}
          onClick={() => setPlay((value) => !value)}
        >
          {play ? "Pause motion" : "Play motion"}
        </button>
        {reduced ? <span className={styles.note}>Motion is off because your device asks for reduced motion.</span> : null}
      </div>

      <p className={styles.note} data-testid="gantt-summary">
        {changed.length === 0 ? "No changes against the plan." : `${changed.length} of ${model.rows.length} tasks changed against the plan.`}
        {late.length > 0 ? ` ${late.length} past their end date and not complete.` : ""}
      </p>

      {model.axis ? (
        <div role="group" aria-label={`Work programme bars, ${formatLocalDate(model.axis.start)} to ${formatLocalDate(model.axis.end)}. The table below lists the same tasks.`}>
          {model.rows.map((row) => (
            <div className={styles.ganttRow} key={row.id}>
              <span className={styles.ganttLabel}>{row.label}</span>
              <div className={styles.ganttTrack}>
                {row.planLeftPct !== null && row.change !== "unchanged" ? (
                  <span className={styles.ganttPlan} style={{ left: `${row.planLeftPct}%`, width: `${row.planWidthPct}%` }} aria-hidden="true" />
                ) : null}
                {row.leftPct !== null ? (
                  <span
                    className={styles.ganttBar}
                    data-status={row.status}
                    data-late={row.late}
                    style={{ left: `${row.leftPct}%`, width: `${row.widthPct}%` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <span className={styles.ganttTag}>
                {CHANGE_TEXT[row.change]}
                {row.startShiftDays !== 0 ? `, start ${signed(row.startShiftDays, "day")}` : ""}
                {row.durationDeltaDays !== 0 ? `, length ${signed(row.durationDeltaDays, "day")}` : ""}
                {row.late ? ". Past end date, not complete" : ""}
                {row.dateState === "no-date" ? ". No date recorded, so no bar is drawn" : ""}
              </span>
            </div>
          ))}
          <p className={styles.note}>Dashed outline is the planned position. Solid bar is the current programme.</p>
        </div>
      ) : (
        <p className={styles.flag}>No task has a recorded date, so no schedule can be drawn. The table lists the tasks.</p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>Work programme, plan against current</caption>
          <thead>
            <tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Planned</th><th scope="col">Current</th><th scope="col">Change</th></tr>
          </thead>
          <tbody>
            {model.table.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                <td>{STATUS_TEXT[row.status]}</td>
                <td>{row.planned}</td>
                <td>{row.current}</td>
                <td>{CHANGE_TEXT[row.change]}{row.late ? ", past end date" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
