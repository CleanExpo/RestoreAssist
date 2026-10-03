import { describe, expect, it } from "vitest";
import {
  formatRoomZoneLabel,
  inferRoomTypeFromLabel,
  nextRoomName,
  newRoomEntryId,
} from "../room-identity";

describe("NIR room identity", () => {
  it("keeps type and a numbered or custom name in the stored label", () => {
    expect(formatRoomZoneLabel("Bedroom", "4")).toBe("Bedroom 4");
    expect(formatRoomZoneLabel("Living Room", "Rear Lounge")).toBe(
      "Living Room — Rear Lounge",
    );
    expect(formatRoomZoneLabel("Other", "Media Room")).toBe("Media Room");
    expect(formatRoomZoneLabel("Bedroom", "Bedroom 4")).toBe("Bedroom 4");
    expect(formatRoomZoneLabel("Bedroom", "  Bedroom   4 ")).toBe("Bedroom 4");
    expect(formatRoomZoneLabel("Bedroom", "Bedroomette")).toBe(
      "Bedroom — Bedroomette",
    );
  });

  it("suggests a distinct repeat without rewriting legacy room names", () => {
    const labels = ["Bedroom", "Bedroom 2", "Bedroom 4", "Living Room"];
    expect(nextRoomName("Bedroom", labels)).toBe("5");
    expect(nextRoomName("Living Room", labels)).toBe("2");
    expect(nextRoomName("Other", labels)).toBe("");
  });

  it("reads labels from old drafts without inventing a type", () => {
    expect(inferRoomTypeFromLabel("Bedroom 4")).toBe("Bedroom");
    expect(inferRoomTypeFromLabel("Living Room — Rear Lounge")).toBe(
      "Living Room",
    );
    expect(inferRoomTypeFromLabel("Front Lounge")).toBe("Other");
  });

  it("assigns unique IDs even when entries are added in one clock tick", () => {
    const first = newRoomEntryId();
    const second = newRoomEntryId();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[a-f\d-]{36}$/);
  });
});
