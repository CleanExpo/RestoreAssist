const INCLUDED_TYPES = new Set([
  "room",
  "wall",
  "opening",
  "fixture",
  "damage",
  "equipment",
]);

const MIN_FRAME_WIDTH = 1200;
const MIN_FRAME_HEIGHT = 800;
const MAX_FRAME = 4000;
const FRAME_MARGIN = 24;

type SketchObject = {
  type?: unknown;
  left?: unknown;
  top?: unknown;
  width?: unknown;
  height?: unknown;
  radius?: unknown;
  x1?: unknown;
  y1?: unknown;
  x2?: unknown;
  y2?: unknown;
  scaleX?: unknown;
  scaleY?: unknown;
  angle?: unknown;
  flipX?: unknown;
  flipY?: unknown;
  skewX?: unknown;
  skewY?: unknown;
  originX?: unknown;
  originY?: unknown;
  strokeWidth?: unknown;
  strokeUniform?: unknown;
  points?: unknown;
  text?: unknown;
  fontSize?: unknown;
  objects?: unknown;
  path?: unknown;
  data?: Record<string, unknown>;
};

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-20_000, Math.min(20_000, number)) : fallback;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .slice(0, 200)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

type ScenePoint = { x: number; y: number };

type SceneShape =
  | { kind: "polygon"; points: ScenePoint[] }
  | { kind: "polyline"; points: ScenePoint[] }
  | { kind: "line"; a: ScenePoint; b: ScenePoint }
  | { kind: "circle"; centre: ScenePoint; radius: number }
  | { kind: "text"; at: ScenePoint; text: string; size: number };

function originFraction(origin: unknown): number {
  if (origin === "left" || origin === "top") return 0;
  if (origin === "right" || origin === "bottom") return 1;
  return 0.5;
}

/**
 * Maps a point in the object's own frame (centred on the object) to the scene.
 * A saved Fabric object has its origin in left/top (the centre by default on
 * Fabric 7) and keeps points in creation coordinates, so left/top must not be
 * added to them as if they were offsets.
 */
