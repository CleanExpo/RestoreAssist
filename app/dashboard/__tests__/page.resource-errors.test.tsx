// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const auth = vi.hoisted(() => ({
  session: { user: { id: "synthetic-a", email: "a@example.test", name: "Synthetic A", role: "ADMIN", organizationId: "org-a" } } as Session,
  status: "authenticated",
  replace: vi.fn(),
  update: vi.fn(),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: auth.session, status: auth.status, update: auth.update }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: auth.replace }), useSearchParams: () => new URLSearchParams() }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn() } }));
vi.mock("@/components/dashboard/TechLicenceBanner", () => ({ TechLicenceBanner: () => null }));
vi.mock("@/components/dashboard/InboundJobAlert", () => ({ InboundJobAlert: () => null }));
vi.mock("@/components/onboarding/BasicReportWithoutKeyCta", () => ({ BasicReportWithoutKeyCta: () => null }));
vi.mock("@/components/SessionMetadataCard", () => ({ EvaluatorScoreBadge: () => null }));

import DashboardPage from "../page";

const report = { id: "r-a", title: "Synthetic report A", status: "DRAFT", createdAt: "2026-10-01T00:00:00Z" };
const invoice = { id: "i-a", invoiceNumber: "SYNTHETIC-001", status: "SENT" };
const responses: Record<string, () => Response | Promise<Response>> = {};
let fetchMock: ReturnType<typeof vi.fn>;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const failure = (status = 500) => json({ error: { code: "INTERNAL", message: "Internal server error", eventId: "synthetic-error-1" } }, status);
const resources = ["reports", "clients", "inspections", "invoices"];
function hasResourceRequests() {
  return fetchMock.mock.calls.some(([url]) => resources.some((resource) => String(url).startsWith(`/api/${resource}`)));
}

