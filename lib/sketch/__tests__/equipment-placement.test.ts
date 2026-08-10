import { describe, expect, it } from "vitest";
import { snapEquipmentPlacement } from "../equipment-placement";

const ROOM = {
  id: "r1",
  points: [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ],
};

describe("snapEquipmentPlacement", () => {
  it("keeps an interior click inside the room", () => {
    const r = snapEquipmentPlacement({ x: 200, y: 150 }, [ROOM], 100);
    expect(r.snappedTo).toBe("interior");
    expect(r.roomId).toBe("r1");
    expect(r.x).toBe(200);
    expect(r.y).toBe(150);
  });

  it("insets from a near-wall click toward the room centre", () => {
    const r = snapEquipmentPlacement({ x: 5, y: 150 }, [ROOM], 100, {
      nearWallM: 0.6,
      insetM: 0.35,
    });
    expect(r.snappedTo).toBe("near_wall");
    expect(r.roomId).toBe("r1");
    expect(r.x).toBeGreaterThan(20);
    expect(r.y).toBeCloseTo(150, 0);
  });

  it("leaves clicks far from rooms alone", () => {
    const r = snapEquipmentPlacement({ x: 900, y: 900 }, [ROOM], 100);
    expect(r.snappedTo).toBe("none");
    expect(r.x).toBe(900);
  });
});
