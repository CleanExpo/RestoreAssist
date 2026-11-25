"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, TrendingDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHART_CHROME, seriesColour } from "@/lib/charts/palette";
import {
  chartReadingGoal,
  chartReferenceLines,
  getDryStandard,
  MOISTURE_GUIDE_LABEL,
  type ChartReadingGoal,
} from "@/lib/iicrc-dry-standards";

/**
 * Goal line. The job's reference readings win (RA-8509): one line per material
 * on the chart that has one. Only when there is none does the chart draw the
 * timber guide value, a starting guide only, not a standard (RA-8508).
 */
const GUIDE_MATERIAL = "timber";
const GUIDE_MC = getDryStandard(GUIDE_MATERIAL).dryThreshold;

interface MoistureReading {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  recordedAt: string;
  /** Recorded unit; a reference applies only to a moisture-content reading. */
  unit?: string | null;
}

interface MoistureTrendChartProps {
  readings: MoistureReading[];
  /** The job's reference readings: `pickReferenceReadings(...)` (RA-8509). */
  references?: Record<string, number>;
  className?: string;
}

function goalFor(
  r: Pick<MoistureReading, "surfaceType" | "moistureLevel" | "unit">,
  references: Record<string, number>,
): ChartReadingGoal {
  return chartReadingGoal(r, references, GUIDE_MATERIAL);
}

function goalText(goal: ChartReadingGoal): string {
  return goal.basis === "reference"
    ? `reference ≤${goal.target}%`
    : `guide ≤${goal.target}%`;
}

const STATUS_TEXT = {
  dry: "text-success",
  drying: "text-amber-700 dark:text-amber-400",
  wet: "text-destructive",
} as const;

type SeriesData = Record<
  string,
  { time: number; label: string; [location: string]: number | string }
>;


function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildChartData(readings: MoistureReading[]) {
  // Group by timestamp bucket (per recordedAt), series = location
  const byTime: SeriesData = {};
  const locations = new Set<string>();

  const sorted = [...readings].sort(
    (a, b) =>
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );

  for (const r of sorted) {
    const time = new Date(r.recordedAt).getTime();
    const label = formatTime(r.recordedAt);
    if (!byTime[time]) byTime[time] = { time, label };
    byTime[time][r.location] = r.moistureLevel;
    locations.add(r.location);
  }

  return {
    data: Object.values(byTime).sort(
      (a, b) => (a.time as number) - (b.time as number),
    ),
    locations: Array.from(locations),
  };
}

function getAlerts(
  readings: MoistureReading[],
  references: Record<string, number>,
) {
  // Latest reading per location — check which are above dry standard
  const latest: Record<string, MoistureReading> = {};
  for (const r of readings) {
    if (
      !latest[r.location] ||
      new Date(r.recordedAt) > new Date(latest[r.location].recordedAt)
    ) {
      latest[r.location] = r;
    }
  }
  return Object.values(latest).filter(
    (r) => goalFor(r, references).status !== "dry",
  );
}

function CustomTooltip({ active, payload, label, readings, references }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
        {label}
      </p>
      {payload.map((entry: any) => {
        const source = (readings as MoistureReading[] | undefined)?.find(
          (r) => r.location === entry.dataKey,
        );
        const goal = goalFor(
          {
            surfaceType: source?.surfaceType ?? GUIDE_MATERIAL,
            moistureLevel: entry.value,
            unit: source?.unit,
          },
          references ?? {},
        );
        return (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-600 dark:text-slate-400">
            {entry.dataKey}:
          </span>
          <span className={cn("font-semibold", STATUS_TEXT[goal.status])}>
            {entry.value}%
          </span>
          <span className="text-slate-500 dark:text-slate-500">
            ({goalText(goal)})
          </span>
          {goal.status === "dry" && (
            <CheckCircle2 size={11} className="text-success" />
          )}
          {goal.status !== "dry" && (
            <AlertTriangle size={11} className="text-amber-500" />
          )}
        </div>
        );
      })}
      {goalBasisNote(references ?? {}, readings ?? [])}
    </div>
  );
}

/** Footer wording: names the guide only when the chart falls back to it. */
function goalBasisNote(
  references: Record<string, number>,
  readings: MoistureReading[],
) {
  const lines = chartReferenceLines(
    readings.map((r) => r.surfaceType),
    references,
  );
  return (
    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-1 text-slate-600 dark:text-slate-500">
      <span>
        {lines.length > 0
          ? "Goal: the job's reference reading for each material"
          : `Guide: ≤${GUIDE_MC}% (${MOISTURE_GUIDE_LABEL.toLowerCase()})`}
      </span>
    </div>
  );
}

const NO_REFERENCES: Record<string, number> = {};

