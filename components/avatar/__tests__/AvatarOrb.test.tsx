// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AvatarOrb } from "../AvatarOrb";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...rest
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={src} alt={alt} {...rest} />;
  },
}));

afterEach(() => cleanup());

describe("AvatarOrb graceful fallback", () => {
  it(
    "opens the Margot assistant chatbox when no video URL is provided",
    () => {
      render(<AvatarOrb greetingText="Hello from Margot" />);

      const orb = screen.getByRole("button", {
        name: /open margot/i,
      });
      fireEvent.click(orb);

      expect(document.querySelector("video")).toBeNull();
      expect(screen.queryByText(/video coming soon/i)).not.toBeInTheDocument();
      expect(
        screen.getByRole("dialog", { name: /margot assistant/i }),
      ).toBeInTheDocument();
      expect(screen.getByText("Hello from Margot")).toBeInTheDocument();
      expect(screen.getByText("Margot")).toBeInTheDocument();
      expect(screen.getByText("Client help")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/ask about restoreassist/i),
      ).toBeInTheDocument();
    },
    15_000,
  );

  it("answers a suggested question inside the chatbox", () => {
    render(<AvatarOrb greetingText="Hello from Margot" />);

    fireEvent.click(screen.getByRole("button", { name: /open margot/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /what is restoreassist/i }),
    );

    expect(screen.getByText(/what is restoreassist\?/i)).toBeInTheDocument();
    expect(
      screen.getByText(/australia's first australian-designed full crm/i),
    ).toBeInTheDocument();
  });

  it("opens the video modal when a greeting video URL is provided", () => {
    render(
      <AvatarOrb
        greetingVideoUrl="/videos/greeting.mp4"
        greetingText="Hello from Margot"
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
