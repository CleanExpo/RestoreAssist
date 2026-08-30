const INCLUDED_TYPES = new Set([
  "room",
  "wall",
  "opening",
  "fixture",
  "damage",
  "equipment",
]);

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
  points?: unknown;
  text?: unknown;
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

function objectMarkup(object: SketchObject): string {
  const domainType = typeof object.data?.type === "string" ? object.data.type : "";
  if (!INCLUDED_TYPES.has(domainType)) return "";
  if (object.data?.provenance === "underlay_reference") return "";

  const left = finite(object.left);
  const top = finite(object.top);
  const scaleX = Math.max(0.01, Math.abs(finite(object.scaleX, 1)));
  const scaleY = Math.max(0.01, Math.abs(finite(object.scaleY, 1)));
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
  let shape = "";

  if (Array.isArray(object.points) && object.points.length >= 2) {
    const points = object.points
      .slice(0, 500)
      .map((point) => {
        const p = point as { x?: unknown; y?: unknown } | [unknown, unknown];
        const x = Array.isArray(p) ? p[0] : p.x;
        const y = Array.isArray(p) ? p[1] : p.y;
        return `${left + finite(x) * scaleX},${top + finite(y) * scaleY}`;
      })
      .join(" ");
    shape = `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  } else if (shapeType === "line" || (object.x2 != null && object.y2 != null)) {
    shape = `<line x1="${left + finite(object.x1)}" y1="${top + finite(object.y1)}" x2="${left + finite(object.x2)}" y2="${top + finite(object.y2)}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  } else if (shapeType === "circle" || object.radius != null) {
    const radius = Math.max(2, finite(object.radius, 12) * Math.max(scaleX, scaleY));
    shape = `<circle cx="${left + radius}" cy="${top + radius}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  } else {
    const width = Math.max(2, Math.abs(finite(object.width, 20) * scaleX));
    const height = Math.max(2, Math.abs(finite(object.height, 20) * scaleY));
    shape = `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }

  const label = object.data?.label ?? object.data?.name ?? object.text;
  if (typeof label !== "string" || !label.trim()) return shape;
  return `${shape}<text x="${left + 8}" y="${top + 22}" fill="#111827" font-family="Arial,sans-serif" font-size="18" font-weight="600">${escapeXml(label.trim())}</text>`;
}

/** Build source-free SVG from technician geometry only. */
export function buildCleanSketchSvg(sketchData: unknown): Buffer {
  const sketch =
    sketchData && typeof sketchData === "object"
      ? (sketchData as Record<string, unknown>)
      : {};
  const width = Math.round(Math.max(320, Math.min(4000, finite(sketch.canvasWidth, 1200))));
  const height = Math.round(Math.max(240, Math.min(4000, finite(sketch.canvasHeight, 800))));
  const objects = Array.isArray(sketch.objects) ? (sketch.objects as SketchObject[]) : [];
  const markup = objects.slice(0, 2000).map(objectMarkup).join("");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><g stroke-linejoin="round" stroke-linecap="round">${markup}</g></svg>`,
  );
}
