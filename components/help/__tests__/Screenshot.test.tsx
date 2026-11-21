// @vitest-environment jsdom
/**
 * RA-8403 — help articles showed broken screenshots: every Cloudinary public
 * ID they referenced returned 404. A screenshot now renders only when its ID
 * is on the published list, so an article never shows a broken image or a
 * grey placeholder box in its place.
 */
import "@testing-library/jest-dom/vitest";
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Screenshot from "../Screenshot";
import {
  PUBLISHED_HELP_SCREENSHOTS,
  isPublishedHelpScreenshot,
} from "@/lib/help/published-screenshots";

const ORIGINAL_CLOUDINARY_URL = process.env.CLOUDINARY_URL;

beforeEach(() => {
  process.env.CLOUDINARY_URL = "cloudinary://key:secret@test-cloud";
});

afterEach(() => {
  if (ORIGINAL_CLOUDINARY_URL === undefined) delete process.env.CLOUDINARY_URL;
  else process.env.CLOUDINARY_URL = ORIGINAL_CLOUDINARY_URL;
});

describe("help Screenshot (RA-8403)", () => {
  it("renders nothing for an image that was never uploaded", () => {
    const { container } = render(
      <Screenshot
        src="ra-help/never-uploaded-ra8403"
        alt="A screen that has no uploaded image"
        caption="Caption for a missing image"
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[role='img']")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the image for a published ID (control: the component can still show one)", () => {
    const { container } = render(
      <Screenshot
        src="ra-help/published-ra8403"
        alt="A published screen"
        published={new Set(["ra-help/published-ra8403"])}
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(decodeURIComponent(img!.getAttribute("src") ?? "")).toContain(
      "res.cloudinary.com/test-cloud/image/upload/",
    );
  });

  it("every help article image ID is either published or hidden", () => {
    const root = path.resolve(__dirname, "../../../data/content/help");
    const ids = new Set<string>();
    for (const category of fs.readdirSync(root)) {
      const dir = path.join(root, category);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const file of fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".mdx"))) {
        const text = fs.readFileSync(path.join(dir, file), "utf8");
        for (const m of text.matchAll(/ra-help\/[A-Za-z0-9/_-]+/g))
          ids.add(m[0]);
      }
    }
    // Positive control: the scan really finds the article images.
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) {
      const { container, unmount } = render(<Screenshot src={id} alt={id} />);
      expect(container.querySelector("img") !== null).toBe(
        isPublishedHelpScreenshot(id),
      );
      unmount();
    }
  });

  it("the published list holds only help IDs", () => {
    for (const id of PUBLISHED_HELP_SCREENSHOTS) {
      expect(id).toMatch(/^ra-help\//);
    }
  });
});
