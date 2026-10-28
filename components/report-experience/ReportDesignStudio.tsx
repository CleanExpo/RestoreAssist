"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ALWAYS_VISIBLE_REPORT_SECTIONS,
  REPORT_MODULES,
  REPORT_THEMES,
  planReportExperience,
  type ReportModuleId,
  type ReportThemeId,
} from "@/lib/report-experience/catalog";
import type { ReportExperienceSnapshot } from "@/lib/report-experience/snapshot";
import styles from "./ReportDesignStudio.module.css";

// Deliberately synthetic. No claims, people, live readings or customer data.
export const DEMO_MODULES = [
  "gantt-timeline",
  "moisture-trends",
  "before-during-after",
  "floorplan-2d",
  "model-3d",
  "safety-hotspots",
  "site-map",
  "evidence-video",
  "evidence-audio",
  "equipment-register",
  "cost-and-resources",
] as const satisfies readonly ReportModuleId[];

const syntheticReadings = [
  { day: "Day 1", wme: 36, humidity: 13.8 },
  { day: "Day 2", wme: 30, humidity: 11.7 },
  { day: "Day 3", wme: 26, humidity: 10.6 },
  { day: "Day 4", wme: 23, humidity: 9.8 },
  { day: "Day 5", wme: 19, humidity: 8.9 },
] as const;

const stages = [
  { label: "Initial inspection", from: 0, until: 2, state: "recorded" },
  { label: "Scope & authority", from: 2, until: 5, state: "recorded" },
  { label: "Mitigation works", from: 5, until: 11, state: "planned" },
  { label: "Monitoring visits", from: 8, until: 15, state: "planned" },
  { label: "Review & handover", from: 15, until: 19, state: "proposed" },
] as const;

type VisualTone = "ok" | "attention" | "neutral";

