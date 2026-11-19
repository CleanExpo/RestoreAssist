import fs from "node:fs";
import path from "node:path";

export type SloLastRun = {
  ranAt: string;
  pass: boolean;
  p50Ms: number;
  p95Ms: number;
  errorRate: number;
  baseUrl?: string;
};

export function readSloLastRun(): SloLastRun | null {
  const file = path.join(
    process.cwd(),
    "docs/internal/metrics/slo-last-run.json",
  );
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as SloLastRun;
    if (!raw?.ranAt) return null;
    return raw;
  } catch {
    return null;
  }
}