// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VideoExplainer } from "../VideoExplainer";
import { getCaptionUrl } from "../caption-registry";
import { VIDEO_REGISTRY } from "../video-registry";

// Force the lazy IntersectionObserver gate open so the <video> mounts.
beforeEach(() => {
  const mockIO = class {
    cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
      // Defer callback to next microtask so 'observer' variable is assigned first
      Promise.resolve().then(() => {
        cb([{ isIntersecting: true } as IntersectionObserverEntry]);
      });
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.stubGlobal("IntersectionObserver", mockIO as any);
});

describe("VideoExplainer fallback", () => {
  it("falls back from the CDN and shows unavailable only when the local source also errors", async () => {
    render(<VideoExplainer slug="remotion-onboarding-welcome" trackEngagement={false} />);

    // Wait for the video element to be rendered (IntersectionObserver callback fires)
    await waitFor(() => {
      const video = document.querySelector("video");
      expect(video).not.toBeNull();
    });

    const cdnVideo = document.querySelector("video");
    expect(cdnVideo?.getAttribute("src")).toContain("res.cloudinary.com");
    fireEvent.error(cdnVideo!);

    await waitFor(() => {
      expect(document.querySelector("video")?.getAttribute("src")).toBe(
        "/videos/remotion/onboarding-welcome.mp4",
      );
    });

    fireEvent.error(document.querySelector("video")!);

    // After error fires, the fallback panel should appear
    await waitFor(() => {
      expect(screen.getByText(/video unavailable/i)).toBeInTheDocument();
    });
  });

  it("ships the registered mobile-workflow caption file with valid VTT content", () => {
    const entry = VIDEO_REGISTRY["remotion-mobile-workflow"];
    const captionUrl = getCaptionUrl(
      "remotion-mobile-workflow",
      entry.cloudinaryUrl ?? entry.localPath,
    );
    expect(captionUrl).toBe("/videos/captions/mobile-workflow.vtt");

    const captionPath = resolve(process.cwd(), "public", captionUrl!.slice(1));
    expect(existsSync(captionPath)).toBe(true);
    expect(readFileSync(captionPath, "utf8")).toMatch(/^WEBVTT\r?\n/);
  });
});
