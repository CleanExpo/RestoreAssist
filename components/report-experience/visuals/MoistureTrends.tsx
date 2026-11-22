import type { DryEvidence, MoistureSeries, MoistureUnit } from "@/lib/report-experience/visuals/moisture";
import { dayNumber, formatLocalDate } from "@/lib/report-experience/visuals/time";
import styles from "./visuals.module.css";

const UNIT_LABEL: Record<MoistureUnit, string> = { WME: "WME", RH_PERCENT: "% RH", G_PER_KG: "g/kg", CELSIUS: "°C" };

const W = 360;
const H = 180;
const M = { left: 40, right: 12, top: 12, bottom: 28 };

function dryText(dry: DryEvidence, unit: MoistureUnit): { text: string; tone: "good" | "warn" | "plain" } {
  const label = UNIT_LABEL[unit];
  switch (dry.state) {
    case "evidenced":
      return {
        text: `Dry target of ${dry.target} ${label} met on ${formatLocalDate(dry.date)} (reading ${dry.readingId}) and every later reading stays at or below it.`,
        tone: "good",
      };
    case "no-date":
      return {
        text:
          dry.reason === "above-target"
            ? `No dry date can be stated: the latest reading is above the ${dry.target} ${label} target.`
            : dry.reason === "unresolved-conflict"
              ? "No dry date can be stated: a later reading conflicts; drying not confirmed."
            : dry.reason === "no-target"
              ? "No dry target is recorded for this reading type, so no dry date can be stated."
              : "No usable reading is recorded, so no dry date can be stated.",
        tone: "warn",
      };
    case "not-applicable":
      return { text: "Air condition reading. It has no dry target and does not show a material is dry.", tone: "plain" };
  }
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= value) ?? 10;
  return step * pow;
}

function Chart({ series }: { series: MoistureSeries }) {
  const label = UNIT_LABEL[series.unit];
  const points = series.points;
  const target = series.dry.state === "evidenced" || (series.dry.state === "no-date" && series.dry.target !== null) ? (series.dry as { target: number }).target : null;
  if (points.length === 0) return null;

  const first = dayNumber(points[0].localDate);
  const last = dayNumber(points[points.length - 1].localDate);
  const span = Math.max(last - first, 1);
  const yMax = niceMax(Math.max(...points.map((p) => p.value), target ?? 0) * 1.05);
  const x = (day: number) => M.left + ((day - first) / span) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - (v / yMax) * (H - M.top - M.bottom);

  // A line is broken wherever a calendar day has no reading: no line is drawn across a gap.
  const segments: string[][] = [];
  let previous: number | null = null;
  for (const p of points) {
    const d = dayNumber(p.localDate);
    const coord = `${x(d).toFixed(1)},${y(p.value).toFixed(1)}`;
    if (previous === null || d - previous > 1) segments.push([coord]);
    else segments[segments.length - 1].push(coord);
    previous = d;
  }
  const ticks = [0, yMax / 2, yMax];
  const summary = `${label} readings for ${series.roomLabel}, ${formatLocalDate(points[0].localDate)} to ${formatLocalDate(points[points.length - 1].localDate)}. First ${points[0].value}, latest ${points[points.length - 1].value}.${target !== null ? ` Dry target ${target}.` : ""} The table below lists every reading.`;

  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} data-pv-allow="chart">
      {ticks.map((t) => (
        <g key={t}>
          <line className={styles.gridLine} x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
          <text className={styles.axisText} x={M.left - 4} y={y(t) + 3} textAnchor="end">{Number(t.toFixed(1))}</text>
        </g>
      ))}
      <line className={styles.axisLine} x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
      <text className={styles.axisText} x={M.left} y={H - 10}>{formatLocalDate(points[0].localDate)}</text>
      {last > first ? (
        <text className={styles.axisText} x={W - M.right} y={H - 10} textAnchor="end">{formatLocalDate(points[points.length - 1].localDate)}</text>
      ) : null}
      {target !== null ? (
        <g>
          <line className={styles.targetLine} x1={M.left} x2={W - M.right} y1={y(target)} y2={y(target)} />
          <text className={styles.axisText} x={M.left + 4} y={y(target) + 12}>Dry target {target} {label}</text>
        </g>
      ) : null}
      {segments.map((seg, i) => (seg.length > 1 ? <polyline key={i} className={styles.seriesLine} points={seg.join(" ")} /> : null))}
      {points.map((p) => (
        <circle key={p.id} className={styles.seriesDot} cx={x(dayNumber(p.localDate))} cy={y(p.value)} r={3.5} />
      ))}
    </svg>
  );
}

/** One chart and one data table per room and reading type. */
export function MoistureTrends({ series }: { series: readonly MoistureSeries[] }) {
  if (series.length === 0) {
    return (
      <section className={styles.panel} aria-labelledby="moist-title" data-testid="moisture-trends">
        <h3 id="moist-title">Moisture readings</h3>
        <p className={styles.flag}>No moisture readings are recorded, so no trend and no dry date can be shown.</p>
      </section>
    );
  }
  return (
    <section className={styles.panel} aria-labelledby="moist-title" data-testid="moisture-trends">
      <h3 id="moist-title">Moisture readings</h3>
      <p className={styles.sub}>Stored readings only, grouped by room and reading type. Days with no reading are left blank, not estimated.</p>
      {series.map((s) => {
        const label = UNIT_LABEL[s.unit];
        const dry = dryText(s.dry, s.unit);
        return (
          <article key={`${s.roomId}-${s.unit}`} data-series={`${s.roomId}/${s.unit}`}>
            <h4>{s.roomLabel}, {label}</h4>
            <Chart series={s} />
            <p className={`${styles.flag} ${dry.tone === "good" ? styles.flagGood : ""}`} data-testid="dry-state">{dry.text}</p>
            {s.stall ? (
              <p className={styles.flag} data-testid="stall-flag">Drying may have stalled: the last three visits are above target with less than a 5% fall. Review equipment and the drying plan.</p>
            ) : null}
            {s.missingDays.length > 0 ? (
              <p className={styles.note}>No reading recorded on {s.missingDays.map(formatLocalDate).join(", ")}.</p>
            ) : null}
            {s.conflicts.length > 0 ? (
              <p className={styles.flag} data-testid="conflict-flag">
                {s.conflicts.length} time{s.conflicts.length === 1 ? "" : "s"} with different values stored for the same instant. Neither value is plotted; both are in the table.
              </p>
            ) : null}
            {s.repeatsCollapsed > 0 ? <p className={styles.note}>{s.repeatsCollapsed} identical repeat{s.repeatsCollapsed === 1 ? "" : "s"} shown once.</p> : null}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption>{s.roomLabel}, {label} readings</caption>
                <thead><tr><th scope="col">Date</th><th scope="col">Reading</th><th scope="col">Note</th></tr></thead>
                <tbody>
                  {s.table.map((row) => (
                    <tr key={row.id}>
                      <th scope="row"><time dateTime={row.observedAt}>{row.observedLocal}</time></th>
                      <td>{row.value} {label}</td>
                      <td>{row.conflict ? "Conflicting value for the same time" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        );
      })}
    </section>
  );
}