export default function MoistureTrendChart({
  readings,
  references = NO_REFERENCES,
  className,
}: MoistureTrendChartProps) {
  if (!readings || readings.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-48 rounded-xl border border-dashed border-slate-200 dark:border-slate-700",
          className,
        )}
      >
        <p className="text-sm text-slate-500 dark:text-slate-500">
          No moisture readings recorded yet.
        </p>
      </div>
    );
  }

  const { data, locations } = buildChartData(readings);
  const alerts = getAlerts(readings, references);
  const referenceLines = chartReferenceLines(
    readings.map((r) => r.surfaceType),
    references,
  );
  const usesReference = referenceLines.length > 0;

  // Aggregate summary: the latest reading per location, judged against its goal
  const latestByLocation: Record<string, MoistureReading> = {};
  for (const r of readings) {
    const existing = latestByLocation[r.location];
    if (!existing || new Date(r.recordedAt) > new Date(existing.recordedAt)) {
      latestByLocation[r.location] = r;
    }
  }
  const latestGoals = Object.entries(latestByLocation).map(
    ([loc, r]) => [loc, r, goalFor(r, references)] as const,
  );
  const dryCount = latestGoals.filter(([, , g]) => g.status === "dry").length;
  const totalLocations = latestGoals.length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Alert banner */}
      {alerts.length > 0 ? (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
          <AlertTriangle
            size={16}
            className="text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5"
          />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {alerts.length} location{alerts.length > 1 ? "s" : ""} above{" "}
              {usesReference ? "their drying goal" : "the guide value"}
            </p>
            <p className="text-amber-700 dark:text-amber-500 text-xs mt-0.5">
              {alerts
                .map((a) => `${a.location} (${goalText(goalFor(a, references))})`)
                .join(", ")}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-sm">
          <CheckCircle2
            size={16}
            className="text-success"
          />
          <span className="text-success font-medium">
            {usesReference
              ? `All ${dryCount}/${totalLocations} locations at or below their drying goal`
              : `All ${dryCount}/${totalLocations} locations at or below the guide value (${GUIDE_MC}%, ${MOISTURE_GUIDE_LABEL.toLowerCase()})`}
          </span>
        </div>
      )}

      {/* Chart */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
              Moisture Trend
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {usesReference
                ? "Readings over time · Goal: the job's reference readings"
                : `Readings over time · Guide ≤${GUIDE_MC}% (${MOISTURE_GUIDE_LABEL.toLowerCase()})`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-500">
            <TrendingDown size={14} />
            <span>
              {usesReference
                ? referenceLines
                    .map((l) => `${l.material}: reference ≤${l.target}%`)
                    .join(" · ")
                : `Guide: below ${GUIDE_MC}%`}
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_CHROME.grid}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-slate-500 dark:text-slate-500"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-slate-500 dark:text-slate-500"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={
                <CustomTooltip readings={readings} references={references} />
              }
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            {/* Goal line: reference readings first, the guide only without one */}
            {usesReference ? (
              referenceLines.map((l) => (
                <ReferenceLine
                  key={`ref-${l.material}`}
                  y={l.target}
                  stroke={CHART_CHROME.reference}
                  strokeDasharray="5 3"
                  label={{
                    value: `Reference ${l.material} ≤${l.target}%`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: CHART_CHROME.reference,
                  }}
                />
              ))
            ) : (
              <ReferenceLine
                y={GUIDE_MC}
                stroke={CHART_CHROME.reference}
                strokeDasharray="5 3"
                label={{
                  value: `Guide ≤${GUIDE_MC}%`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: CHART_CHROME.reference,
                }}
              />
            )}
            {locations.map((loc, i) => (
              <Line
                key={loc}
                type="monotone"
                dataKey={loc}
                stroke={seriesColour(i)}
                strokeWidth={2}
                dot={{ r: 4, fill: seriesColour(i), strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Location summary table */}
      {totalLocations > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                  Location
                </th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wide text-right">
                  Latest Reading
                </th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wide text-right">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {latestGoals.map(([loc, r, goal]) => (
                <tr key={loc} className="bg-white dark:bg-slate-800/20">
                  <td className="px-4 py-2.5 text-slate-900 dark:text-white font-medium">
                    {loc}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-semibold",
                      STATUS_TEXT[goal.status],
                    )}
                  >
                    {r.moistureLevel}%
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {goal.status === "dry" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success-subtle-foreground bg-success-subtle px-2 py-0.5 rounded-full">
                        {/* Without a reference reading this is guide-relative
                            only, so it never calls a location dry (RA-8508). */}
                        <CheckCircle2 size={11} />{" "}
                        {goal.basis === "reference"
                          ? "At or below reference"
                          : "At or below guide"}
                      </span>
                    ) : goal.status === "drying" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-warning-subtle-foreground bg-warning-subtle px-2 py-0.5 rounded-full">
                        <AlertTriangle size={11} /> Caution
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive-subtle-foreground bg-destructive-subtle px-2 py-0.5 rounded-full">
                        <AlertTriangle size={11} /> Wet
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
