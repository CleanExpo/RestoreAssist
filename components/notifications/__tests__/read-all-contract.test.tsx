// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { router, toast } = vi.hoisted(() => ({
  router: { push: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-hot-toast", () => ({ default: toast }));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import NotificationsPage from "@/app/dashboard/notifications/page";
import { NotificationBell } from "../NotificationBell";

const unreadNotification = {
  id: "notification_1",
  title: "Inspection ready",
  message: "The inspection is ready for review.",
  type: "info",
  read: false,
  createdAt: new Date().toISOString(),
};

function response(ok: boolean, body: unknown = {}) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

beforeEach(() => {
  router.push.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  localStorage.clear();
});

describe("notifications page mark-all contract", () => {
  it("keeps the optimistic read state and reports success after HTTP 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, { notifications: [unreadNotification] }))
      .mockResolvedValueOnce(response(true, { success: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationsPage />);
    await screen.findByText("1 unread");

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "All notifications marked as read",
      ),
    );
    expect(screen.queryByText("1 unread")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("restores unread state and reports failure after a non-2xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, { notifications: [unreadNotification] }))
      .mockResolvedValueOnce(response(false, { error: "Internal server error" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationsPage />);
    await screen.findByText("1 unread");

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to mark all as read"),
    );
    expect(screen.getByText("1 unread")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("notification bell mark-all contract", () => {
  it("clears the unread count after HTTP 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, { notifications: [unreadNotification] }))
      .mockResolvedValueOnce(response(true, { success: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationBell />);
    await screen.findByRole("button", { name: "Notifications (1 unread)" });

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Notifications" }),
      ).toBeInTheDocument(),
    );
  });

  it("preserves the unread count after a non-2xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, { notifications: [unreadNotification] }))
      .mockResolvedValueOnce(response(false, { error: "Internal server error" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationBell />);
    await screen.findByRole("button", { name: "Notifications (1 unread)" });

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", { name: "Notifications (1 unread)" }),
    ).toBeInTheDocument();
  });
});