beforeEach(() => {
  auth.session = { user: { id: "synthetic-a", email: "a@example.test", name: "Synthetic A", role: "ADMIN", organizationId: "org-a" }, expires: "2099-01-01" };
  auth.status = "authenticated";
  auth.replace.mockClear();
  auth.update.mockClear();
  for (const key of Object.keys(responses)) delete responses[key];
  responses["/api/workspace/status"] = () => json({ hasWorkspace: true, status: "READY", ready: true, workspaceId: "workspace-a" });
  responses["/api/reports"] = () => json({ reports: [report] });
  responses["/api/clients"] = () => json({ clients: [{ id: "c-a", name: "Synthetic Client" }] });
  responses["/api/inspections"] = () => json({ inspections: [] });
  responses["/api/invoices"] = () => json({ invoices: [invoice] });
  fetchMock = vi.fn((url: string) => {
    const path = url.split("?")[0];
    if (!responses[path]) throw new Error(`Unexpected synthetic request: ${path}`);
    return Promise.resolve(responses[path]());
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("dashboard resource failures and account separation", () => {
  it("hides cached rows when organisation scope cannot be verified and offers a session retry", async () => {
    const view = render(<DashboardPage />);
    await screen.findAllByText(report.title);
    const before = fetchMock.mock.calls.length;
    auth.session = { ...auth.session, user: { ...auth.session.user, organizationScopeVerified: false } };
    view.rerender(<DashboardPage />);
    expect(screen.queryByText(report.title)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("verify your workspace");
    expect(fetchMock.mock.calls).toHaveLength(before);
    fireEvent.click(screen.getByRole("button", { name: "Retry workspace" }));
    expect(auth.update).toHaveBeenCalledOnce();
  });
  it("preserves successful reports and invoices when clients return a 500, with correlation and targeted retry", async () => {
    responses["/api/clients"] = () => failure();
    render(<DashboardPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Clients: HTTP 500 (INTERNAL) — Error ID: synthetic-error-1");
    expect(screen.getAllByText(report.title).length).toBeGreaterThan(0);
    expect(screen.getByText(invoice.invoiceNumber)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Clients.*People on file/ })).toHaveTextContent("Unavailable");
    expect(screen.queryByText("Start the first job")).not.toBeInTheDocument();
    const count = fetchMock.mock.calls.length;
    responses["/api/clients"] = () => json({ clients: [] });
    fireEvent.click(screen.getByRole("button", { name: "Retry clients" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.slice(count).map(([url]) => url)).toEqual(["/api/clients"]);
  });

  it.each(resources)("identifies a failed %s resource without showing a false empty state", async (resource) => {
    responses[`/api/${resource}`] = () => failure();
    render(<DashboardPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(`${resource[0].toUpperCase()}${resource.slice(1)}: HTTP 500`);
    expect(screen.queryByText("No reports yet")).not.toBeInTheDocument();
    expect(screen.queryByText("No jobs on the board yet")).not.toBeInTheDocument();
    expect(screen.queryByText("No invoices waiting on payment.")).not.toBeInTheDocument();
  });

  it("never reports no records when all four requests fail", async () => {
    for (const resource of resources) responses[`/api/${resource}`] = () => failure();
    render(<DashboardPage />);
    await screen.findByRole("alert");
    expect(screen.getAllByText("Unavailable")).toHaveLength(4);
    expect(screen.queryByText("Start the first job")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing waiting")).not.toBeInTheDocument();
    expect(screen.queryByText("No reports yet")).not.toBeInTheDocument();
    expect(screen.queryByText("No invoices waiting on payment.")).not.toBeInTheDocument();
  });

  it("shows empty states only for successfully loaded empty resources", async () => {
    for (const resource of resources) responses[`/api/${resource}`] = () => json({ [resource]: [] });
    render(<DashboardPage />);
    expect(await screen.findByRole("heading", { name: "Start the first job" })).toBeInTheDocument();
    expect(screen.getByText("No reports yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([401, 403])("surfaces an authentication failure from workspace metadata without treating it as an empty workspace", async (status) => {
    responses["/api/workspace/status"] = () => failure(status);
    render(<DashboardPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(`HTTP ${status}`);
    expect(screen.queryByText("Start the first job")).not.toBeInTheDocument();
  });

  it.each(["PROVISIONING", "SUSPENDED"])("shows %s metadata without replacing per-resource access controls", async (status) => {
    responses["/api/workspace/status"] = () => json({ hasWorkspace: true, status, ready: false, workspaceId: "workspace-a" });
    render(<DashboardPage />);
    await screen.findByRole("alert");
    await screen.findAllByText(report.title);
    expect(hasResourceRequests()).toBe(true);
  });

  it.each([404, 500])("keeps authorised OAuth/legacy records available when separate Workspace metadata returns %s", async (status) => {
    auth.session.user.needsOnboarding = false;
    responses["/api/workspace/status"] = () => failure(status);
    render(<DashboardPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(`Workspace details are unavailable (HTTP ${status})`);
    expect((await screen.findAllByText(report.title)).length).toBeGreaterThan(0);
    expect(hasResourceRequests()).toBe(true);
  });

  it("routes incomplete account onboarding before starting workspace or resource reads", async () => {
    auth.session.user.needsOnboarding = true;
    render(<DashboardPage />);
    await waitFor(() => expect(auth.replace).toHaveBeenCalledWith("/onboarding/account-type"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears loaded A rows on sign-out and never shows them while B is loading", async () => {
    const view = render(<DashboardPage />);
    await screen.findAllByText(report.title);
    auth.status = "unauthenticated";
    view.rerender(<DashboardPage />);
    expect(screen.queryByText(report.title)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to load your workspace" })).toBeInTheDocument();
    auth.session = { ...auth.session, user: { ...auth.session.user, id: "synthetic-b", organizationId: "org-b" } };
    auth.status = "authenticated";
    responses["/api/reports"] = () => new Promise(() => {});
    view.rerender(<DashboardPage />);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/workspace/status")).toHaveLength(2));
    expect(screen.queryByText(report.title)).not.toBeInTheDocument();
  });

  it("resets an existing account's rows when its organisation changes", async () => {
    const view = render(<DashboardPage />);
    await screen.findAllByText(report.title);
    auth.session = { ...auth.session, user: { ...auth.session.user, organizationId: "org-b" } };
    responses["/api/workspace/status"] = () => new Promise(() => {});
    responses["/api/reports"] = () => new Promise(() => {});
    view.rerender(<DashboardPage />);
    expect(screen.queryByText(report.title)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading workspace details");
  });

  it("preserves successful resources when a sibling response is interrupted or returns HTML", async () => {
    responses["/api/clients"] = () => new Response("<html>Sign in</html>", { status: 200 });
    render(<DashboardPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Clients: HTTP 200 (INVALID_RESPONSE)");
    expect(screen.getAllByText(report.title).length).toBeGreaterThan(0);
  });
});


it("does not let a hanging optional workspace metadata request block authorised records", async () => {
  responses["/api/workspace/status"] = () => new Promise(() => {});
  render(<DashboardPage />);
  expect((await screen.findAllByText(report.title)).length).toBeGreaterThan(0);
  expect(screen.getByRole("status")).toHaveTextContent("Loading workspace details");
});
