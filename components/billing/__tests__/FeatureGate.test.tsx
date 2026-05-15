// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import FeatureGate from "../FeatureGate";

describe("FeatureGate", () => {
  it("passes click through when userTier includes feature", () => {
    let clicked = false;
    render(
      <FeatureGate feature="advanced-damage" userTier="PREMIUM" featureMap={{ "advanced-damage": ["PREMIUM", "ENTERPRISE"] }}>
        <button onClick={() => { clicked = true; }}>Run analysis</button>
      </FeatureGate>,
    );
    fireEvent.click(screen.getByText("Run analysis"));
    expect(clicked).toBe(true);
  });

  it("blocks click and opens modal when userTier missing feature", () => {
    let clicked = false;
    render(
      <FeatureGate feature="advanced-damage" userTier="STANDARD" featureMap={{ "advanced-damage": ["PREMIUM", "ENTERPRISE"] }}>
        <button onClick={() => { clicked = true; }}>Run analysis</button>
      </FeatureGate>,
    );
    fireEvent.click(screen.getByText("Run analysis"));
    expect(clicked).toBe(false);
    expect(screen.getByText(/unlock advanced-damage/i)).toBeInTheDocument();
  });
});
