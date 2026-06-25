// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VideoExplainer } from "../VideoExplainer";

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
  it("shows an 'unavailable' panel when the video source errors", async () => {
    render(<VideoExplainer slug="remotion-onboarding-welcome" trackEngagement={false} />);

    // Wait for the video element to be rendered (IntersectionObserver callback fires)
    await waitFor(() => {
      const video = document.querySelector("video");
      expect(video).not.toBeNull();
    });

    const video = document.querySelector("video");
    fireEvent.error(video!);

    // After error fires, the fallback panel should appear
    await waitFor(() => {
      expect(screen.getByText(/video unavailable/i)).toBeInTheDocument();
    });
  });
});
