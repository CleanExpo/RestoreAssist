// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AiProviderBanner } from "../AiProviderBanner";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const pathname = vi.fn(() => "/dashboard");
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

const missingKey = {
  isComplete: false,
  incompleteSteps: ["ai_provider"],
  nextStep: "ai_provider",
  steps: {
    ai_provider: {
      completed: false,
      required: true,
      title: "Add your Anthropic or OpenAI API key",
      description: "required",
      route: "/dashboard/settings/ai-providers",
    },
  },
};

beforeEach(() => {
  fetchMock.mockReset();
  pathname.mockReturnValue("/dashboard");
});

describe("AiProviderBanner", () => {
  it("renders nothing until the status call resolves", () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const { container } = render(<AiProviderBanner />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/Reports will not generate/)).not.toBeInTheDocument();
  });

  it("renders nothing when the status call fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const { container } = render(<AiProviderBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the status call is not ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => missingKey,
    });
    const { container } = render(<AiProviderBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the AI key step is already complete", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...missingKey,
        isComplete: true,
        incompleteSteps: [],
        steps: {
          ai_provider: { ...missingKey.steps.ai_provider, completed: true, required: false },
        },
      }),
    });
    const { container } = render(<AiProviderBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("names the report-generation consequence when the key is missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => missingKey,
    });
    render(<AiProviderBanner />);
    await waitFor(() =>
      expect(
        screen.getByText(/Reports will not generate without an AI key/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Add AI key" })).toHaveAttribute(
      "href",
      "/dashboard/settings/ai-providers",
    );
    expect(screen.queryByText(/Add your Anthropic or OpenAI API key/)).not.toBeInTheDocument();
  });

  it("stays hidden on the AI-providers settings page", async () => {
    pathname.mockReturnValue("/dashboard/settings/ai-providers");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => missingKey,
    });
    const { container } = render(<AiProviderBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});
