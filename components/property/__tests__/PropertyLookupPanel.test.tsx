// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PropertyLookupPanel } from "../PropertyLookupPanel";

beforeEach(() => {
  vi.restoreAllMocks();
});

const PROPERTY = {
  address: "12 Test St, Brisbane QLD",
  beds: 4,
  baths: 2,
  carSpaces: 1,
  landSizeM2: 405,
  floorAreaM2: 180,
  propertyType: "House",
  source: "operator-parse",
  confidence: "high",
};

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/source url/i), {
    target: { value: "https://www.onthehouse.com.au/x" },
  });
  fireEvent.change(screen.getByLabelText(/page html/i), {
    target: { value: "<html>…</html>" },
  });
  fireEvent.click(screen.getByRole("button", { name: /extract/i }));
}

describe("PropertyLookupPanel", () => {
  it("disables Extract until URL + HTML are provided", () => {
    render(<PropertyLookupPanel />);
    expect(screen.getByRole("button", { name: /extract/i })).toBeDisabled();
  });

  it("POSTs to /api/property/parse and renders the structured result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ property: PROPERTY }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PropertyLookupPanel />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("12 Test St, Brisbane QLD")).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/property/parse",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("4")).toBeInTheDocument(); // beds
    expect(screen.getByText("405 m²")).toBeInTheDocument(); // land
  });

  it("shows an error when the parse fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422 }),
    );
    render(<PropertyLookupPanel />);
    fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/failed/i),
    );
  });
});
