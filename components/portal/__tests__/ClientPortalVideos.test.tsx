// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ClientPortalVideos } from "../ClientPortalVideos";
import { CLIENT_PORTAL_VIDEOS } from "@/lib/portal/client-videos";

describe("client-videos config", () => {
  it("is non-empty with unique ids and real https video URLs", () => {
    expect(CLIENT_PORTAL_VIDEOS.length).toBeGreaterThan(0);
    const ids = new Set(CLIENT_PORTAL_VIDEOS.map((v) => v.id));
    expect(ids.size).toBe(CLIENT_PORTAL_VIDEOS.length);
    for (const v of CLIENT_PORTAL_VIDEOS) {
      expect(v.url).toMatch(/^https:\/\/res\.cloudinary\.com\/.+\.mp4$/);
      expect(v.title.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
    }
  });
});

describe("ClientPortalVideos", () => {
  it("renders a safe opener link per video", () => {
    render(<ClientPortalVideos />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(CLIENT_PORTAL_VIDEOS.length);
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
    expect(
      screen.getByText(/Water damage categories explained/),
    ).toBeInTheDocument();
  });
});
