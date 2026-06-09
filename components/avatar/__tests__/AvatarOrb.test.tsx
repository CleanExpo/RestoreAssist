// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AvatarOrb } from "../AvatarOrb";

afterEach(() => cleanup());

describe("AvatarOrb graceful fallback", () => {
  it("does not open a video modal when no video URL is provided", () => {
    render(<AvatarOrb greetingText="Hello from Phill" />);

    const orb = screen.getByRole("button", {
      name: /show restoreassist greeting from phill/i,
    });
    fireEvent.click(orb);

    // No <video> element / modal should appear.
    expect(document.querySelector("video")).toBeNull();
    expect(screen.queryByText(/video coming soon/i)).not.toBeInTheDocument();
    // The greeting text is surfaced instead.
    expect(screen.getByText("Hello from Phill")).toBeInTheDocument();
  });

  it("opens the video modal when a greeting video URL is provided", () => {
    render(
      <AvatarOrb
        greetingVideoUrl="/videos/greeting.mp4"
        greetingText="Hello from Phill"
      />,
    );

    const orb = screen.getByRole("button", {
      name: /open restoreassist video greeting/i,
    });
    fireEvent.click(orb);

    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "/videos/greeting.mp4");
  });
});