function TrendSvg({ animated }: { animated: boolean }) {
  const points = syntheticReadings.map((entry, index) => `${45 + index * 73},${150 - entry.wme * 2.45}`).join(" ");
  return (
    <svg className={styles.chart} viewBox="0 0 390 166" role="img" aria-label="Synthetic illustrative WME readings decline from 36 to 19 across five visits. These readings do not establish a drying target or completion.">
      {[45, 82, 119, 152].map((y) => (
        <line key={y} x1="38" x2="366" y1={y} y2={y} className={styles.chartGrid} />
      ))}
      <polyline className={animated ? styles.animatedStroke : styles.chartLine} points={points} />
      {syntheticReadings.map((entry, i) => (
        <g key={entry.day}>
          <circle className={styles.chartDot} cx={45 + i * 73} cy={150 - entry.wme * 2.45} r={4} />
          <text className={styles.chartLabel} x={45 + i * 73} y={160} textAnchor="middle">{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

function StatusMark({ tone }: { tone: VisualTone }) {
  return <span aria-hidden="true" className={styles.statusMark} data-tone={tone} />;
}

function MiniFloorPlan() {
  return (
    <div className={styles.floorWrap}>
      <svg viewBox="0 0 480 260" className={styles.floor} role="img" aria-label="Illustrative three-room floor layout, not surveyed or measured. Kitchen, living area and utility. Two possible moisture observation locations and one unverified hazard.">
        <rect x="17" y="17" width="446" height="226" rx="3" className={styles.floorOutline} />
        <path d="M213 17 V144 H17 M213 93 H463 M331 93 V243" className={styles.floorWall} />
        <path d="M194 144 h38 M331 159 v42 M213 75 v26" className={styles.floorDoor} />
        <rect x="20" y="147" width="190" height="91" className={styles.roomShade} />
        <rect x="215" y="20" width="245" height="70" className={styles.roomShade2} />
        <text x="70" y="72" className={styles.floorText}>LIVING ROOM</text>
        <text x="277" y="56" className={styles.floorText}>KITCHEN</text>
        <text x="63" y="198" className={styles.floorText}>UTILITY</text>
        <text x="356" y="183" className={styles.floorText}>ENTRY</text>
        <circle cx="110" cy="118" r="11" className={styles.floorPin} />
        <text x="110" y="122" textAnchor="middle" className={styles.floorPinText}>1</text>
        <circle cx="288" cy="124" r="11" className={styles.floorPin} />
        <text x="288" y="128" textAnchor="middle" className={styles.floorPinText}>2</text>
        <path d="M390 190 l12 22 h-24 z" className={styles.hazardPin} />
        <text x="390" y="205" textAnchor="middle" className={styles.hazardText}>!</text>
      </svg>
      <p className={styles.fine}>Conceptual geometry only. Never use this illustration for dimensions, work orders or a certified claim plan.</p>
    </div>
  );
}

function Gantt({ animated }: { animated: boolean }) {
  return (
    <div className={styles.gantt}>
      <div className={styles.ganttHead}>
        <span>Stage</span>
        <span>Illustrative days 1–20</span>
      </div>
      {stages.map((stage) => (
        <div className={styles.ganttRow} key={stage.label}>
          <span className={styles.ganttLabel}>{stage.label}</span>
          <div className={styles.ganttTrack}>
            <span
              className={[styles.ganttBar, animated ? styles.ganttMotion : ""].join(" ")}
              data-state={stage.state}
              style={{ left: `${stage.from * 5}%`, width: `${(stage.until - stage.from) * 5}%` }}
              aria-hidden="true"
            />
            <span className={styles.srOnly}>{stage.label}, day {stage.from + 1} to {stage.until}, {stage.state}</span>
          </div>
        </div>
      ))}
      <p className={styles.fine}>Schedule is illustrative, not a claim forecast. Dates require recorded scope and authority.</p>
    </div>
  );
}

function DesignModule({ name, animated }: { name: ReportModuleId; animated: boolean }) {
  switch (name) {
    case "gantt-timeline": return <Gantt animated={animated} />;
    case "moisture-trends":
      return (
        <div>
          <TrendSvg animated={animated} />
          <table className={styles.compactTable}>
            <caption>Illustrative moisture readings, percentage WME</caption>
            <thead><tr><th>Visit</th><th>WME</th><th>Humidity, g/kg</th></tr></thead>
            <tbody>{syntheticReadings.map((reading) => <tr key={reading.day}><td>{reading.day}</td><td>{reading.wme}</td><td>{reading.humidity}</td></tr>)}</tbody>
          </table>
        </div>
      );
    case "floorplan-2d":
    case "model-3d":
    case "site-map": return <MiniFloorPlan />;
    case "safety-hotspots":
      return (
        <div className={styles.warningStack}>
          <div><StatusMark tone="attention" /><strong>Possible electrical exposure</strong><p>Inspection required before work in the marked area.</p></div>
          <div><StatusMark tone="attention" /><strong>Moisture under floor finish</strong><p>Further verification required. Do not infer the condition from artwork.</p></div>
        </div>
      );
    case "before-during-after":
    case "evidence-video":
    case "evidence-audio":
      return (
        <div className={styles.sequence}>
          {["Before", "During", "After"].map((label, i) => (
            <div className={styles.scene} key={label} data-sequence={i}>
              <div className={styles.sceneVisual}><span>{String(i + 1).padStart(2, "0")}</span></div>
              <strong>{label}</strong><small>No actual media supplied</small>
            </div>
          ))}
          <p className={styles.fine}>Visual placeholders illustrate the sequence; they are not inspection photographs or evidence.</p>
        </div>
      );
    case "equipment-register":
      return (
        <table className={styles.compactTable}>
          <caption>Synthetic equipment register, not deployed equipment</caption>
          <thead><tr><th>Equipment</th><th>Location</th><th>State</th></tr></thead>
          <tbody><tr><td>Air mover × 2</td><td>Living room</td><td>Proposed</td></tr><tr><td>Dehumidifier × 1</td><td>Utility</td><td>Proposed</td></tr></tbody>
        </table>
      );
    case "cost-and-resources":
      return (
        <div className={styles.costColumns}><div><span>Planned phases</span><strong>5</strong></div><div><span>Open decisions</span><strong>2</strong></div><div><span>Authorised estimate</span><strong>Not supplied</strong></div></div>
      );
  }
}

function EvidencePanel({ module, animated }: { module: ReportModuleId; animated: boolean }) {
  const titles: Record<ReportModuleId, string> = {
    "gantt-timeline": "Work programme",
    "moisture-trends": "Moisture observations",
    "before-during-after": "Condition over time",
    "floorplan-2d": "Annotated floor plan",
    "model-3d": "Spatial understanding / 2D fallback",
    "safety-hotspots": "Hazard locations",
    "site-map": "Site and room context",
    "evidence-video": "Evidence sequence",
    "evidence-audio": "Documented narration",
    "equipment-register": "Equipment planning",
    "cost-and-resources": "Resources and decisions",
  };
  return (
    <section className={styles.moduleCard} data-module={module}>
      <header className={styles.moduleHeader}><h3>{titles[module]}</h3><span>{animated && REPORT_MODULES[module].motion ? "Animated illustration" : "Static / accessible"}</span></header>
      <DesignModule name={module} animated={animated} />
    </section>
  );
}

const UNIT_LABELS: Record<ReportExperienceSnapshot["moistureReadings"][number]["unit"], string> = {
  WME: "WME",
  RH_PERCENT: "% RH",
  G_PER_KG: "g/kg",
  CELSIUS: "°C",
};
const VERIFICATION_LABELS = { unverified: "Unverified", verified: "Verified", resolved: "Resolved" } as const;
const APPROVAL_LABELS = { unknown: "Approval unknown", proposed: "Proposed", authorised: "Authorised" } as const;
const SAFETY_TEXT = {
  NOT_ASSESSED: { title: "Safety not assessed", body: "No formal safety assessment has been recorded for this report. Treat site conditions as unverified until one is recorded." },
  PENDING_VERIFICATION: { title: "Safety assessment pending verification", body: "A safety assessment has been recorded but is not yet verified. Confirm before relying on it." },
  ASSESSED: { title: "Safety assessed", body: "A safety assessment has been recorded for this report." },
} as const;

function formatMoney(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("en-AU", { style: "currency", currency });
}

function Empty({ children }: { children: string }) {
  return <p className={styles.noEvidence}>{children}</p>;
}

// Every style renders this same content; styles differ only in CSS layout.
function SnapshotReport({ snapshot }: { snapshot: ReportExperienceSnapshot }) {
  const safety = SAFETY_TEXT[snapshot.safetyAssessment];
  return (
    <>
      <div className={styles.documentHead}>
        <p className={styles.documentEyebrow}>REPORT {snapshot.reportNumber} / REVISION {snapshot.revision}</p>
        <span className={styles.revision}>{snapshot.status}</span>
      </div>
      <section className={styles.hero}>
        <div>
          <p className={styles.heroKicker}>{snapshot.brand.businessName}</p>
          <h2>Report {snapshot.reportNumber}</h2>
          {snapshot.propertyAddress ? <p>{snapshot.propertyAddress}</p> : null}
        </div>
      </section>

      <section className={styles.safety} role="note" aria-label="Safety assessment" data-assessment={snapshot.safetyAssessment}>
        <span className={styles.safetySymbol} aria-hidden="true">!</span>
        <div><strong>{safety.title}</strong><p>{safety.body}</p></div>
      </section>

      <div className={styles.snapshotGrid}>
        <section className={styles.snapshotPanel} aria-labelledby="snap-hazards">
          <h3 id="snap-hazards">Hazards</h3>
          {snapshot.hazards.length === 0 ? <Empty>No hazards are shown in this preview. Check the records listed as not shown.</Empty> : (
            <ul className={styles.snapshotList}>
              {snapshot.hazards.map((hazard) => (
                <li key={hazard.id} data-verification={hazard.verification}>
                  <strong>{hazard.title}</strong>
                  <span className={styles.stateTag}>{VERIFICATION_LABELS[hazard.verification]}</span>
                  <p>{hazard.action}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.snapshotPanel} aria-labelledby="snap-readings">
          <h3 id="snap-readings">Moisture readings</h3>
          {snapshot.moistureReadings.length === 0 ? <Empty>No moisture readings are shown in this preview. Check the records listed as not shown.</Empty> : (
            <table className={styles.compactTable}>
              <thead><tr><th>Room</th><th>Reading</th><th>Observed</th></tr></thead>
              <tbody>
                {snapshot.moistureReadings.map((reading) => (
                  <tr key={reading.id}>
                    <td>{reading.roomId}</td>
                    <td>{reading.value} {UNIT_LABELS[reading.unit]}</td>
                    <td><time dateTime={reading.observedAt}>{reading.observedAt}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.snapshotPanel} aria-labelledby="snap-scope">
          <h3 id="snap-scope">Scope of work</h3>
          {snapshot.scopeItems.length === 0 ? <Empty>No scope items are shown in this preview. Check the records listed as not shown.</Empty> : (
            <ul className={styles.snapshotList}>
              {snapshot.scopeItems.map((item) => (
                <li key={item.id} data-approval={item.approvalStatus}>
                  <strong>{item.description}</strong>
                  <span className={styles.stateTag}>{APPROVAL_LABELS[item.approvalStatus]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.snapshotPanel} aria-labelledby="snap-money">
          <h3 id="snap-money">Estimate</h3>
          {snapshot.financials ? (
            <p className={styles.money}>
              <strong>{formatMoney(snapshot.financials.estimatedTotalCents, snapshot.financials.currency)}</strong>
              <span className={styles.stateTag}>{snapshot.financials.estimateStatus === "approved" ? "Approved estimate" : "Draft estimate"}</span>
            </p>
          ) : <Empty>No financial estimate is shown in this preview.</Empty>}
        </section>
      </div>

      <footer className={styles.documentFoot}>
        <span>Revision {snapshot.revision}, created {snapshot.revisionCreatedAt}</span>
        <span>Content digest (SHA-256) {snapshot.contentDigestSha256}</span>
      </footer>
    </>
  );
}

export function ReportDesignStudio({ snapshot }: { snapshot?: ReportExperienceSnapshot } = {}) {
  const [themeId, setThemeId] = useState<ReportThemeId>("executive-modern");
  const [play, setPlay] = useState(false);
  const [pdfView, setPdfView] = useState(false);
  const [compact, setCompact] = useState(false);

  const plan = planReportExperience({
    themeId,
    viewer: pdfView ? "pdf" : "web",
    authorisedAvailableModules: DEMO_MODULES,
    prefersReducedMotion: !play,
  });
  const featured = plan.interactiveModules.length
    ? plan.interactiveModules
    : plan.staticModules.map(({ id }) => id);
  const animated = plan.motionAllowed && play;
  const displayModules = [...featured.filter((value) => value !== "evidence-audio")].slice(0, 3);

  return (
    <main className={styles.studio} data-testid="report-design-studio">
      <header className={styles.studioHead}>
        <div><p className={styles.eyebrow}>RESTOREASSIST / REPORT EXPERIENCE STUDIO</p>
          <h1>{snapshot ? "Ten ways to tell one accurate story." : "Ten ways to tell one accurate story (synthetic sample)."}</h1>
          <p>{snapshot
            ? "Explore the same report in ten visual treatments. Styling changes. Evidence does not."
            : "Explore the same synthetic inspection in ten visual treatments. Styling changes. Evidence does not."}</p>
        </div>
        <span className={styles.demoStamp}>{snapshot ? "REPORT SNAPSHOT · EVIDENCE FROM THIS REPORT ONLY" : "DESIGN LAB · SYNTHETIC DATA"}</span>
      </header>
      <section aria-labelledby="choose-style" className={styles.selector}>
        <div className={styles.selectorHead}><h2 id="choose-style">Choose your design</h2><span>01–10 / all included</span></div>
        <div className={styles.themeGrid}>
          {REPORT_THEMES.map((theme, i) => (
            <Button key={theme.id} type="button" variant="outline"
              className={styles.themeButton} data-active={theme.id === themeId}
              aria-pressed={theme.id === themeId}
              onClick={() => { setThemeId(theme.id); setPlay(false); }}
            >
              <span className={styles.themeNumber}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.swatch} data-swatch={theme.id} aria-hidden="true" />
              <span className={styles.themeLabel}>{theme.label}</span>
            </Button>
          ))}
        </div>
      </section>

      <section aria-label="Report preview controls" className={styles.controls}>
        <div className={styles.currentStyle}><strong>{plan.theme.label}</strong><span>{plan.theme.description}</span></div>
        <div className={styles.controlButtons}>
          <Button type="button" variant="outline" size="sm" aria-pressed={!pdfView} onClick={() => setPdfView(false)}>Interactive web</Button>
          <Button type="button" variant="outline" size="sm" aria-pressed={pdfView} onClick={() => { setPdfView(true); setPlay(false); }}>Print / PDF</Button>
          <Button type="button" variant="outline" size="sm" aria-pressed={compact} onClick={() => setCompact(!compact)}>Compact {compact ? "on" : "off"}</Button>
          {snapshot ? null : (
            <Button type="button" variant="outline" size="sm" disabled={pdfView}
              aria-pressed={play}
              onClick={() => setPlay((value) => !value)}>{play ? "Pause motion" : "Preview motion"}</Button>
          )}
        </div>
      </section>

      <article id="visual-report-content" className={styles.report} data-theme={themeId} data-compact={compact} data-pdf={pdfView}
        data-layout={plan.theme.layout}
        data-animated={animated} aria-label={`${plan.theme.label} ${snapshot ? "" : "synthetic "}report preview`}>
        {snapshot ? <SnapshotReport snapshot={snapshot} /> : <>
        <div className={styles.documentHead}>
          <p className={styles.documentEyebrow}>INSPECTION / SAMPLE REPORT 0001 / REVISION A</p>
          <span className={styles.revision}>DRAFT CONCEPT · NOT FOR CLAIM USE</span>
        </div>
        <section className={styles.hero}>
          <div><p className={styles.heroKicker}>{plan.theme.layout === "story" ? "From observation to action" : "Property condition review"}</p>
            <h2>Understand the damage. Make the next decision clear.</h2>
            <p>Illustrative Australian residential water-damage assessment. No actual address, insurer or property record is linked.</p>
            <div className={styles.heroTags}><span>Sample inspection</span><span>Five illustrative readings</span><span>Two unverified risks</span></div>
          </div>
          <div className={styles.heroGraphic} aria-hidden="true"><span className={styles.graphicCircle}><span className={styles.graphicInner} /></span><span className={styles.graphicLine} /></div>
        </section>

        <section className={styles.metrics} aria-label="Illustrative report summary">
          <div><span>Inspection areas</span><strong>3</strong><small>Synthetic floor plan</small></div>
          <div><span>Recorded example readings</span><strong>5</strong><small>Not a drying conclusion</small></div>
          <div><span>Items needing verification</span><strong>2</strong><small>Unconfirmed hazards</small></div>
          <div><span>Authorised work</span><strong>Unknown</strong><small>Approval not supplied</small></div>
        </section>

        <section className={styles.safety} role="note" aria-label="Safety warning, unverified example">
          <span className={styles.safetySymbol} aria-hidden="true">!</span>
          <div><strong>Safety comes before presentation.</strong>
            <p>Possible electrical exposure is marked for demonstration. A real report must show source, risk priority, required action and verification status.</p>
          </div>
          <span className={styles.safetyFlag}>Requires verification</span>
        </section>

        <div className={styles.mainContent}>
          <section className={styles.storyIntro}>
            <p className={styles.eyebrow}>VISUAL EVIDENCE</p>
            <h3>{plan.theme.layout === "spatial" ? "See the site in context" : plan.theme.layout === "dashboard" ? "Read the facts behind the decision" : "How the work could unfold"}</h3>
            <p>{plan.theme.description} Each visual is illustrative, with verified inputs required before it can be used in a real claim.</p>
          </section>
          <div className={styles.modules}>
            {displayModules.map((module) => <EvidencePanel key={module} module={module} animated={animated} />)}
          </div>
        </div>

        <section className={styles.reportFoot}>
          <div><h3>Limits and missing evidence</h3><p>No property measurements, actual photos, signed authority, certified geometry, or real hazards were supplied. Nothing on this page is suitable for a claim or technical decision.</p></div>
          <div><h3>Required evidence and sign-off</h3><p>Authenticated technician, inspection timestamp, validated readings, relevant standards citations and an auditable approval are mandatory in the real report workflow.</p></div>
        </section>
        <footer className={styles.documentFoot}><span>EXAMPLE DATA · REPORT EXPERIENCE CONCEPT</span><span>All {ALWAYS_VISIBLE_REPORT_SECTIONS.length} mandatory report sections preserved across themes</span></footer>
        </>}
      </article>
      <p className={styles.studioFootnote}>{snapshot ? "Layout preview only. The inspection report and PDF generator remain unchanged. PDF mode is a static layout preview, not a verified generated PDF." : "Prototype only. The live inspection report and PDF generator remain unchanged. PDF mode is a static layout preview, not a verified generated PDF."}</p>
    </main>
  );
}
