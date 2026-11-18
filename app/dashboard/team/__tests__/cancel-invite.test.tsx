// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: toastError, success: toastSuccess },
}));

import { CancelInviteButton } from "../cancel-invite-button";
import { inviteCanBeActioned, inviteState } from "../invite-expiry";

const NOW = Date.parse("2026-11-19T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("invite card state (RA-8462)", () => {
  it("offers actions, including Cancel invite, on every unused invite", () => {
    const active = inviteState({ usedAt: null, revokedAt: null, expiresAt: at(DAY) }, NOW);
    const expired = inviteState({ usedAt: null, revokedAt: null, expiresAt: at(-DAY) }, NOW);
    expect(active).toBe("active");
    expect(expired).toBe("expired");
    expect(inviteCanBeActioned(active)).toBe(true);
    expect(inviteCanBeActioned(expired)).toBe(true);
  });

  it("shows a cancelled invite as cancelled, not expired, and offers no actions", () => {
    // Cancel sets expiresAt to the cancel time, so it must win over expired.
    const state = inviteState(
      { usedAt: null, revokedAt: at(-1000), expiresAt: at(-1000) },
      NOW,
    );
    expect(state).toBe("cancelled");
    expect(inviteCanBeActioned(state)).toBe(false);
  });

  it("offers no actions on an accepted invite", () => {
    const state = inviteState({ usedAt: at(-DAY), expiresAt: at(DAY) }, NOW);
    expect(state).toBe("accepted");
    expect(inviteCanBeActioned(state)).toBe(false);
  });
});

describe("CancelInviteButton (RA-8462)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const invite = { id: "inv1", email: "wrong@example.com" };

  it("asks before cancelling, and sends nothing when the owner keeps the invite", async () => {
    const onCancelled = vi.fn();
    render(<CancelInviteButton invite={invite} onCancelled={onCancelled} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel invite/i }));
    expect(await screen.findByText("Cancel this invite?")).toBeInTheDocument();
    expect(screen.getByText("wrong@example.com")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /keep invite/i }));
    await waitFor(() =>
      expect(screen.queryByText("Cancel this invite?")).not.toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it("calls DELETE /api/team/invites/[id] after confirmation and refreshes the list", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Invite cancelled" }), { status: 200 }),
    );
    const onCancelled = vi.fn();
    render(<CancelInviteButton invite={invite} onCancelled={onCancelled} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel invite/i }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel invite",
    );
    expect(confirm).toBeDefined();
    fireEvent.click(confirm!);

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/team/invites/inv1", {
      method: "DELETE",
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("shows the server's reason and keeps the list unchanged when cancel is refused", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "You can only cancel invites you created" }),
        { status: 403 },
      ),
    );
    const onCancelled = vi.fn();
    render(<CancelInviteButton invite={invite} onCancelled={onCancelled} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel invite/i }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel invite",
    );
    fireEvent.click(confirm!);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "You can only cancel invites you created",
      ),
    );
    expect(onCancelled).not.toHaveBeenCalled();
  });
});
