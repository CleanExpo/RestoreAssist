// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClaimActions from "../ClaimActions";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

function canvasContextStub() {
  return {
    setTransform: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineCap: "",
    lineJoin: "",
    lineWidth: 0,
    strokeStyle: "",
  };
}

function armCanvas() {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: 402,
  });
  HTMLCanvasElement.prototype.getContext = vi.fn(
    canvasContextStub,
  ) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(
    () => "data:image/png;base64,AA",
  );
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
}

function acknowledgeConsent() {
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /I have read and agree to sign/i,
    }),
  );
}

function strokeSignature(canvas: HTMLCanvasElement) {
  const width = parseFloat(canvas.style.width) || 300;
  const height = parseFloat(canvas.style.height) || 100;
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  fireEvent.pointerDown(canvas, {
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  });
  fireEvent.pointerMove(canvas, {
    clientX: 80,
    clientY: 40,
    pointerId: 1,
  });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

describe("ClaimActions attest failure (RA-8089)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    armCanvas();
  });

  it("shows role=alert when attest fails after transition commits", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "transition-1" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          consentToken: "ct_12345678",
          expiresAt: new Date().toISOString(),
          contentHash: "abc",
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { message: "Role MANAGER required for this attestation" },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ClaimActions
        reportId="rep-1"
        expectedVersion={1}
        actions={[
          {
            key: "TECH_SIGN",
            label: "Technician sign-off",
            requiresAttestation: true,
            attestationType: "TECHNICIAN_SIGN_OFF",
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Technician sign-off" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Commit transition (then sign)" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Attest & sign" }),
      ).toBeInTheDocument(),
    );

    acknowledgeConsent();

    const canvas = screen.getByLabelText(/Signature canvas/i);
    strokeSignature(canvas as HTMLCanvasElement);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Attest & sign" }));
    });

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/Role MANAGER required/i);
      expect(alert).toHaveTextContent(/stage change is already saved/i);
      expect(alert).toHaveTextContent(/Commit transition a second time/i);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain("/transition");
    expect(fetchMock.mock.calls[1][0]).toContain("/pre-attest");
    expect(fetchMock.mock.calls[2][0]).toContain("/attest");
  });

  it("disables Attest & sign until consent is acknowledged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "transition-1" } }),
      }),
    );

    render(
      <ClaimActions
        reportId="rep-consent"
        expectedVersion={1}
        actions={[
          {
            key: "TECH_SIGN",
            label: "Technician sign-off",
            requiresAttestation: true,
            attestationType: "TECHNICIAN_SIGN_OFF",
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Technician sign-off" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Commit transition (then sign)" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/Signature canvas/i)).toBeInTheDocument(),
    );

    const signBtn = screen.getByRole("button", { name: "Attest & sign" });
    expect(signBtn).toBeDisabled();

    strokeSignature(
      screen.getByLabelText(/Signature canvas/i) as HTMLCanvasElement,
    );
    expect(signBtn).toBeDisabled();

    acknowledgeConsent();
    expect(signBtn).not.toBeDisabled();
  });

  it("keeps the signature pad after failure so the user can retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "transition-1" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            consentToken: "ct_abcdefgh",
            expiresAt: new Date().toISOString(),
            contentHash: "def",
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "Unauthorized" }),
        }),
    );

    render(
      <ClaimActions
        reportId="rep-2"
        expectedVersion={2}
        actions={[
          {
            key: "MGR_SIGN",
            label: "Manager countersign",
            requiresAttestation: true,
            attestationType: "MANAGER_COUNTERSIGN",
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Manager countersign" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Commit transition (then sign)" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/Signature canvas/i)).toBeInTheDocument(),
    );

    acknowledgeConsent();
    strokeSignature(screen.getByLabelText(/Signature canvas/i) as HTMLCanvasElement);
    fireEvent.click(screen.getByRole("button", { name: "Attest & sign" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    expect(
      screen.queryByRole("button", { name: "Commit transition (then sign)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Attest & sign" }),
    ).toBeInTheDocument();
  });
});
