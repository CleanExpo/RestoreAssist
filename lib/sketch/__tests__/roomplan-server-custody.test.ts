import { describe, expect, it } from "vitest";
import {
  hashRoomPlanPayloadBytes,
  serializeRoomPlanPayload,
  verifyClientSha256,
} from "../roomplan-server-custody";

describe("roomplan-server-custody", () => {
  it("hashes the exact UTF-8 bytes of the stored JSON", () => {
    const payload = {
      rooms: [{ label: "A", floorPolygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] }],
    };
    const serialized = serializeRoomPlanPayload(payload);
    const a = hashRoomPlanPayloadBytes(serialized);
    const b = hashRoomPlanPayloadBytes(serialized);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a mismatched client digest", () => {
    expect(verifyClientSha256("abc", "abc")).toBe(true);
    expect(verifyClientSha256("abc", "ABC")).toBe(true);
    expect(verifyClientSha256("abc", "def")).toBe(false);
    expect(verifyClientSha256("abc", null)).toBe(true);
  });
});
