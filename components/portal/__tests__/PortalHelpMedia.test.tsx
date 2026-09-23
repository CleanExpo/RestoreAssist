// @vitest-environment jsdom
/**
 * RA-7714 — /portal/help/* must never show an empty 0:00 player.
 *
 * A video with no source renders nothing. A video whose source fails to load
 * is removed from the page, and once every video is gone the whole
 * "Watch a short explainer" section goes with it.
 */
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortalHelpMedia } from "../PortalHelpMedia";
import type { ClientVideo } from "@/lib/portal/client-videos";

const GOOD: ClientVideo = {
  id: "good",
  title: "How drying works",
  description: "Why drying takes time.",
  url: "https://videos.example.test/drying.mp4",
};
const NO_SRC: ClientVideo = {
  id: "no-src",
  title: "Mapping the moisture",
  description: "How moisture is tracked.",
  url: "",
};
const BROKEN: ClientVideo = {
  id: "broken",
  title: "If mould is found",
  description: "What happens next.",
  url: "https://videos.example.test/missing.mp4",
};

describe("PortalHelpMedia", () => {
  it("renders no <video> element for a video with no source", () => {
    render(<PortalHelpMedia videos={[NO_SRC]} />);
    expect(document.querySelector("video")).toBeNull();
    expect(screen.queryByTestId("portal-help-media")).toBeNull();
    expect(screen.queryByText(NO_SRC.title)).toBeNull();
  });

  it("keeps a playable video and drops the one with no source", () => {
    render(<PortalHelpMedia videos={[GOOD, NO_SRC]} />);
    const videos = document.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    expect(videos[0].getAttribute("src")).toBe(GOOD.url);
    expect(screen.queryByText(NO_SRC.title)).toBeNull();
  });

  it("removes a video whose source fails to load", () => {
    render(<PortalHelpMedia videos={[GOOD, BROKEN]} />);
    expect(document.querySelectorAll("video")).toHaveLength(2);

    const broken = Array.from(document.querySelectorAll("video")).find(
      (v) => v.getAttribute("src") === BROKEN.url,
    )!;
    act(() => {
      fireEvent.error(broken);
    });

    const left = document.querySelectorAll("video");
    expect(left).toHaveLength(1);
    expect(left[0].getAttribute("src")).toBe(GOOD.url);
    expect(screen.queryByText(BROKEN.title)).toBeNull();
  });

  it("removes the whole section once every video has failed", () => {
    render(<PortalHelpMedia videos={[BROKEN]} />);
    act(() => {
      fireEvent.error(document.querySelector("video")!);
    });
    expect(document.querySelector("video")).toBeNull();
    expect(screen.queryByTestId("portal-help-media")).toBeNull();
  });
});
