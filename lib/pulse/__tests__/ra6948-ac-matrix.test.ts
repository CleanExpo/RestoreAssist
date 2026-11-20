/**
 * RA-6948 — acceptance criteria smoke (lib layer).
 */
import { describe, expect, it } from "vitest";
import { isPulseDemoOrReservedRecipient } from "../undeliverable-recipient";
import { PULSE_JOB_TOGGLE_HINT, PULSE_OPT_OUT_STAFF_NOTE } from "../pulse-inspection-ui-copy";

describe("RA-6948 acceptance matrix", () => {
  it("blocks RFC2606 example.com on pulse send path", () => {
    expect(isPulseDemoOrReservedRecipient("client@mail.example.com")).toBe(true);
  });

  it("allows registrable client domains", () => {
    expect(isPulseDemoOrReservedRecipient("client@restoration.com.au")).toBe(
      false,
    );
  });

  it("exports staff + job toggle copy", () => {
    expect(PULSE_JOB_TOGGLE_HINT).toMatch(/once per event/i);
    expect(PULSE_OPT_OUT_STAFF_NOTE).toMatch(/opted out/i);
  });
});
