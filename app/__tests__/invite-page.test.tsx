// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, signIn, updateSession, toastError } = vi.hoisted(() => ({
  push: vi.fn(),
  signIn: vi.fn(),
  updateSession: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "a".repeat(48) }),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signIn,
  useSession: () => ({ update: updateSession }),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: toastError },
}));

vi.mock("@/components/invite/InviteIdentityStep", () => ({
  InviteIdentityStep: ({ onContinue }: { onContinue: (value: unknown) => void }) => (
    <button
      onClick={() =>
        onContinue({
          name: "Field Technician",
          password: "not-a-real-password",
          phone: "0412345678",
          headshotDataUrl: "data:image/png;base64,AA==",
        })
      }
    >
      Continue identity
    </button>
  ),
}));

vi.mock("@/components/invite/InviteTermsStep", () => ({
  InviteTermsStep: ({ onSubmit }: { onSubmit: (value: unknown) => void }) => (
    <button
      onClick={() =>
        onSubmit({ acceptedTerms: true, acceptedChainOfCustody: true })
      }
    >
      Accept invitation
    </button>
  ),
}));

import InviteAcceptPage from "../invite/[token]/page";

describe("InviteAcceptPage session claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn.mockResolvedValue({ ok: true });
    updateSession.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: "technician@example.com",
            role: "USER",
            roleLabel: "Field Technician",
            organizationName: "Example Restoration",
            inviterName: "Admin",
            expiresAt: "2026-09-01T00:00:00.000Z",
          }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }),
    );
  });

  it("refreshes the accepted technician's JWT before dashboard navigation", async () => {
    render(<InviteAcceptPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Continue identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?firstRun=tech"));
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "technician@example.com",
      password: "not-a-real-password",
      redirect: false,
    });
    expect(updateSession).toHaveBeenCalledTimes(1);
    expect(updateSession.mock.invocationCallOrder[0]).toBeLessThan(
      push.mock.invocationCallOrder[0],
    );
  });

  it("reports the committed invite and routes safely to login when session refresh fails", async () => {
    updateSession.mockRejectedValueOnce(new Error("session refresh unavailable"));
    render(<InviteAcceptPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Continue identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/login?email=technician%40example.com&inviteAccepted=1",
      ),
    );
    expect(toastError).toHaveBeenCalledWith(
      "Invitation accepted, but your session could not be refreshed. Please sign in again.",
    );
    expect(push).not.toHaveBeenCalledWith("/dashboard?firstRun=tech");
  });

  it("renders a structured preview error message instead of an object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { code: "INVITE_EXPIRED", message: "This invitation has expired" },
        }),
      }),
    );

    render(<InviteAcceptPage />);

    expect(await screen.findByText("This invitation has expired")).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
  });

  it("toasts a structured acceptance error message instead of an object", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: "technician@example.com",
            role: "USER",
            roleLabel: "Field Technician",
            organizationName: "Example Restoration",
            inviterName: "Admin",
            expiresAt: "2026-09-01T00:00:00.000Z",
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: { code: "INVITE_USED", message: "This invitation was already used" },
          }),
        }),
    );

    render(<InviteAcceptPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("This invitation was already used"),
    );
    expect(toastError).not.toHaveBeenCalledWith("[object Object]");
  });
});
