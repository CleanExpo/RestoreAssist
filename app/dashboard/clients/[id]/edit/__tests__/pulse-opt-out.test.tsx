// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "client-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn() } }));

import ClientEditPage from "../page";

const LABEL = "Client asked to stop automated job updates";
const fetchClient = vi.fn();

function loadClient(pulseOptOut: boolean) {
  fetchClient.mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "client-1",
      name: "Client One",
      email: "client@example.test",
      notes: "",
      pulseOptOut,
    }),
  });
}

beforeEach(() => {
  fetchClient.mockReset();
  vi.stubGlobal("fetch", fetchClient);
});
afterEach(() => vi.unstubAllGlobals());

describe("client edit: automated email opt-out", () => {
  it("lets a contractor record the opt-out and saves it", async () => {
    loadClient(false);
    render(<ClientEditPage />);
    const box = await screen.findByLabelText(LABEL);
    expect(box).not.toBeChecked();

    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      const put = fetchClient.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(put).toBeDefined();
      expect(JSON.parse(put![1].body).pulseOptOut).toBe(true);
    });
  });

  it("never lets a contractor clear a saved opt-out", async () => {
    loadClient(true);
    render(<ClientEditPage />);
    const box = await screen.findByLabelText(LABEL);
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
  });
});
