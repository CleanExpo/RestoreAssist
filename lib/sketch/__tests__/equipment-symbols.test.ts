import { describe, expect, it } from "vitest";
import {
  describeEquipmentSymbol,
  extractEquipmentLegend,
  isEquipmentKind,
  DEFAULT_EQUIPMENT_DIAMETER_M,
} from "../equipment-symbols";

describe("isEquipmentKind", () => {
  it("accepts known kinds", () => {
    expect(isEquipmentKind("dehumidifier")).toBe(true);
    expect(isEquipmentKind("air_mover")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isEquipmentKind("fan")).toBe(false);
    expect(isEquipmentKind(null)).toBe(false);
  });
});

describe("describeEquipmentSymbol", () => {
  it("places a symbol at the click point with stable equipment data", () => {
    const d = describeEquipmentSymbol({
      x: 120,
      y: 80,
      equipmentKind: "air_mover",
      pxPerMetre: 100,
      id: "equip-test",
    });
    expect(d.kind).toBe("equipment-symbol");
    expect(d.props.left).toBe(120);
    expect(d.props.top).toBe(80);
    expect(d.props.radius).toBeCloseTo((DEFAULT_EQUIPMENT_DIAMETER_M * 100) / 2);
    expect(d.props.short).toBe("AM");
    expect(d.data).toMatchObject({
      type: "equipment",
      equipmentKind: "air_mover",
      provenance: "operator_measured",
      id: "equip-test",
    });
  });

  it("scales radius with pxPerMetre", () => {
    const d = describeEquipmentSymbol({
      x: 0,
      y: 0,
      equipmentKind: "dehumidifier",
      pxPerMetre: 50,
      diameterM: 1,
    });
    expect(d.props.radius).toBe(25);
  });
});

describe("extractEquipmentLegend", () => {
  it("returns unique kinds in canonical order", () => {
    const legend = extractEquipmentLegend({
      objects: [
        { data: { type: "equipment", equipmentKind: "cavity_dryer" } },
        { data: { type: "equipment", equipmentKind: "dehumidifier" } },
        { data: { type: "equipment", equipmentKind: "dehumidifier" } },
        { data: { type: "room" } },
      ],
    });
    expect(legend.map((e) => e.kind)).toEqual([
      "dehumidifier",
      "cavity_dryer",
    ]);
    expect(legend[0].short).toBe("DH");
  });

  it("returns empty for missing fabric JSON", () => {
    expect(extractEquipmentLegend(null)).toEqual([]);
    expect(extractEquipmentLegend({})).toEqual([]);
  });
});
