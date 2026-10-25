// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("react-hot-toast", () => ({
  default: { error: toastError, success: vi.fn() },
}));

import { EngagementLicenceModal } from "@/components/attestation/EngagementLicenceModal";

const savedRow = {
  subjectLicenceNumber: "IICRC-123",
  subjectLicenceState: "QLD",
  subjectLicenceClass: null,
  whsCardNumber: "WHS-456",
  publicLiabilityInsurer: "Acme Insurance",
  publicLiabilityPolicyNumber: "PL-789",
  publicLiabilityCoverAmount: null,
  verifiedAt: "2026-10-01T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderModal() {
  return render(
    <EngagementLicenceModal
      open
      onOpenChange={vi.fn()}
      inspectionId="insp-1"
      onConfirmed={vi.fn()}
    />,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  toastError.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EngagementLicenceModal (RA-8090)", () => {
  it("leaves Loading and offers Retry when the GET throws (no signal)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderModal();

    expect(
      await screen.findByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByText("Add your credentials")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/IICRC certificate number/i)).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({ row: savedRow }));
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(
      await screen.findByText("Still using these credentials?"),
    ).toBeInTheDocument();
  });

  it("shows an error, not an empty Add your credentials form, when the GET is non-OK", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "INTERNAL", message: "Internal server error" } }, 500),
    );
    renderModal();

    expect(
      await screen.findByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Internal server error");
    expect(screen.queryByText("Add your credentials")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/IICRC certificate number/i)).not.toBeInTheDocument();
  });

  it("does not show the empty form for a non-OK response that carries { row: null }", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ row: null }, 503));
    renderModal();

    expect(
      await screen.findByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Add your credentials")).not.toBeInTheDocument();
  });

  it("shows the Add your credentials form only for an OK { row: null }", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ row: null }));
    renderModal();

    expect(await screen.findByText("Add your credentials")).toBeInTheDocument();
    expect(screen.getByLabelText(/IICRC certificate number/i)).toHaveValue("");
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("toasts and resets the button when the POST throws (no signal)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ row: savedRow }));
    renderModal();
    const confirm = await screen.findByRole("button", { name: /confirm and continue/i });

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(confirm);

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("button", { name: /confirm and continue/i }),
    ).toBeEnabled();
  });

  it("toasts the server message and resets the button when the POST is non-OK", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ row: savedRow }));
    renderModal();
    const confirm = await screen.findByRole("button", { name: /confirm and continue/i });

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "VALIDATION", message: "Licence expired" } }, 400));
    fireEvent.click(confirm);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Licence expired"));
    expect(
      await screen.findByRole("button", { name: /confirm and continue/i }),
    ).toBeEnabled();
  });
});
