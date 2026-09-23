"use client";

// RA-7713 part 9 — overview "Environmental Conditions" card, extracted from
// the job page so it can be rendered and tested on its own. Accepts the array
// the API returns (and the single object the demo inspection returns).

import {
  formatAirCirculation,
  formatEnvironmentalValue,
  latestEnvironmentalReading,
  type EnvironmentalReading,
} from "@/lib/inspections/latest-environmental-reading";

export default function EnvironmentalSummary({
  environmentalData,
}: {
  environmentalData:
    | EnvironmentalReading
    | EnvironmentalReading[]
    | null
    | undefined;
}) {
  const env = latestEnvironmentalReading(environmentalData);
  if (!env) return null;
  return (
    <div className="md:col-span-2 p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
      <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-2">
        Environmental Conditions
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <span className="text-xs text-neutral-400">Temperature</span>
          <div className="text-lg font-semibold" data-testid="env-temperature">
            {formatEnvironmentalValue(env.ambientTemperature, "°C")}
          </div>
        </div>
        <div>
          <span className="text-xs text-neutral-400">Humidity</span>
          <div className="text-lg font-semibold" data-testid="env-humidity">
            {formatEnvironmentalValue(env.humidityLevel, "%")}
          </div>
        </div>
        <div>
          <span className="text-xs text-neutral-400">Dew Point</span>
          <div className="text-lg font-semibold" data-testid="env-dew-point">
            {formatEnvironmentalValue(env.dewPoint, "°C", 1)}
          </div>
        </div>
        <div>
          <span className="text-xs text-neutral-400">Air Circulation</span>
          <div
            className="text-lg font-semibold"
            data-testid="env-air-circulation"
          >
            {formatAirCirculation(env.airCirculation)}
          </div>
        </div>
      </div>
    </div>
  );
}
