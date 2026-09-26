// @vitest-environment jsdom
/**
 * J-12: an unknown or expired /sign/<token> crashed to "Application Error".
 * The API answers 404 with { error: { code, message } }, and the page put
 * that object into JSX. The page must show the message instead.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useParams: () => ({ token: "not-a-real-token" }) }));
vi.mock("@/components/authority-forms/SignatureCanvas", () => ({
  SignatureCanvas: ({ onSave }: { onSave: (base64: string) => void }) => (
    <button type="button" onClick={() => onSave("data:image/png;base64,AAAA")}>
      draw signature
    </button>
  ),
}));

import { fireEvent } from "@testing-library/react";
import PublicSigningPage from "../sign/[token]/page";

const loadedForm = {
  signatory: { id: "sig_1", name: "Sam Client", role: "PROPERTY_OWNER", email: null },
  form: {
    id: "form_1",
    templateName: "Authority to Proceed",
    templateCode: "ATP",
    companyName: "Synthetic Restorations",
    companyLogo: null,
    companyPhone: null,
    companyEmail: null,
    clientName: "Sam Client",
    clientAddress: "1 Synthetic St",
    incidentBrief: null,
    incidentDate: null,
    authorityDescription: "Authority to begin drying works.",
    status: "PENDING",
    signatures: [],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("/sign/<token> with an unknown token (J-12)", () => {
  it("shows the expired-link message instead of crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: "NOT_FOUND", message: "Invalid or expired signing link" },
        }),
      })),
    );

    render(<PublicSigningPage />);

    expect(await screen.findByText("Invalid or expired signing link")).toBeInTheDocument();
    expect(screen.getByText("Unable to Load Form")).toBeInTheDocument();
  });

  it("shows the message when submitting the signature fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? {
              ok: false,
              status: 404,
              json: async () => ({
                error: { code: "NOT_FOUND", message: "Invalid or expired signing link" },
              }),
            }
          : { ok: true, status: 200, json: async () => loadedForm },
      ),
    );

    render(<PublicSigningPage />);
    fireEvent.click(await screen.findByText("draw signature"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Sign & Submit/ }));

    expect(await screen.findByText("Invalid or expired signing link")).toBeInTheDocument();
  });

  it("still shows a plain-string error from an older response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "This link has been revoked" }),
      })),
    );

    render(<PublicSigningPage />);

    expect(await screen.findByText("This link has been revoked")).toBeInTheDocument();
  });
});
