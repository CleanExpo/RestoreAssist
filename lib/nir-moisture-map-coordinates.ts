interface CanvasPoint {
  x: number;
  y: number;
}

interface StoredMoistureMapPoint {
  mapX: number;
  mapY: number;
}

const NIR_MOISTURE_MAP_WIDTH = 800;
const NIR_MOISTURE_MAP_HEIGHT = 600;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function toNormalizedMoistureMapPoint(
  point: CanvasPoint,
): StoredMoistureMapPoint {
  return {
    mapX: clamp01(point.x / NIR_MOISTURE_MAP_WIDTH),
    mapY: clamp01(point.y / NIR_MOISTURE_MAP_HEIGHT),
  };
}

export function fromNormalizedMoistureMapPoint(
  point: StoredMoistureMapPoint,
): CanvasPoint {
  return {
    x: clamp01(point.mapX) * NIR_MOISTURE_MAP_WIDTH,
    y: clamp01(point.mapY) * NIR_MOISTURE_MAP_HEIGHT,
  };
}
