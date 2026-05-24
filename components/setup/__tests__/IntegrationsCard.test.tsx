// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IntegrationsCard } from "../IntegrationsCard";

beforeEach(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...window.location, href: "" },
  });
});

describe("IntegrationsCard", () => {
  it("renders all 5 provider buttons", () => {
    render(<IntegrationsCard />);
    expect(screen.getByLabelText(/connect xero/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/connect myob/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/connect quickbooks/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/connect servicem8/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/connect ascora/i)).toBeInTheDocument();
  });

  it("clicking Xero POSTs to OAuth connect and navigates to returned authUrl", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authUrl: "/api/integrations/oauth/xero/start-redirect",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect xero/i));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/integrations/oauth/xero/connect",
        { method: "POST" },
      );
      expect(window.location.href).toContain("xero");
    });

    vi.unstubAllGlobals();
  });

  it("BYOK section collapses + expands", () => {
    render(<IntegrationsCard />);
    const toggle = screen.getByText(/byok ai keys/i);
    expect(
      screen.queryByRole("button", { name: /manage ai keys/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: /manage ai keys/i }),
    ).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(
      screen.queryByRole("button", { name: /manage ai keys/i }),
    ).not.toBeInTheDocument();
  });

  it("Manage AI keys button navigates to the settings page", () => {
    render(<IntegrationsCard />);
    fireEvent.click(screen.getByText(/byok ai keys/i));
    fireEvent.click(screen.getByRole("button", { name: /manage ai keys/i }));
    expect(window.location.href).toContain("/dashboard/settings/ai-providers");
  });
});
