// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastError, currentRole } = vi.hoisted(() => ({
  toastError: vi.fn(),
  currentRole: { value: "USER" },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "tech_1", role: currentRole.value } },
    status: "authenticated",
  }),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: toastError,
    success: vi.fn(),
  },
}));

vi.mock("../components/TeamActivityFeed", () => ({
  default: () => null,
}));

import TeamPage from "../page";

describe("TeamPage technician data loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole.value = "USER";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/team/members") {
          return {
            ok: true,
            json: async () => ({
              members: [
                {
                  id: "tech_1",
                  name: "Field Technician",
                  email: "tech@example.com",
                  role: "USER",
                  managedById: null,
                  createdAt: "2026-08-25T00:00:00.000Z",
                },
              ],
            }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
  });

  it("loads members but never calls the manager-only invitations endpoint", async () => {
    render(<TeamPage />);

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/team/members"),
    );
    expect(fetch).not.toHaveBeenCalledWith("/api/team/invites");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("retains the resend idempotency key after an ambiguous network failure", async () => {
    currentRole.value = "ADMIN";
    let resendAttempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/team/members") {
          return { ok: true, json: async () => ({ members: [] }) };
        }
        if (url === "/api/team/invites") {
          return {
            ok: true,
            json: async () => ({
              invites: [{
                id: "invite_1",
                email: "new@example.com",
                role: "USER",
                token: "a".repeat(48),
                expiresAt: "2099-01-01T00:00:00.000Z",
                usedAt: null,
                createdAt: "2026-08-25T00:00:00.000Z",
                createdById: "admin_1",
                managedById: null,
              }],
            }),
          };
        }
        if (url === "/api/team/invites/invite_1/resend") {
          resendAttempt++;
          if (resendAttempt === 1) throw new Error("response lost");
          return { ok: true, json: async () => ({ message: "resent" }) };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Resend Email" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("response lost"));
    fireEvent.click(screen.getByRole("button", { name: "Resend Email" }));
    await waitFor(() => expect(resendAttempt).toBe(2));

    const resendCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => url === "/api/team/invites/invite_1/resend",
    );
    expect(resendCalls).toHaveLength(2);
    expect(resendCalls[0][1].headers["Idempotency-Key"]).toBe(
      resendCalls[1][1].headers["Idempotency-Key"],
    );
  });

  it("catches create-invite network failures and restores the form", async () => {
    currentRole.value = "ADMIN";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/team/members") {
          return { ok: true, json: async () => ({ members: [] }) };
        }
        if (url === "/api/team/invites" && !init?.method) {
          return { ok: true, json: async () => ({ invites: [] }) };
        }
        if (url === "/api/team/invites" && init?.method === "POST") {
          throw new Error("network unavailable");
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Invite Member" }));
    fireEvent.change(screen.getByPlaceholderText("colleague@example.com"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("network unavailable"),
    );
    expect(screen.getByRole("button", { name: "Send Invitation" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("network unavailable");
  });
});
