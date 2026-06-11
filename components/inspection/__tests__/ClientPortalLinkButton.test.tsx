// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientPortalLinkButton } from "../ClientPortalLinkButton";

beforeEach(() => vi.restoreAllMocks());

describe("ClientPortalLinkButton", () => {
  it("sends the portal link and surfaces it + an emailed confirmation", async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { url: "https://x/portal/TOK", emailed: true },
      }),
    });
    vi.stubGlobal("fetch", f);
    render(<ClientPortalLinkButton inspectionId="i1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Send claim portal to client" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Client portal link")).toHaveValue(
        "https://x/portal/TOK",
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/email/i);
    expect(f).toHaveBeenCalledWith(
      "/api/inspections/i1/client-portal-link",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces the API error message (e.g. no client email)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "no client email on file" } }),
      }),
    );
    render(<ClientPortalLinkButton inspectionId="i1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Send claim portal to client" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/no client email/i),
    );
    expect(
      screen.queryByLabelText("Client portal link"),
    ).not.toBeInTheDocument();
  });
});
