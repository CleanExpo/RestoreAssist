import { testHelpersBlocked } from "@/app/api/test/_helpers";
import { notFound } from "next/navigation";
import { ComparisonSlider } from "@/components/report-experience/visuals/ComparisonSlider";
import { HazardCards } from "@/components/report-experience/visuals/HazardCards";
import { MoistureTrends } from "@/components/report-experience/visuals/MoistureTrends";
import { ReportGantt } from "@/components/report-experience/visuals/ReportGantt";
import { planComparison, type ComparisonFrame } from "@/lib/report-experience/visuals/comparison";
import { buildGantt } from "@/lib/report-experience/visuals/gantt";
import { prioritiseHazards } from "@/lib/report-experience/visuals/hazards";
import { buildMoistureSeries } from "@/lib/report-experience/visuals/moisture";

export const metadata = {
  title: "RestoreAssist | Report visuals (synthetic prototype)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TZ = "Australia/Brisbane";

/**
 * RA-8107: test-helper-gated demonstration of the report visuals on
 * synthetic data. No claim, person, address or measurement here is real, and
 * the images are stand-ins, not inspection photographs.
 */
export default function ReportVisualsDemoPage() {
  // Same two-key switch as the test sign-in route: off unless ALLOW_TEST_HELPERS=true, and
  // still off on a production deploy. No new process-environment read lives here.
  if (testHelpersBlocked()) notFound();

  const gantt = buildGantt({
    timeZone: TZ,
    now: "2026-03-10T10:00:00+10:00",
    plan: {
      revision: "plan-1",
      createdAt: "2026-03-01T00:00:00+10:00",
      tasks: [
        { id: "t1", label: "Water extraction", start: "2026-03-02", end: "2026-03-03", status: "complete" },
        { id: "t2", label: "Structural drying", start: "2026-03-03", end: "2026-03-07", status: "in-progress" },
        { id: "t3", label: "Repairs", start: "2026-03-08", end: "2026-03-10", status: "planned" },
        { id: "t4", label: "Final inspection", start: "2026-03-11", end: "2026-03-11", status: "planned" },
      ],
    },
    current: {
      revision: "plan-2",
      createdAt: "2026-03-05T09:00:00+10:00",
      tasks: [
        { id: "t1", label: "Water extraction", start: "2026-03-02", end: "2026-03-03", status: "complete" },
        { id: "t2", label: "Structural drying", start: "2026-03-03", end: "2026-03-09", status: "in-progress" },
        { id: "t3", label: "Repairs", start: "2026-03-10", end: "2026-03-12", status: "planned" },
        { id: "t5", label: "Mould clearance check", start: "2026-03-12", end: "2026-03-12", status: "planned" },
        { id: "t6", label: "Insurer approval", start: null, end: null, status: "planned" },
      ],
    },
  });

  const reading = (id: string, roomId: string, day: string, value: number, unit: "WME" | "G_PER_KG" = "WME") => ({
    id, roomId, observedAt: `2026-03-${day}T09:00:00+10:00`, value, unit,
  });
  const series = buildMoistureSeries(
    [
      reading("k1", "kitchen", "02", 36), reading("k2", "kitchen", "03", 31), reading("k3", "kitchen", "05", 24),
      reading("k4", "kitchen", "06", 17), reading("k5", "kitchen", "07", 15),
      reading("h1", "hall", "02", 30), reading("h2", "hall", "03", 29.6), reading("h3", "hall", "04", 29.4),
      reading("a1", "kitchen", "02", 14.2, "G_PER_KG"), reading("a2", "kitchen", "03", 12.4, "G_PER_KG"), reading("a3", "kitchen", "05", 9.6, "G_PER_KG"),
    ],
    { timeZone: TZ, targets: { WME: 16 }, roomLabels: { kitchen: "Kitchen", hall: "Hall" } },
  );

  const hazards = prioritiseHazards([
    { id: "h1", title: "Possible live wiring in wet wall cavity", action: "Isolate the circuit. A licensed electrician must inspect before any work in this area.", verification: "unverified", severity: "critical", position: { x: 0.62, y: 0.4 } },
    { id: "h2", title: "Wet floor in hallway", action: "Place wet-floor signage and keep the route clear.", verification: "verified", severity: "medium", position: { x: 0.25, y: 0.7 } },
    { id: "h3", title: "Suspected asbestos-containing ceiling lining", action: "Do not disturb. Arrange a sample test before any ceiling work.", verification: "unverified" },
  ]);

  const frame = (over: Partial<ComparisonFrame>): ComparisonFrame => ({
    photoId: "demo", stage: "before", url: "/bg1.jpg", alt: "Synthetic stand-in image, not an inspection photograph",
    roomId: "kitchen", capturedAt: "2026-03-02T09:14:00+10:00", source: "inspection-photo", ...over,
  });
  const before = frame({});
  const after = frame({ photoId: "demo-after", stage: "after", capturedAt: "2026-03-09T15:00:00+10:00" });

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Report visuals (synthetic demonstration)</h1>
      <p>Synthetic data only. Not a claim, not a measurement, not for any technical decision.</p>
      <HazardCards model={hazards} floorPlan={{ src: "/bg1.jpg", alt: "Synthetic stand-in image used in place of a floor plan" }} />
      <ReportGantt model={gantt} />
      <MoistureTrends series={series} />
      <ComparisonSlider plan={planComparison(before, after, TZ)} before={before} after={after} />
    </main>
  );
}
