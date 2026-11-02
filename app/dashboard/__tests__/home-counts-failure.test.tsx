// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const auth = vi.hoisted(() => ({
  session: {
    user: { id: "owner", email: "o@example.test", name: "Owner", role: "ADMIN", organizationId: "org-a" },
    expires: "2099-01-01",
  } as Session,
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: auth.session, status: "authenticated", update: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn() } }));
vi.mock("@/components/dashboard/TechLicenceBanner", () => ({ TechLicenceBanner: () => null }));
vi.mock("@/components/dashboard/InboundJobAlert", () => ({ InboundJobAlert: () => null }));
vi.mock("@/components/onboarding/BasicReportWithoutKeyCta", () => ({ BasicReportWithoutKeyCta: () => null }));
vi.mock("@/components/SessionMetadataCard", () => ({ EvaluatorScoreBadge: () => null }));

import DashboardPage from "../page";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const responses: Record<string, () => Response> = {};

beforeEach(() => {
  responses["/api/workspace/status"] = () =>
    json({ hasWorkspace: true, status: "READY", ready: true, workspaceId: "w" });
  // The lists hold a capped page; each holds one row here.
  responses["/api/reports"] = () =>
    json({ reports: [{ id: "r", title: "Report", status: "DRAFT", createdAt: "2026-10-01T00:00:00Z" }] });
  responses["/api/clients"] = () =>
    json({ clients: [{ id: "c", name: "Client", createdAt: "2026-10-01T00:00:00Z" }] });
  responses["/api/inspections"] = () => json({ inspections: [] });
  responses["/api/invoices"] = () => json({ invoices: [{ id: "i", invoiceNumber: "INV-1", status: "SENT" }] });
  responses["/api/operations/completeness-inbox"] = () => json({ data: [] });
  responses["/api/dashboard/home-counts"] = () =>
    json({ activeJobs: 125, openReports: 245, awaitingPayment: 325, clients: 425 });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => Promise.resolve(responses[url.split("?")[0]]())),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pipelineValue = (name: RegExp) => screen.getByRole("link", { name });

describe("home figures (RA-8146)", () => {
  it("shows server totals, not the length of a capped list", async () => {
    render(<DashboardPage />);
    await waitFor(() =>
      expect(pipelineValue(/Clients.*People on file/)).toHaveTextContent("425"),
    );
    expect(pipelineValue(/Inspect.*Jobs still open/)).toHaveTextContent("125");
    expect(pipelineValue(/Report.*Drafts and reviews/)).toHaveTextContent("245");
    expect(pipelineValue(/Invoice.*Waiting on payment/)).toHaveTextContent("325");
    const hero = screen.getByText("Active jobs").parentElement as HTMLElement;
    expect(within(hero).getByText("125")).toBeInTheDocument();
    expect(screen.getByText("Jobs still on site")).toBeInTheDocument();
  });

  it("shows a failed counts read as unavailable, never as 0, and says so", async () => {
    responses["/api/dashboard/home-counts"] = () =>
      json({ error: { code: "INTERNAL", message: "Internal server error", eventId: "e1" } }, 500);
    render(<DashboardPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 500");
    for (const label of ["Active jobs", "Open reports", "Awaiting payment", "Clients"]) {
      const chip = screen
        .getAllByText(label)
        .map((el) => el.parentElement as HTMLElement)
        .find((el) => el.textContent?.includes("Unavailable"));
      expect(chip, label).toBeDefined();
      expect(chip?.textContent).not.toMatch(/\b0\b/);
    }
    expect(pipelineValue(/Clients.*People on file/)).toHaveTextContent("Unavailable");
    expect(pipelineValue(/Clients.*People on file/)).not.toHaveTextContent(/\b[01]\b/);
  });

  it("does not take a malformed counts response for a real figure", async () => {
    responses["/api/dashboard/home-counts"] = () => json({ activeJobs: "lots" });
    render(<DashboardPage />);
    await screen.findAllByText("Report");
    await waitFor(() =>
      expect(pipelineValue(/Inspect.*Jobs still open/)).toHaveTextContent("Unavailable"),
    );
  });
});
