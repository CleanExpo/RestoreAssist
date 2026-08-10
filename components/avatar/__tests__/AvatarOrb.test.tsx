// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
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
    // jsx-a11y is not in config/eslint.config.mjs, and disabling a rule that is
    // not configured is itself an eslint error. The alt is passed through below.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...rest} />;
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it("answers a suggested question via public-chat API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response:
            "RestoreAssist is Australia's purpose-built CRM for restoration contractors.",
        }),
      }),
    );

    render(<AvatarOrb greetingText="Hello from Margot" />);

    fireEvent.click(screen.getByRole("button", { name: /open margot/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /what is restoreassist/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/purpose-built crm for restoration contractors/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/australia's first australian-designed full crm/i),
    ).not.toBeInTheDocument();
  });

  it("shows an honest offline message when public-chat fails", async () => {
    vi.stubGlobal(
      "fetch",
      // A generic upstream failure (not 429). 429 renders the distinct
      // rate-limit copy; this test asserts the honest offline message.
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    render(<AvatarOrb greetingText="Hello from Margot" />);

    fireEvent.click(screen.getByRole("button", { name: /open margot/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /what is restoreassist/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/having trouble connecting right now/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/try one of the suggested questions/i),
    ).not.toBeInTheDocument();
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
