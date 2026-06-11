// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HomeownerCapturePanel } from "../HomeownerCapturePanel";

beforeEach(() => vi.restoreAllMocks());

function mockFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body });
}

describe("HomeownerCapturePanel", () => {
  it("invites a homeowner and surfaces the capture link", async () => {
    const f = mockFetch({ data: { url: "https://x/capture/TOK" } });
    vi.stubGlobal("fetch", f);
    render(<HomeownerCapturePanel inspectionId="i1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Invite homeowner to capture" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Capture link")).toHaveValue(
        "https://x/capture/TOK",
      ),
    );
    expect(f).toHaveBeenCalledWith(
      "/api/inspections/i1/capture-invite",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reviews/promotes a submission and reports the count", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { promoted: 2 } }));
    render(<HomeownerCapturePanel inspectionId="i1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review homeowner submission" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Promoted 2/),
    );
  });

  it("revokes active links", async () => {
    const f = mockFetch({ data: { revoked: 3 } });
    vi.stubGlobal("fetch", f);
    render(<HomeownerCapturePanel inspectionId="i1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke capture links" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Revoked 3/),
    );
    expect(f).toHaveBeenCalledWith(
      "/api/inspections/i1/capture-invite",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("shows an error message when the invite request fails", async () => {
    vi.stubGlobal("fetch", mockFetch({}, false));
    render(<HomeownerCapturePanel inspectionId="i1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Invite homeowner to capture" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Couldn’t create/),
    );
  });
});
