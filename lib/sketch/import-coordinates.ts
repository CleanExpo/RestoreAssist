export interface NormalizedPoint {
  x: number;
  y: number;
}

interface CanvasDimensions {
  getWidth(): number;
  getHeight(): number;
}

export function mapNormalizedVerticesToCanvas(
  vertices: NormalizedPoint[],
  canvas: CanvasDimensions,
): NormalizedPoint[] {
  const width = canvas.getWidth();
  const height = canvas.getHeight();

  return vertices.map((vertex) => ({
    x: vertex.x * width,
    y: vertex.y * height,
  }));
}
