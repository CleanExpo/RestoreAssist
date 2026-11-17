// @vitest-environment jsdom
/**
 * RA-8418 — a failed "Sign & Submit" must not throw away the form. The page
 * used to swap the whole form for an "Unable to Load Form" screen, losing the
 * drawn signature with no way to try again.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { canvasMounts } = vi.hoisted(() => ({ canvasMounts: { count: 0 } }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "sign-token" }),
}));

vi.mock("@/components/authority-forms/SignatureCanvas", async () => {
  const { useEffect } = await import("react");
  return {
    SignatureCanvas: ({ onSave }: { onSave: (base64: string) => void }) => {
      useEffect(() => {
        canvasMounts.count += 1;
      }, []);
      return (
        <button type="button" onClick={() => onSave("data:image/png;base64,SIG")}>
          Draw signature
        </button>
      );
    },
  };
});

import PublicSigningPage from "@/app/sign/[token]/page";

const FORM_RESPONSE = {
  signatory: { id: "s1", name: "Alex Owner", role: "PROPERTY_OWNER", email: null },
  form: {
    id: "f1",
    templateName: "Authority to Commence Work",
    templateCode: "ATC",
    companyName: "Example Restorations",
    companyLogo: null,
    companyPhone: null,
    companyEmail: null,
    clientName: "Alex Owner",
    clientAddress: "1 Example Street",
    incidentBrief: null,
    incidentDate: null,
    authorityDescription: "Authority text",
    status: "PENDING",
    signatures: [],
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();

async function fillAndSubmit() {
  render(<PublicSigningPage />);
  await screen.findByText("Authority to Commence Work");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Draw signature" }));
  fireEvent.click(screen.getByRole("button", { name: /Sign & Submit/ }));
}

function postCalls() {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "POST",
  );
}

beforeEach(() => {
  canvasMounts.count = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/sign/[token] submit failure (RA-8418)", () => {
  it("keeps the form and signature, explains the failure, and retries", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, FORM_RESPONSE))
      .mockResolvedValueOnce(
        jsonResponse(403, {
          error: { code: "FORBIDDEN", message: "Request blocked" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { success: true }));

    await fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your signature was not submitted");
    expect(alert).toHaveTextContent("Request blocked");
    expect(screen.queryByText("Unable to Load Form")).not.toBeInTheDocument();
    // The canvas was never unmounted, so the drawing is still there.
    expect(canvasMounts.count).toBe(1);

    const submit = screen.getByRole("button", { name: /Sign & Submit/ });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await screen.findByText("Signature Submitted");
    const posts = postCalls();
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[1][1].body as string).signatureData).toBe(
      "data:image/png;base64,SIG",
    );
  });

  it("keeps the form when the network drops during submit", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, FORM_RESPONSE))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your signature was not submitted",
    );
    expect(
      screen.getByRole("button", { name: /Sign & Submit/ }),
    ).toBeEnabled();
    expect(canvasMounts.count).toBe(1);
  });

  it("shows Already Signed when the server answers CONFLICT", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, FORM_RESPONSE))
      .mockResolvedValueOnce(
        jsonResponse(400, {
          error: {
            code: "CONFLICT",
            message: "This form has already been signed",
          },
        }),
      );

    await fillAndSubmit();

    expect(await screen.findByText("Already Signed")).toBeInTheDocument();
  });
});
