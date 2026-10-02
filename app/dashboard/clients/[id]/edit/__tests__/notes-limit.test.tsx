// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "client-1" }),
  useRouter: () => ({ push }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn() } }));

import ClientEditPage from "../page";

const fetchClient = vi.fn();
beforeEach(() => {
  push.mockReset();
  fetchClient.mockReset();
  fetchClient.mockResolvedValue({
    ok: true,
    json: async () => ({ id: "client-1", name: "Client One", email: "client@example.test", notes: "" }),
  });
  vi.stubGlobal("fetch", fetchClient);
});
afterEach(() => vi.unstubAllGlobals());

describe("standalone Client Notes edit", () => {
  it("keeps 5,001 entered characters visible and blocks the write with a clear message", async () => {
    render(<ClientEditPage />);
    const notes = await screen.findByLabelText("Notes");
    fireEvent.change(notes, { target: { value: "x".repeat(5_001) } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(notes).toHaveValue("x".repeat(5_001));
    expect(screen.getByText(/Notes must be 5,000 characters or fewer; nothing was saved/i)).toBeInTheDocument();
    expect(fetchClient).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("displays a structured API rejection as text", async () => {
    fetchClient.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "client-1", name: "Client One", email: "client@example.test", notes: "" }),
    }).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { code: "VALIDATION", message: "Notes must be 5,000 characters or fewer" } }),
    });
    render(<ClientEditPage />);
    await screen.findByLabelText("Notes");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(screen.getByText("Notes must be 5,000 characters or fewer")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
