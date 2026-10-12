import { describe, it, expect } from "vitest";
import { plainRoomLabel, plainStatusSentence } from "../consumer-plain-language";

describe("consumer-plain-language", () => {
  it("maps common rooms without measurements", () => {
    expect(plainRoomLabel("Main bathroom")).toBe("Bathroom");
  });

  it("avoids technical status tokens in copy", () => {
    expect(plainStatusSentence("CLASSIFIED")).not.toMatch(/CLASS_/);
    expect(plainStatusSentence("CLASSIFIED").length).toBeGreaterThan(10);
  });
});
