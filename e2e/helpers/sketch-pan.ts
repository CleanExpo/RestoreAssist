import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Drag-pan the sketch canvas from a point that is actually on the Fabric canvas.
 *
 * The pan specs used to press at the centre of `sketch-canvas-host`. Since the
 * inspection hub embeds the editor with a 700px minimum canvas (fa86a28ec), the
 * host is taller than a 1280x720 viewport, so once the page scrolls the dock into
 * view the host's centre sits above the viewport. A press there never reaches
 * Fabric, the pan never starts, and the spec failed on the overlay attribute it
 * was meant to measure rather than on anything to do with panning.
 *
 * This picks the centre of the part of the host that is on screen and asserts
 * that the topmost element there is a <canvas> inside the host, so a press that
 * would land on chrome, a marker pin or nothing at all fails loudly here instead
 * of reading as "pan does not move the overlay".
 */
export async function dragPanOnCanvas(
  page: Page,
  host: Locator,
  delta: { dx: number; dy: number } = { dx: 80, dy: 40 },
): Promise<void> {
  const box = await host.boundingBox();
  expect(box, "canvas host bounding box").toBeTruthy();
  const vp = page.viewportSize();
  expect(vp, "viewport size").toBeTruthy();

  const top = Math.max(box!.y, 0);
  const bottom = Math.min(box!.y + box!.height, vp!.height);
  expect(
    bottom - top,
    "some of the canvas host must be on screen to pan it",
  ).toBeGreaterThan(2 * Math.abs(delta.dy) + 20);
  const x = box!.x + box!.width / 2;
  const y = (top + bottom) / 2;

  const hitsCanvas = await host.evaluate(
    (el, p) => {
      const hit = document.elementFromPoint(p.x, p.y);
      return !!hit && hit.tagName === "CANVAS" && el.contains(hit);
    },
    { x, y },
  );
  expect(
    hitsCanvas,
    `pan must start on the Fabric canvas inside the host (at ${Math.round(x)},${Math.round(y)})`,
  ).toBe(true);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + delta.dx, y + delta.dy);
  await page.mouse.up();
}
