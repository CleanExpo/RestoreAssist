import { TriangleAlert } from "lucide-react";
import type { HazardModel } from "@/lib/report-experience/visuals/hazards";
import styles from "./visuals.module.css";

const VERIFICATION_TEXT = { unverified: "Not yet verified", verified: "Verified", resolved: "Resolved" } as const;

/**
 * Prioritised hazard cards with optional floor-plan hotspots. Everything a
 * reader needs is plain text in the page: the alert, the numbered cards and
 * the action for each. Hotspots only repeat that information on the plan.
 * The server-rendered markup is what the PDF uses, so it carries no state.
 */
export function HazardCards({ model, floorPlan }: { model: HazardModel; floorPlan?: { src: string; alt: string } | null }) {
  return (
    <section className={styles.panel} aria-labelledby="hazard-title" data-testid="hazard-cards">
      <h3 id="hazard-title">Hazards and safety actions</h3>

      {model.criticalAlert ? (
        <div className={styles.alert} role="alert" data-testid="critical-alert">
          <TriangleAlert aria-hidden="true" size={18} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
          CRITICAL DANGER: {model.criticalAlert.count} unresolved critical {model.criticalAlert.count === 1 ? "hazard" : "hazards"}. Do not start work in the affected area until the action below is complete.
          <p>{model.criticalAlert.titles.join("; ")}</p>
        </div>
      ) : null}

      {model.noHazardsRecorded ? (
        <p className={styles.flag}>No hazards are recorded for this report. This is not a safety clearance: it means no hazard has been entered.</p>
      ) : (
        <>
          {floorPlan && model.hotspots.length > 0 ? (
            <div className={styles.planFrame}>
              <img className={styles.planImage} src={floorPlan.src} alt={floorPlan.alt} />
              <ol aria-label="Hazard locations on the floor plan" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {model.hotspots.map((spot) => (
                  <li
                    key={spot.id}
                    className={styles.hotspot}
                    data-severity={spot.severity}
                    style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
                    title={`Hazard ${spot.number}`}
                  >
                    <span aria-hidden="true">{spot.number}</span>
                    <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Hazard {spot.number} location</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <ul className={styles.hazardList}>
            {model.cards.map((card) => (
              <li key={card.id} className={styles.hazard} data-severity={card.severity} data-verification={card.verification}>
                <div className={styles.hazardHead}>
                  <span className={styles.hazardNumber} aria-hidden="true">{card.number}</span>
                  {card.severity === "critical" ? <TriangleAlert aria-hidden="true" size={16} /> : null}
                  <span>Hazard {card.number}: {card.title}</span>
                </div>
                <p><strong>{card.severityLabel}.</strong> {VERIFICATION_TEXT[card.verification]}.</p>
                <p><strong>Action:</strong> {card.action}</p>
                <p>
                  {!card.locationRecorded
                    ? "Location on the floor plan not recorded."
                    : floorPlan
                      ? "Location marked on the floor plan."
                      : "Position recorded, but no floor plan is attached to show it."}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
