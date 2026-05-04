import { describe, expect, it } from "vitest";
import {
  localMetresToCanvas,
  localMetresToWgs84,
  wgs84PolygonToWallGraph,
  wgs84ToLocalMetres,
} from "../geo-transform";

describe("geo-transform — wgs84ToLocalMetres", () => {
  it("returns origin at zero", () => {
    const r = wgs84ToLocalMetres(
      { lat: -33.8688, lng: 151.2093 },
      { lat: -33.8688, lng: 151.2093 },
    );
    expect(r.x).toBeCloseTo(0, 4);
    expect(r.y).toBeCloseTo(0, 4);
  });

  it("round-trips through localMetresToWgs84", () => {
    const origin = { lat: -33.8688, lng: 151.2093 };
    const point = { lat: -33.8690, lng: 151.2095 };
    const local = wgs84ToLocalMetres(point, origin);
    const back = localMetresToWgs84(local, origin);
    expect(back.lat).toBeCloseTo(point.lat, 8);
    expect(back.lng).toBeCloseTo(point.lng, 8);
  });

  it("east of origin yields positive x; north yields positive y", () => {
    const origin = { lat: -33.8688, lng: 151.2093 };
    const east = wgs84ToLocalMetres(
      { lat: origin.lat, lng: origin.lng + 0.001 },
      origin,
    );
    const north = wgs84ToLocalMetres(
      { lat: origin.lat + 0.001, lng: origin.lng },
      origin,
    );
    expect(east.x).toBeGreaterThan(0);
    expect(north.y).toBeGreaterThan(0);
  });
});

describe("geo-transform — localMetresToCanvas", () => {
  it("flips y so north points up on canvas", () => {
    const r = localMetresToCanvas({ x: 1, y: 1 }, 100);
    expect(r.x).toBe(100);
    expect(r.y).toBe(-100);
  });
});

describe("geo-transform — wgs84PolygonToWallGraph", () => {
  it("converts a closed Polygon to a single floor with closed-loop walls", () => {
    // ~10 m × 10 m square in Sydney
    const lat = -33.8688;
    const lng = 151.2093;
    const dLat = 0.00009; // ~10 m north
    const dLng = 0.000108; // ~10 m east at this latitude
    const polygon = {
      type: "Polygon",
      coordinates: [
        [
          [lng, lat],
          [lng + dLng, lat],
          [lng + dLng, lat + dLat],
          [lng, lat + dLat],
          [lng, lat], // closing point
        ],
      ],
    };

    const graph = wgs84PolygonToWallGraph(polygon, { floorId: "f1" });
    expect(graph.floors).toHaveLength(1);
    const floor = graph.floors[0];
    expect(floor.sourceType).toBe("geoscape");
    expect(floor.corners).toHaveLength(4);
    expect(floor.walls).toHaveLength(4);
    expect(floor.walls.every((w) => w.isExterior)).toBe(true);
    // Walls form a closed loop.
    const lastWall = floor.walls[floor.walls.length - 1];
    const firstWall = floor.walls[0];
    expect(lastWall.to).toBe(firstWall.from);
  });

  it("supports MultiPolygon input by taking the first polygon", () => {
    const lat = -33.8688;
    const lng = 151.2093;
    const ring = [
      [lng, lat],
      [lng + 0.0001, lat],
      [lng + 0.0001, lat + 0.0001],
      [lng, lat + 0.0001],
      [lng, lat],
    ];
    const graph = wgs84PolygonToWallGraph(
      { type: "MultiPolygon", coordinates: [[ring]] },
      { floorId: "f1" },
    );
    expect(graph.floors[0].corners).toHaveLength(4);
  });

  it("rejects malformed input", () => {
    expect(() =>
      wgs84PolygonToWallGraph({ type: "Point" }, { floorId: "f1" }),
    ).toThrow();
  });
});