function fabricToScene(object: SketchObject, width: number, height: number) {
  const scaleX = finite(object.scaleX, 1) * (object.flipX === true ? -1 : 1);
  const scaleY = finite(object.scaleY, 1) * (object.flipY === true ? -1 : 1);
  const radians = (finite(object.angle) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotate = (x: number, y: number): ScenePoint => ({
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  });
  const stroke = Math.max(0, finite(object.strokeWidth));
  const boxWidth =
    object.strokeUniform === true
      ? width * Math.abs(scaleX) + stroke
      : (width + stroke) * Math.abs(scaleX);
  const boxHeight =
    object.strokeUniform === true
      ? height * Math.abs(scaleY) + stroke
      : (height + stroke) * Math.abs(scaleY);
  const offset = rotate(
    (0.5 - originFraction(object.originX)) * boxWidth,
    (0.5 - originFraction(object.originY)) * boxHeight,
  );
  const centre = {
    x: finite(object.left) + offset.x,
    y: finite(object.top) + offset.y,
  };
  const tanX = Math.tan((finite(object.skewX) * Math.PI) / 180);
  const tanY = Math.tan((finite(object.skewY) * Math.PI) / 180);
  return (x: number, y: number): ScenePoint => {
    // Fabric's order: skew Y, then skew X, then scale, then rotate.
    const skewedY = y + tanY * x;
    const skewedX = x + tanX * skewedY;
    const turned = rotate(skewedX * scaleX, skewedY * scaleY);
    return { x: centre.x + turned.x, y: centre.y + turned.y };
  };
}

/** True when the object's transform keeps a circle round. */
function keepsCircleRound(object: SketchObject): boolean {
  return (
    Math.abs(Math.abs(finite(object.scaleX, 1)) - Math.abs(finite(object.scaleY, 1))) < 1e-6 &&
    finite(object.skewX) === 0 &&
    finite(object.skewY) === 0
  );
}

const CIRCLE_STEPS = 48;

/** A circle as points, for a transform that stretches it into an ellipse. */
function circleOutline(centre: ScenePoint, radius: number): ScenePoint[] {
  return Array.from({ length: CIRCLE_STEPS }, (_, i) => {
    const turn = (i * 2 * Math.PI) / CIRCLE_STEPS;
    return { x: centre.x + radius * Math.cos(turn), y: centre.y + radius * Math.sin(turn) };
  });
}

function rawPoints(object: SketchObject): ScenePoint[] {
  if (!Array.isArray(object.points)) return [];
  return object.points.slice(0, 500).map((point) => {
    const p = point as { x?: unknown; y?: unknown } | [unknown, unknown];
    return Array.isArray(p)
      ? { x: finite(p[0]), y: finite(p[1]) }
      : { x: finite(p.x), y: finite(p.y) };
  });
}

const CURVE_STEPS = 24;

/** Flattens saved Fabric path commands (M L Q C Z, absolute) to points. */
function flattenPath(path: unknown): ScenePoint[] {
  if (!Array.isArray(path)) return [];
  const points: ScenePoint[] = [];
  for (const entry of path.slice(0, 500)) {
    if (!Array.isArray(entry)) continue;
    const [command, ...raw] = entry;
    const n = raw.map((value) => finite(value));
    const from = points[points.length - 1];
    if ((command === "M" || command === "L") && n.length >= 2) {
      points.push({ x: n[0], y: n[1] });
    } else if (command === "Q" && n.length >= 4 && from) {
      for (let i = 1; i <= CURVE_STEPS; i += 1) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        points.push({
          x: u * u * from.x + 2 * u * t * n[0] + t * t * n[2],
          y: u * u * from.y + 2 * u * t * n[1] + t * t * n[3],
        });
      }
    } else if (command === "C" && n.length >= 6 && from) {
      for (let i = 1; i <= CURVE_STEPS; i += 1) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        points.push({
          x: u * u * u * from.x + 3 * u * u * t * n[0] + 3 * u * t * t * n[2] + t * t * t * n[4],
          y: u * u * u * from.y + 3 * u * u * t * n[1] + 3 * u * t * t * n[3] + t * t * t * n[5],
        });
      }
    } else if ((command === "Z" || command === "z") && points[0]) {
      points.push(points[0]);
    }
  }
  return points;
}

/** Geometry with no origin field is a plain bag, not saved Fabric output. */
function plainShape(object: SketchObject, shapeType: string): SceneShape {
  const left = finite(object.left);
  const top = finite(object.top);
  const scaleX = Math.max(0.01, Math.abs(finite(object.scaleX, 1)));
  const scaleY = Math.max(0.01, Math.abs(finite(object.scaleY, 1)));
  const points = rawPoints(object);
  if (points.length >= 2) {
    return {
      kind: "polygon",
      points: points.map((p) => ({ x: left + p.x * scaleX, y: top + p.y * scaleY })),
    };
  }
  if (shapeType === "line" || (object.x2 != null && object.y2 != null)) {
    return {
      kind: "line",
      a: { x: left + finite(object.x1), y: top + finite(object.y1) },
      b: { x: left + finite(object.x2), y: top + finite(object.y2) },
    };
  }
  if (shapeType === "circle" || object.radius != null) {
    const radius = Math.max(2, finite(object.radius, 12) * Math.max(scaleX, scaleY));
    return { kind: "circle", centre: { x: left + radius, y: top + radius }, radius };
  }
  const width = Math.max(2, finite(object.width, 20) * scaleX);
  const height = Math.max(2, finite(object.height, 20) * scaleY);
  return {
    kind: "polygon",
    points: [
      { x: left, y: top },
      { x: left + width, y: top },
      { x: left + width, y: top + height },
      { x: left, y: top + height },
    ],
  };
}

