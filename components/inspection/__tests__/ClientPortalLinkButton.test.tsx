// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientPortalLinkButton } from "../ClientPortalLinkButton";

beforeEach(() => vi.restoreAllMocks());

const readiness = {
  emailServiceConfigured: true,
  clientHasEmail: true,
  clientEmail: "client@example.com",
  reportId: null,
  reportStatus: null,
  reportPdfReady: false,
  reportDeliveredAt: null,
  portalLinkEmailedAt: null,
  clientEmailSentAt: null,
  completenessBlockerCount: 0,
};

describe("ClientPortalLinkButton", () => {
  it("sends the portal link and surfaces it + an emailed confirmation", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: readiness }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { url: "https://x/portal/TOK", emailed: true },
        }),
      });
    vi.stubGlobal("fetch", f);
    render(<ClientPortalLinkButton inspectionId="i1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send portal link" }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send portal link" }),
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
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { ...readiness, clientHasEmail: true },
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: { message: "no client email on file" } }),
        }),
    );
    render(<ClientPortalLinkButton inspectionId="i1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send portal link" }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send portal link" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/no client email/i),
    );
    expect(
      screen.queryByLabelText("Client portal link"),
    ).not.toBeInTheDocument();
  });

  // RA-8587 AC1: a link sent to the wrong person can be switched off.
  it("switches off the live link after confirmation by calling DELETE", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { ...readiness, portalLinkEmailedAt: "2026-11-20T00:00:00Z" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { revoked: 1 } }),
      });
    vi.stubGlobal("fetch", f);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ClientPortalLinkButton inspectionId="i1" />);
    const btn = await screen.findByRole("button", {
      name: "Switch off this link",
    });
    fireEvent.click(btn);
    expect(confirm).toHaveBeenCalledWith(
      expect.stringMatching(/signing requests/i),
    );
    await waitFor(() =>
      expect(f).toHaveBeenCalledWith(
        "/api/inspections/i1/client-portal-link",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/switched off/i),
    );
  });

  it("does not call DELETE when the confirmation is cancelled", async () => {
    const f = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { ...readiness, portalLinkEmailedAt: "2026-11-20T00:00:00Z" },
      }),
    });
    vi.stubGlobal("fetch", f);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ClientPortalLinkButton inspectionId="i1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Switch off this link" }),
    );
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("hides the switch-off action when no link has been sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: readiness }),
      }),
    );
    render(<ClientPortalLinkButton inspectionId="i1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send portal link" }),
      ).not.toBeDisabled(),
    );
    expect(
      screen.queryByRole("button", { name: "Switch off this link" }),
    ).not.toBeInTheDocument();
  });
});
