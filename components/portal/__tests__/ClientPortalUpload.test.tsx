// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientPortalUpload } from "../ClientPortalUpload";

beforeEach(() => vi.restoreAllMocks());

describe("ClientPortalUpload", () => {
  it("disables Send until there's a photo or description", () => {
    render(<ClientPortalUpload token="tok" />);
    const send = screen.getByRole("button", { name: "Send to my assessor" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Water under the sink" },
    });
    expect(send).toBeEnabled();
  });

  it("submits a description to the token-gated evidence route + confirms", async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { submitted: 1 } }),
    });
    vi.stubGlobal("fetch", f);
    render(<ClientPortalUpload token="tok" />);
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Water under the sink" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send to my assessor" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /sent to your assessor/i,
      ),
    );
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe("/api/portal/tok/evidence");
    const sent = JSON.parse((opts as RequestInit).body as string);
    expect(sent.description).toBe("Water under the sink");
  });

  it("shows an error when the upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    render(<ClientPortalUpload token="tok" />);
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "x" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send to my assessor" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Couldn.t send/i),
    );
  });
});