function fabricShape(object: SketchObject, shapeType: string): SceneShape {
  const pathPoints = flattenPath(object.path);
  const points = pathPoints.length >= 2 ? pathPoints : rawPoints(object);
  if (points.length >= 2) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const toScene = fabricToScene(object, maxX - minX, maxY - minY);
    const middleX = (minX + maxX) / 2;
    const middleY = (minY + maxY) / 2;
    return {
      kind: pathPoints.length >= 2 ? "polyline" : "polygon",
      points: points.map((p) => toScene(p.x - middleX, p.y - middleY)),
    };
  }
  const width = Math.abs(finite(object.width, 20));
  const height = Math.abs(finite(object.height, 20));
  const toScene = fabricToScene(object, width, height);
  if (shapeType === "line" || (object.x2 != null && object.y2 != null)) {
    return {
      kind: "line",
      a: toScene(finite(object.x1), finite(object.y1)),
      b: toScene(finite(object.x2), finite(object.y2)),
    };
  }
  if (shapeType === "circle" || object.radius != null) {
    if (!keepsCircleRound(object)) {
      return {
        kind: "polygon",
        points: circleOutline({ x: 0, y: 0 }, finite(object.radius, 12)).map((p) =>
          toScene(p.x, p.y),
        ),
      };
    }
    const scale = Math.abs(finite(object.scaleX, 1));
    return {
      kind: "circle",
      centre: toScene(0, 0),
      radius: Math.max(2, finite(object.radius, 12) * scale),
    };
  }
  if (shapeType === "triangle") {
    return {
      kind: "polygon",
      points: [
        toScene(0, -height / 2),
        toScene(width / 2, height / 2),
        toScene(-width / 2, height / 2),
      ],
    };
  }
  return {
    kind: "polygon",
    points: [
      toScene(-width / 2, -height / 2),
      toScene(width / 2, -height / 2),
      toScene(width / 2, height / 2),
      toScene(-width / 2, height / 2),
    ],
  };
}

function mapShape(
  shape: SceneShape,
  toScene: (x: number, y: number) => ScenePoint,
  scale: number,
  round: boolean,
): SceneShape {
  if (shape.kind === "polygon" || shape.kind === "polyline") {
    return { kind: shape.kind, points: shape.points.map((p) => toScene(p.x, p.y)) };
  }
  if (shape.kind === "line") {
    return {
      kind: "line",
      a: toScene(shape.a.x, shape.a.y),
      b: toScene(shape.b.x, shape.b.y),
    };
  }
  if (shape.kind === "circle") {
    if (!round) {
      return {
        kind: "polygon",
        points: circleOutline(shape.centre, shape.radius).map((p) => toScene(p.x, p.y)),
      };
    }
    return {
      kind: "circle",
      centre: toScene(shape.centre.x, shape.centre.y),
      radius: shape.radius * scale,
    };
  }
  return {
    ...shape,
    at: toScene(shape.at.x, shape.at.y),
    size: shape.size * scale,
  };
}

/**
 * A saved Fabric group holds its children relative to the group's centre, so
 * each child is resolved in that frame and then carried out by the group's own
 * transform. Equipment symbols are a circle and two captions saved this way.
 */
function fabricShapes(object: SketchObject, shapeType: string): SceneShape[] {
  const children = Array.isArray(object.objects)
    ? (object.objects as SketchObject[]).slice(0, 50)
    : [];
  if (children.length === 0) {
    if (typeof object.text === "string" && object.text.trim()) {
      const size = Math.max(
        1,
        finite(object.fontSize, 12) * Math.abs(finite(object.scaleY, 1)),
      );
      const toScene = fabricToScene(
        object,
        Math.abs(finite(object.width)),
        Math.abs(finite(object.height)),
      );
      return [{ kind: "text", at: toScene(0, 0), text: object.text, size }];
    }
    return [fabricShape(object, shapeType)];
  }
  const toScene = fabricToScene(
    object,
    Math.abs(finite(object.width, 20)),
    Math.abs(finite(object.height, 20)),
  );
  const scale = Math.max(
    Math.abs(finite(object.scaleX, 1)),
    Math.abs(finite(object.scaleY, 1)),
  );
  return children.flatMap((child) => {
    const childType = typeof child.type === "string" ? child.type.toLowerCase() : "";
    return fabricShapes(child, childType).map((shape) =>
      mapShape(shape, toScene, scale, keepsCircleRound(object)),
    );
  });
}

