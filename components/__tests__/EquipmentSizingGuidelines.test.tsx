// @vitest-environment jsdom
// RA-6934 item 6: pins the metric (m²) equipment sizing computation after
// the imperial/metric mismatch fix. affectedArea is m², matching the ratios
// exported from lib/equipment-calculator.ts (AIR_MOVER_RATIO / DEHU_RATIO /
// AIR_SCRUBBER_RATIO), not the previous divergent sq-ft-based ratios.
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// framer-motion: render motion.* as plain DOM elements (no animation timers).
vi.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = (tag: string) =>
    React.forwardRef(
      (
        {
          children,
          initial: _initial,
          animate: _animate,
          whileInView: _whileInView,
          whileHover: _whileHover,
          whileTap: _whileTap,
          viewport: _viewport,
          transition: _transition,
          ...rest
        }: Record<string, unknown>,
        ref: unknown,
      ) =>
        React.createElement(tag, { ref, ...rest }, children as React.ReactNode),
    );
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

import EquipmentSizingGuidelines from "../EquipmentSizingGuidelines";

describe("EquipmentSizingGuidelines — metric (m²) sizing", () => {
  it("computes airmover/dehumidifier counts from m² ratios for Class 2 / Category 1", () => {
    const onSizingUpdate = vi.fn();

    render(
      <EquipmentSizingGuidelines
        waterClass="Class 2"
        affectedArea={30}
        waterCategory="Category 1"
        onSizingUpdate={onSizingUpdate}
      />,
    );

    expect(onSizingUpdate).toHaveBeenCalled();
    const sizing = onSizingUpdate.mock.calls.at(-1)![0];

    // AIR_MOVER_RATIO.CLASS_2 = 15 m² per unit → ceil(30 / 15) = 2
    expect(sizing.airmovers.count).toBe(2);
    expect(sizing.airmovers.airflow).toBe(4000);

    // DEHU_RATIO.CLASS_2 = 40 m² per unit → ceil(30 / 40) = 1 unit; 1 * 30L/day
    expect(sizing.dehumidifiers.count).toBe(1);
    expect(sizing.dehumidifiers.capacity).toBe(30);

    // Category 1 — no special equipment required
    expect(sizing.specialEquipment.hepaVacuums).toBe(0);
    expect(sizing.specialEquipment.airScrubbers).toBe(0);
    expect(sizing.specialEquipment.negativePressure).toBe(false);
  });

  it("computes aggressive-tier counts from m² ratios for Class 3 / Category 3", () => {
    const onSizingUpdate = vi.fn();

    render(
      <EquipmentSizingGuidelines
        waterClass="Class 3"
        affectedArea={120}
        waterCategory="Category 3"
        onSizingUpdate={onSizingUpdate}
      />,
    );

    const sizing = onSizingUpdate.mock.calls.at(-1)![0];

    // AIR_MOVER_RATIO.CLASS_3 = 10 m² per unit → ceil(120 / 10) = 12
    expect(sizing.airmovers.count).toBe(12);

    // DEHU_RATIO.CLASS_3 = 30 m² per unit → ceil(120 / 30) = 4 units; 4 * 40L/day
    expect(sizing.dehumidifiers.count).toBe(4);
    expect(sizing.dehumidifiers.capacity).toBe(160);

    // Category 3 — AIR_SCRUBBER_RATIO.CLASS_3 = 50 m² per unit → ceil(120/50) = 3
    expect(sizing.specialEquipment.airScrubbers).toBe(3);
    expect(sizing.specialEquipment.negativePressure).toBe(true);
  });
});
