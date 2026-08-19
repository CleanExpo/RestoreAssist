// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StartClaimProgressButton } from "@/components/claims/StartClaimProgressButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // `vi.stubGlobal` has its own lifecycle and survives `restoreAllMocks`, and
  // this config sets no `unstubGlobals`, so the stubbed `fetch` below would
  // otherwise outlive the test that installed it.
  vi.unstubAllGlobals();
  push.mockReset();
});

/** A fetch that stays pending until the returned `resolve` is called. */
function deferredFetch() {
  let resolve!: (value: unknown) => void;
  const pending = new Promise((r) => {
    resolve = r;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => pending),
  );
  return {
    settle: (body: Record<string, unknown> = {}) =>
      resolve({ ok: true, status: 200, json: async () => body }),
  };
}

describe("StartClaimProgressButton", () => {
  it("shows no busy indicator at rest", () => {
    render(<StartClaimProgressButton reportId="r1" />);
    const button = screen.getByRole("button", {
      name: /start claim progress/i,
    });
    expect(button).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("surfaces a labelled busy indicator and disables the button in flight", async () => {
    const { settle } = deferredFetch();
    render(<StartClaimProgressButton reportId="r1" />);

    const button = screen.getByRole("button", {
      name: /start claim progress/i,
    });
    fireEvent.click(button);

    // The in-flight affordance must be announced, not merely animated: a
    // silent spinner leaves a screen-reader user with a dead button.
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(button).toBeDisabled();

    settle();
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    expect(button).toBeEnabled();
  });

  it("navigates to the claim once the POST succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );
    render(<StartClaimProgressButton reportId="r1" />);

    fireEvent.click(
      screen.getByRole("button", { name: /start claim progress/i }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/claims/r1"),
    );
  });

  it("re-enables the button when the POST fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      })),
    );
    render(<StartClaimProgressButton reportId="r1" />);

    const button = screen.getByRole("button", {
      name: /start claim progress/i,
    });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
