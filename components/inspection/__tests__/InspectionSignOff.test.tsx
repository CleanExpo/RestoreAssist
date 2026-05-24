// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InspectionSignOff from "../InspectionSignOff";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u_1", name: "Jamie Tradie", role: "USER" } },
    status: "authenticated",
  }),
}));

beforeEach(() => {
  fetchMock.mockReset();
  // Default: no recent Authorisation
  fetchMock.mockImplementation((url) => {
    if (
      typeof url === "string" &&
      url.includes("/api/authorisations/most-recent")
    ) {
      return Promise.resolve({ json: async () => ({ row: null }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

const props = {
  inspectionId: "insp_1",
  inspectionNumber: "TEST-001",
  signedAt: null,
  signedByName: null,
  onSigned: vi.fn(),
};

describe("InspectionSignOff state machine", () => {
  it("State A initial: Sign Inspection button enabled, form hidden", async () => {
    render(<InspectionSignOff {...props} />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Sign Inspection/ });
      expect(btn).not.toBeDisabled();
    });
    expect(screen.queryByLabelText(/Full name/i)).not.toBeInTheDocument();
  });

  it("click Sign Inspection in State A opens licence modal", async () => {
    render(<InspectionSignOff {...props} />);
    await waitFor(() =>
      screen.getByRole("button", { name: /Sign Inspection/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Sign Inspection/ }));
    await waitFor(() => {
      expect(screen.getByText(/Add your credentials/i)).toBeInTheDocument();
    });
  });

  it("modal confirm advances to State C: form visible, signatoryName prefilled", async () => {
    fetchMock.mockImplementation((url) => {
      if (
        typeof url === "string" &&
        url.includes("/api/authorisations/most-recent")
      ) {
        return Promise.resolve({ json: async () => ({ row: null }) });
      }
      if (
        typeof url === "string" &&
        url.includes("/api/authorisations") &&
        !url.includes("most-recent")
      ) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, authorisationId: "auth_1" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<InspectionSignOff {...props} />);
    await waitFor(() =>
      screen.getByRole("button", { name: /Sign Inspection/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Sign Inspection/ }));
    await waitFor(() => screen.getByText(/Add your credentials/i));
    fireEvent.change(screen.getByLabelText(/IICRC certificate number/i), {
      target: { value: "IICRC-1" },
    });
    fireEvent.change(screen.getByLabelText(/WHS card/i), {
      target: { value: "WHS-1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Verify and continue/ }),
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("Jamie Tradie")).toBeInTheDocument();
    });
  });

  it("State C: Confirm sign-off disabled until confirmed checkbox checked", async () => {
    fetchMock.mockImplementation((url) => {
      if (
        typeof url === "string" &&
        url.includes("/api/authorisations/most-recent")
      ) {
        return Promise.resolve({
          json: async () => ({
            row: {
              subjectLicenceNumber: "IICRC-1",
              whsCardNumber: "WHS-1",
              verifiedAt: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<InspectionSignOff {...props} />);
    await waitFor(() => screen.getByDisplayValue("Jamie Tradie"));
    const btn = screen.getByRole("button", { name: /Confirm sign-off/i });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(btn).not.toBeDisabled();
  });

  it("recent Authorisation on mount opens directly at State C (skip modal)", async () => {
    fetchMock.mockImplementation((url) => {
      if (
        typeof url === "string" &&
        url.includes("/api/authorisations/most-recent")
      ) {
        return Promise.resolve({
          json: async () => ({
            row: {
              subjectLicenceNumber: "IICRC-1",
              whsCardNumber: "WHS-1",
              verifiedAt: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<InspectionSignOff {...props} />);
    await waitFor(() => screen.getByDisplayValue("Jamie Tradie"));
    expect(screen.queryByText(/Add your credentials/i)).not.toBeInTheDocument();
  });

  it("modal cancel reverts to State A", async () => {
    render(<InspectionSignOff {...props} />);
    await waitFor(() =>
      screen.getByRole("button", { name: /Sign Inspection/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Sign Inspection/ }));
    await waitFor(() => screen.getByText(/Add your credentials/i));
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByText(/Add your credentials/i),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Full name/i)).not.toBeInTheDocument();
  });

  it("submit POSTs sign and calls onSigned", async () => {
    fetchMock.mockImplementation((url) => {
      if (
        typeof url === "string" &&
        url.includes("/api/authorisations/most-recent")
      ) {
        return Promise.resolve({
          json: async () => ({
            row: {
              subjectLicenceNumber: "IICRC-1",
              whsCardNumber: "WHS-1",
              verifiedAt: new Date().toISOString(),
            },
          }),
        });
      }
      if (typeof url === "string" && url.includes("/sign")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const onSigned = vi.fn();
    render(<InspectionSignOff {...props} onSigned={onSigned} />);
    await waitFor(() => screen.getByDisplayValue("Jamie Tradie"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm sign-off/i }));
    await waitFor(() => expect(onSigned).toHaveBeenCalled());
  });
});
