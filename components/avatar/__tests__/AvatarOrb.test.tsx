// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AvatarOrb } from "../AvatarOrb";

afterEach(() => cleanup());

describe("AvatarOrb graceful fallback", () => {
  it("opens the assistant chatbox when no video URL is provided", () => {
    render(<AvatarOrb greetingText="Hello from Phill" />);

    const orb = screen.getByRole("button", {
      name: /open restoreassist assistant/i,
    });
    fireEvent.click(orb);

    // Chat dialog opens — not an empty video modal.
    expect(document.querySelector("video")).toBeNull();
    expect(screen.queryByText(/video coming soon/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: /restoreassist assistant/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hello from Phill")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/ask about restoreassist/i),
    ).toBeInTheDocument();
  });

  it("answers a suggested question inside the chatbox", () => {
    render(<AvatarOrb greetingText="Hello from Phill" />);

    fireEvent.click(
      screen.getByRole("button", { name: /open restoreassist assistant/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /what is restoreassist/i }),
    );

    expect(screen.getByText(/what is restoreassist\?/i)).toBeInTheDocument();
    // Brand description should appear as the assistant reply.
    expect(
      screen.getByText(/australia's first australian-designed full crm/i),
    ).toBeInTheDocument();
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
