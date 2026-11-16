// @vitest-environment jsdom
import type { MouseEvent, ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RA-8397: on /dashboard/invoices/new, leaving with typed work asks first;
// leaving with nothing typed (including a job-prefilled form the person has
// not touched) goes at once; a successful create redirects with no prompt.

const push = vi.fn();
let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => params,
}));
// Mirrors next/link: onNavigate runs first and may cancel the navigation.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onNavigate,
  }: {
    href: string;
    children: ReactNode;
    onNavigate?: (e: { preventDefault: () => void }) => void;
  }) => (
    <a
      href={href}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        let cancelled = false;
        onNavigate?.({ preventDefault: () => (cancelled = true) });
        if (!cancelled) push(href);
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-organization-gst", () => ({
  useOrganizationGst: () => ({
    treatment: { ratePercent: 10 },
    ready: true,
    failed: false,
  }),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import NewInvoicePage from "../page";

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function inputAfterLabel(text: string): HTMLInputElement {
  const el = screen.getByText(text).nextElementSibling;
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`no input after label "${text}"`);
  }
  return el;
}

const cancelButton = () => screen.getByRole("button", { name: "Cancel" });
const leaveDialog = () => screen.queryByText("Leave without saving?");

beforeEach(() => {
  push.mockReset();
  params = new URLSearchParams();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/invoices" && init?.method === "POST") {
      return json({ invoice: { id: "inv1" } }, 201);
    }
    if (url.startsWith("/api/clients")) return json({ clients: [] });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("New invoice leave guard", () => {
  it("leaves at once on Cancel when nothing was typed", async () => {
    render(<NewInvoicePage />);
    fireEvent.click(cancelButton());
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/invoices"),
    );
    expect(leaveDialog()).toBeNull();
  });

  it("leaves at once when the form was only prefilled from a job", async () => {
    params = new URLSearchParams({
      customerName: "Prefilled Customer",
      notes: "Prefilled note",
    });
    render(<NewInvoicePage />);
    await waitFor(() =>
      expect(
        screen.getByDisplayValue("Prefilled Customer"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(cancelButton());
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/invoices"),
    );
    expect(leaveDialog()).toBeNull();
  });

  it("asks before Cancel throws away typed text, and stays when told to", async () => {
    render(<NewInvoicePage />);
    fireEvent.change(inputAfterLabel("Description *"), {
      target: { value: "Carpet drying, 3 days" },
    });
    fireEvent.click(cancelButton());
    expect(
      await screen.findByText("Leave without saving?"),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(leaveDialog()).toBeNull());
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByDisplayValue("Carpet drying, 3 days"),
    ).toBeInTheDocument();
  });

  it("asks before the back link throws away typed text, and leaves on confirm", async () => {
    render(<NewInvoicePage />);
    fireEvent.change(inputAfterLabel("Description *"), {
      target: { value: "Carpet drying, 3 days" },
    });
    fireEvent.click(screen.getByRole("link", { name: /All invoices/ }));
    expect(
      await screen.findByText("Leave without saving?"),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/invoices"),
    );
  });

  it("warns on refresh or tab close once something is typed", () => {
    render(<NewInvoicePage />);
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);
    fireEvent.change(inputAfterLabel("Description *"), {
      target: { value: "Carpet drying, 3 days" },
    });
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);
  });

  it("redirects after a successful create with no leave prompt", async () => {
    params = new URLSearchParams({
      customerName: "Jane Citizen",
      customerEmail: "jane@example.com",
    });
    render(<NewInvoicePage />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("Jane Citizen")).toBeInTheDocument(),
    );
    fireEvent.change(inputAfterLabel("Description *"), {
      target: { value: "Carpet drying, 3 days" },
    });
    fireEvent.change(inputAfterLabel("Unit Price ($) *"), {
      target: { value: "450" },
    });
    await act(async () => {
      fireEvent.submit(cancelButton().closest("form")!);
    });
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/invoices/inv1"),
    );
    expect(leaveDialog()).toBeNull();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });
});
