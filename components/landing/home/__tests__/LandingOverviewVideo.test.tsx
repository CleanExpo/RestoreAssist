// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingOverviewVideo } from "../LandingOverviewVideo";
import { HOME } from "../homeContent";

describe("LandingOverviewVideo", () => {
  it("shows a play control and YouTube poster, not an iframe, until clicked", () => {
    const { container } = render(<LandingOverviewVideo />);

    expect(
      screen.getByRole("button", { name: HOME.overview.playLabel }),
    ).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.innerHTML).toContain(HOME.overview.youtubeId);
    expect(container.innerHTML).toContain("i.ytimg.com");
  });

  it("loads the privacy-friendly embed after play", () => {
    const { container } = render(<LandingOverviewVideo />);

    fireEvent.click(
      screen.getByRole("button", { name: HOME.overview.playLabel }),
    );

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe(
      `https://www.youtube-nocookie.com/embed/${HOME.overview.youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    );
    expect(iframe?.getAttribute("title")).toBe(HOME.overview.title);
    expect(iframe?.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-presentation allow-popups",
    );
    expect(iframe?.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(iframe?.getAttribute("allow")).not.toContain("clipboard-write");
  });
});
