/**
 * The initial-entry save accepts whole days from 1 to the Int column maximum.
 * Durations the form takes from PDF extraction or a saved draft are normalised
 * with toWholeDays before they reach form state, so a 2.5-day extraction does
 * not turn into a refused save.
 */
import { describe, expect, it } from "vitest";
import { toWholeDays } from "@/components/InitialDataEntryForm";

describe("toWholeDays", () => {
  it.each([
    [4, 4],
    [2.5, 3],
    [2.4, 2],
    ["6", 6],
    [2_147_483_647, 2_147_483_647],
  ])("normalises %p to %p", (input, expected) => {
    expect(toWholeDays(input)).toBe(expected);
  });

  it.each([
    [0], [-1], [0.4], [Number.NaN], [Number.POSITIVE_INFINITY], [2_147_483_648],
    ["abc"], [""], [null], [undefined], [true],
  ])("rejects %p", (input) => {
    expect(toWholeDays(input)).toBeNull();
  });
});
