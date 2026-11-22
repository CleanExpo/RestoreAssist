"use client";

import { useState } from "react";
import type { ComparisonFrame, ComparisonPlan, ComparisonProblem } from "@/lib/report-experience/visuals/comparison";
import styles from "./visuals.module.css";

const PROBLEM_TEXT: Record<ComparisonProblem, string> = {
  "before-image-missing": "The before image is missing.",
  "after-image-missing": "The after image is missing.",
  "before-alt-text-missing": "The before image has no description.",
  "after-alt-text-missing": "The after image has no description.",
  "before-capture-time-missing": "The before photo has no recorded capture time.",
  "after-capture-time-missing": "The after photo has no recorded capture time.",
  "before-source-unknown": "The source of the before photo is not recorded.",
  "after-source-unknown": "The source of the after photo is not recorded.",
  "rooms-differ-or-missing": "The photos are not both recorded against the same room.",
  "after-not-later-than-before": "The after photo is not dated later than the before photo.",
};

function Frame({ frame, label }: { frame: ComparisonFrame; label: string }) {
  return (
    <figure className={styles.frame}>
      {frame.url ? (
        <img src={frame.url} alt={frame.alt} loading="lazy" />
      ) : (
        <p className={styles.flag}>No image available.</p>
      )}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/**
 * Before and after comparison. The drag slider is offered only when the plan
 * says the provenance supports it. The labelled side-by-side pair is always in
 * the markup for print and PDF, and is the only view when provenance is thin.
 */
export function ComparisonSlider({ plan, before, after }: { plan: ComparisonPlan; before: ComparisonFrame; after: ComparisonFrame }) {
  const [reveal, setReveal] = useState(50);
  const slider = plan.mode === "slider" && before.url && after.url;

  return (
    <section className={styles.panel} aria-labelledby="compare-title" data-testid="comparison">
      <h3 id="compare-title">Before and after</h3>
      <p className={styles.sub}>Each photo is labelled with when it was taken and where it came from.</p>

      {plan.problems.length > 0 ? (
        <div className={styles.flag} data-testid="comparison-problems">
          {plan.mode === "unavailable" ? "Comparison unavailable." : "Slider comparison withheld."}
          <ul>
            {plan.problems.map((problem) => <li key={problem}>{PROBLEM_TEXT[problem]}</li>)}
          </ul>
        </div>
      ) : null}

      {slider ? (
        <div className={styles.screenOnly} data-testid="comparison-slider">
          <div className={styles.slider}>
            <img className={styles.sliderImage} src={after.url as string} alt={after.alt} />
            <img className={styles.sliderImage} style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }} src={before.url as string} alt={before.alt} />
          </div>
          <div className={styles.sliderRange}>
            <label>
              Show more of the before photo or the after photo
              <input
                className={styles.range}
                type="range"
                min={0}
                max={100}
                step={1}
                value={reveal}
                aria-valuetext={`${reveal} percent before photo`}
                onChange={(event) => setReveal(Number(event.target.value))}
              />
            </label>
            <p className={styles.note}>Left: {plan.labels.before}. Right: {plan.labels.after}.</p>
          </div>
        </div>
      ) : null}

      <div className={slider ? styles.printOnly : undefined} data-testid="comparison-pair">
        <div className={styles.pair}>
          <Frame frame={before} label={plan.labels.before} />
          <Frame frame={after} label={plan.labels.after} />
        </div>
      </div>
    </section>
  );
}
