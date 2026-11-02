// @vitest-environment jsdom
/**
 * RA-8146: the edit route knows nothing about invoices or jobs, so saving an
 * edit must not overwrite the figures the list already read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FormEventHandler } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/clients",
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});
vi.mock("@/components/mobile/MobilePullToRefresh", () => ({
  useMobilePullRefreshHandler: () => undefined,
}));
vi.mock("@/app/dashboard/components/SimpleDashboardPageFrame", () => ({
  SimpleDashboardPageFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/app/dashboard/components/DashboardListPageHeader", () => ({
  DashboardListPageHeader: () => null,
}));
vi.mock("@/components/dashboard/DataSourceSwitcher", () => ({ DataSourceSwitcher: () => null }));
vi.mock("@/components/dashboard/SyncedClientsPanel", () => ({ SyncedClientsPanel: () => null }));
vi.mock("@/components/clients/add-client-modal", () => ({ AddClientModal: () => null }));
vi.mock("@/components/clients/delete-client-modal", () => ({ DeleteClientModal: () => null }));
vi.mock("@/components/clients/bulk-delete-modal", () => ({ BulkDeleteModal: () => null }));
vi.mock("@/components/clients/upgrade-modal", () => ({ UpgradeModal: () => null }));
vi.mock("@/components/clients/edit-client-modal", () => ({
  EditClientModal: ({ onSubmit }: { onSubmit: FormEventHandler<HTMLFormElement> }) => (
    <form onSubmit={onSubmit}>
      <button type="submit">Save edit</button>
    </form>
  ),
}));

import ClientsPage from "../page";

const listed = {
  id: "c1",
  name: "Harbour Strata",
  email: "office@example.test",
  phone: "",
  address: "",
  company: "",
  contactPerson: "",
  notes: "",
  status: "ACTIVE",
  reportsCount: 2,
  totalRevenue: 1234.5,
  invoicedCount: 3,
  lastJob: "5 days ago",
};

let putBody: Record<string, unknown>;

beforeEach(() => {
  // What the edit route returns: the saved row, with no figures of its own.
  putBody = {
    id: "c1",
    name: "Harbour Strata Pty Ltd",
    email: "office@example.test",
    status: "ACTIVE",
    reportsCount: 2,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === "/api/clients/c1" && init?.method === "PUT") {
        return new Response(JSON.stringify(putBody), { status: 200 });
      }
      if (String(url) === "/api/clients") {
        return new Response(JSON.stringify({ clients: [listed] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("editing a client on the list (RA-8146)", () => {
  it("keeps the invoiced figure and last job, and shows the new name", async () => {
    render(<ClientsPage />);
    const edit = await screen.findAllByTitle("Edit");
    expect(screen.queryAllByText(/1,234/).length).toBeGreaterThan(0);

    fireEvent.click(edit[0]);
    fireEvent.click(screen.getByText("Save edit"));

    await waitFor(() =>
      expect(screen.queryAllByText("Harbour Strata Pty Ltd").length).toBeGreaterThan(0),
    );
    expect(screen.queryAllByText(/1,234/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("5 days ago").length).toBeGreaterThan(0);
  });
});