function shapeBounds(shape: SceneShape) {
  const points =
    shape.kind === "polygon" || shape.kind === "polyline"
      ? shape.points
      : shape.kind === "line"
        ? [shape.a, shape.b]
        : shape.kind === "text"
          ? [shape.at]
          : [
              { x: shape.centre.x - shape.radius, y: shape.centre.y - shape.radius },
              { x: shape.centre.x + shape.radius, y: shape.centre.y + shape.radius },
            ];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function objectMarkup(object: SketchObject): { markup: string; maxX: number; maxY: number } | null {
  const domainType = typeof object.data?.type === "string" ? object.data.type : "";
  if (!INCLUDED_TYPES.has(domainType)) return null;
  if (object.data?.provenance === "underlay_reference") return null;

  const stroke = domainType === "damage" ? "#dc2626" : "#1f2937";
  const fill =
    domainType === "damage"
      ? "rgba(239,68,68,0.22)"
      : domainType === "equipment"
        ? "rgba(14,165,233,0.18)"
        : domainType === "room"
          ? "#ffffff"
          : "none";
  const strokeWidth = domainType === "wall" ? 8 : 3;
  const shapeType = typeof object.type === "string" ? object.type.toLowerCase() : "";
  const scenes =
    typeof object.originX === "string"
      ? fabricShapes(object, shapeType)
      : [plainShape(object, shapeType)];
  const boxes = scenes.map(shapeBounds);
  const box = {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
  const shape = scenes
    .map((scene) => {
      if (scene.kind === "polygon") {
        const points = scene.points.map((p) => `${p.x},${p.y}`).join(" ");
        return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      }
      if (scene.kind === "polyline") {
        const points = scene.points.map((p) => `${p.x},${p.y}`).join(" ");
        return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      }
      if (scene.kind === "line") {
        return `<line x1="${scene.a.x}" y1="${scene.a.y}" x2="${scene.b.x}" y2="${scene.b.y}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      }
      if (scene.kind === "circle") {
        return `<circle cx="${scene.centre.x}" cy="${scene.centre.y}" r="${scene.radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      }
      return `<text x="${scene.at.x}" y="${scene.at.y + scene.size * 0.35}" fill="#111827" font-family="Arial,sans-serif" font-size="${scene.size}" text-anchor="middle">${escapeXml(scene.text)}</text>`;
    })
    .join("");

  const label = object.data?.label ?? object.data?.name ?? object.text;
  const markup =
    typeof label === "string" && label.trim()
      ? `${shape}<text x="${box.minX + 8}" y="${box.minY + 22}" fill="#111827" font-family="Arial,sans-serif" font-size="18" font-weight="600">${escapeXml(label.trim())}</text>`
      : shape;
  return { markup, maxX: box.maxX, maxY: box.maxY };
}

/** Build source-free SVG from technician geometry only. */
export function buildCleanSketchSvg(sketchData: unknown): Buffer {
  const sketch =
    sketchData && typeof sketchData === "object"
      ? (sketchData as Record<string, unknown>)
      : {};
  const objects = Array.isArray(sketch.objects) ? (sketch.objects as SketchObject[]) : [];
  const drawn = objects
    .slice(0, 2000)
    .map(objectMarkup)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  // The frame follows the drawing, not the panel it was drawn on. Pins read
  // this size back from the PNG, so nothing else needs to know it.
  const width = Math.round(
    Math.min(
      MAX_FRAME,
      Math.max(
        MIN_FRAME_WIDTH,
        finite(sketch.canvasWidth, 0),
        ...drawn.map((entry) => entry.maxX + FRAME_MARGIN),
      ),
    ),
  );
  const height = Math.round(
    Math.min(
      MAX_FRAME,
      Math.max(
        MIN_FRAME_HEIGHT,
        finite(sketch.canvasHeight, 0),
        ...drawn.map((entry) => entry.maxY + FRAME_MARGIN),
      ),
    ),
  );
  const markup = drawn.map((entry) => entry.markup).join("");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><g stroke-linejoin="round" stroke-linecap="round">${markup}</g></svg>`,
  );
}
