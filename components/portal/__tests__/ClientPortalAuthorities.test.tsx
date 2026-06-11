// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientPortalAuthorities } from "../ClientPortalAuthorities";

beforeEach(() => vi.restoreAllMocks());

const authority = {
  id: "afi_1",
  name: "Authority to Commence Work",
  description: "Permission to start the restoration.",
  status: "PENDING_SIGNATURES",
  signToken: "sig_abc",
};

function fetchWith(authorities: unknown[]) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/authorities")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { authorities } }),
      });
    }
    // sign route
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe("ClientPortalAuthorities", () => {
  it("lists pending authorities for the token", async () => {
    vi.stubGlobal("fetch", fetchWith([authority]));
    render(<ClientPortalAuthorities token="tok" />);
    await waitFor(() =>
      expect(
        screen.getByText("Authority to Commence Work"),
      ).toBeInTheDocument(),
    );
  });

  it("signs an authority via the existing sign route with name + signature data", async () => {
    const f = fetchWith([authority]);
    vi.stubGlobal("fetch", f);
    render(<ClientPortalAuthorities token="tok" />);
    await waitFor(() => screen.getByText("Authority to Commence Work"));
    fireEvent.change(screen.getByLabelText(/Your full name to approve/i), {
      target: { value: "Jane Client" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Approve and sign/i }));
    await waitFor(() =>
      expect(screen.getByText(/Approved — thank you/i)).toBeInTheDocument(),
    );
    const signCall = f.mock.calls.find((c) =>
      String(c[0]).includes("/sign/sig_abc"),
    );
    expect(signCall).toBeTruthy();
    const sent = JSON.parse((signCall![1] as RequestInit).body as string);
    expect(sent.signatoryName).toBe("Jane Client");
    expect(sent.signatureData).toContain("data:image/svg+xml");
  });

  it("renders nothing when there are no pending authorities", async () => {
    vi.stubGlobal("fetch", fetchWith([]));
    const { container } = render(<ClientPortalAuthorities token="tok" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
