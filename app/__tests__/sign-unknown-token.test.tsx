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
vi.mock("@/components/authority-forms/SignatureCanvas", () => ({ SignatureCanvas: () => null }));

import PublicSigningPage from "../sign/[token]/page";

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
