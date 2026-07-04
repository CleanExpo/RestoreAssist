// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Keep the test focused on ClientDetailPage's own fetch/error/race logic.
// PortalInvitationSection runs its own effect+fetch; stub it out.
vi.mock("@/components/dashboard/PortalInvitationSection", () => ({
  default: () => null,
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
// Next 16 supplies route params via the router (useParams), not a synchronous
// prop. Reading `params.id` off the prop returned `undefined` and 404'd every
// client detail page in production; this mock drives the id the page reads.
vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "client-a" })),
}));

import { useParams } from "next/navigation";
import ClientDetailPage from "../page";

const mockUseParams = vi.mocked(useParams);

function renderPage(id: string) {
  mockUseParams.mockReturnValue({ id });
  return render(<ClientDetailPage />);
}

const CLIENT_A = {
  id: "client-a",
  name: "Alpha Restorations",
  email: "alpha@example.com",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  totalRevenue: 1000,
  lastJob: "Job A",
  reportsCount: 0,
  reports: [],
};

const CLIENT_B = {
  ...CLIENT_A,
  id: "client-b",
  name: "Bravo Restorations",
  email: "bravo@example.com",
};

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Route fetch responses by URL so each endpoint can independently succeed/fail.
 */
function routeFetch(handlers: {
  client?: () => any;
  inspections?: () => any;
  documents?: () => any;
}) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/clients/")) {
      return Promise.resolve(handlers.client?.() ?? okJson(CLIENT_A));
    }
    if (url.startsWith("/api/inspections")) {
      return Promise.resolve(
        handlers.inspections?.() ?? okJson({ inspections: [] }),
      );
    }
    if (url.startsWith("/api/restoration-documents")) {
      return Promise.resolve(
        handlers.documents?.() ?? okJson({ documents: [] }),
      );
    }
    return Promise.resolve(okJson({}));
  });
}

describe("ClientDetailPage — route params (Next 16 async-params regression)", () => {
  it("loads the client using the real route id, not undefined", async () => {
    // The server only answers for the real id. If the page read a synchronous
    // params prop it would request /api/clients/undefined → 404 → "Client not
    // found" — the exact production bug this guards against.
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/clients/client-a") return Promise.resolve(okJson(CLIENT_A));
      if (url.startsWith("/api/inspections"))
        return Promise.resolve(okJson({ inspections: [] }));
      if (url.startsWith("/api/restoration-documents"))
        return Promise.resolve(okJson({ documents: [] }));
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchImpl);

    renderPage("client-a");

    await waitFor(() =>
      expect(screen.getByText("Alpha Restorations")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Client not found")).not.toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/clients/client-a",
      expect.anything(),
    );
  });
});

describe("ClientDetailPage — fetch error states (Bugs 1 & 2)", () => {
  it("shows an inspections load-error (not the empty state) when the inspections fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        inspections: () => ({ ok: false, status: 500, json: async () => ({}) }),
      }),
    );

    renderPage("client-a");

    await waitFor(() =>
      expect(screen.getByText("Couldn't load inspections.")).toBeInTheDocument(),
    );
    // The false-negative empty state must NOT appear.
    expect(
      screen.queryByText("No inspections for this client yet."),
    ).not.toBeInTheDocument();
    // Retry affordance is present.
    const retries = screen.getAllByRole("button", { name: "Retry" });
    expect(retries.length).toBeGreaterThan(0);
  });

  it("shows an invoices load-error (not the empty state) when the documents fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        documents: () => ({ ok: false, status: 500, json: async () => ({}) }),
      }),
    );

    renderPage("client-a");

    await waitFor(() =>
      expect(screen.getByText("Couldn't load invoices.")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("No invoices for this client."),
    ).not.toBeInTheDocument();
  });

  it("still shows the genuine empty state when fetches succeed with zero results", async () => {
    vi.stubGlobal("fetch", routeFetch({}));

    renderPage("client-a");

    await waitFor(() =>
      expect(
        screen.getByText("No inspections for this client yet."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("No invoices for this client."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load inspections."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load invoices."),
    ).not.toBeInTheDocument();
  });
});

describe("ClientDetailPage — race guard on fast client switch (Bug 3)", () => {
  it("ignores a stale (slow) response for client A after switching to client B", async () => {
    // Client A's inspections resolve SLOWLY and with A-specific data.
    // Client B resolves fast. After re-render to B, A's late resolution must
    // be dropped (aborted), so B's inspections are shown — not A's.
    let resolveSlowA: ((v: any) => void) | null = null;

    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("clientId=client-a") && url.startsWith("/api/inspections")) {
        return new Promise((resolve) => {
          resolveSlowA = () =>
            resolve(
              okJson({
                inspections: [
                  {
                    id: "insp-a",
                    inspectionNumber: "INSP-A-001",
                    propertyAddress: "1 Alpha St",
                    status: "SUBMITTED",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    submittedAt: null,
                  },
                ],
              }),
            );
        });
      }
      if (url.startsWith("/api/clients/client-a")) return Promise.resolve(okJson(CLIENT_A));
      if (url.startsWith("/api/clients/client-b")) return Promise.resolve(okJson(CLIENT_B));
      if (url.includes("clientId=client-b") && url.startsWith("/api/inspections")) {
        return Promise.resolve(
          okJson({
            inspections: [
              {
                id: "insp-b",
                inspectionNumber: "INSP-B-001",
                propertyAddress: "2 Bravo Ave",
                status: "PROCESSED",
                createdAt: "2026-02-01T00:00:00.000Z",
                submittedAt: null,
              },
            ],
          }),
        );
      }
      return Promise.resolve(okJson({ documents: [] }));
    });
    vi.stubGlobal("fetch", fetchImpl);

    const { rerender } = renderPage("client-a");

    // Switch to B before A's slow inspections resolve.
    mockUseParams.mockReturnValue({ id: "client-b" });
    rerender(<ClientDetailPage />);

    await waitFor(() =>
      expect(screen.getByText("Bravo Restorations")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText("INSP-B-001")).toBeInTheDocument(),
    );

    // Now let client A's stale inspections response resolve late.
    resolveSlowA?.();

    // Give microtasks a chance; A's data must never appear under B.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("INSP-A-001")).not.toBeInTheDocument();
    expect(screen.queryByText("1 Alpha St")).not.toBeInTheDocument();
    expect(screen.getByText("INSP-B-001")).toBeInTheDocument();
  });
});
