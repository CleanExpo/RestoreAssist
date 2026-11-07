import { describe, expect, it } from "vitest";
import {
  PULSE_JOB_TOGGLE_HINT,
  PULSE_JOB_TOGGLE_LABEL,
} from "../pulse-inspection-ui-copy";

describe("pulse-inspection-ui-copy", () => {
  it("exports non-empty pulse toggle strings", () => {
    expect(PULSE_JOB_TOGGLE_LABEL.length).toBeGreaterThan(5);
    expect(PULSE_JOB_TOGGLE_HINT).toMatch(/Client Comms/i);
  });
});
