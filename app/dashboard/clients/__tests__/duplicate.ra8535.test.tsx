// @vitest-environment jsdom
/**
 * RA-8535: the Duplicate button used to POST to the duplicate route, which
 * copied the original's email into the new client. A client is unique on
 * (owner, email), so the copy was refused every time. The button now opens the
 * add form with the details copied and the email left blank.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UseFormReturn } from "react-hook-form";

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
vi.mock("@/components/clients/add-client-modal", () => ({
  AddClientModal: ({
    open,
    form,
  }: {
    open: boolean;
    form: UseFormReturn<Record<string, string>>;
  }) =>
    open ? (
      <div data-testid="add-modal">
        <span data-testid="add-name">{form.getValues("name")}</span>
        <span data-testid="add-email">{form.getValues("email")}</span>
        <span data-testid="add-phone">{form.getValues("phone")}</span>
      </div>
    ) : null,
}));
vi.mock("@/components/clients/delete-client-modal", () => ({ DeleteClientModal: () => null }));
vi.mock("@/components/clients/bulk-delete-modal", () => ({ BulkDeleteModal: () => null }));
vi.mock("@/components/clients/upgrade-modal", () => ({ UpgradeModal: () => null }));
vi.mock("@/components/clients/edit-client-modal", () => ({ EditClientModal: () => null }));

import ClientsPage from "../page";

const listed = {
  id: "c1",
  name: "Harbour Strata",
  email: "office@example.test",
  phone: "0400 000 000",
  address: "1 Harbour St",
  company: "",
  contactPerson: "",
  notes: "",
  status: "ACTIVE",
  reportsCount: 2,
  totalRevenue: 0,
  lastJob: "Never",
};

const fetchMock = vi.fn(async (url: string) => {
  if (String(url) === "/api/clients") {
    return new Response(JSON.stringify({ clients: [listed] }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: "duplicate email" }), { status: 400 });
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Duplicate on the client list (RA-8535)", () => {
  it("opens the add form with the details copied and a blank email", async () => {
    render(<ClientsPage />);
    const duplicate = await screen.findAllByTitle("Duplicate");
    fireEvent.click(duplicate[0]);

    await waitFor(() => expect(screen.getByTestId("add-modal")).toBeTruthy());
    expect(screen.getByTestId("add-name").textContent).toBe("Harbour Strata (Copy)");
    expect(screen.getByTestId("add-email").textContent).toBe("");
    expect(screen.getByTestId("add-phone").textContent).toBe("0400 000 000");
    // Nothing is created until the user gives the copy its own email.
    expect(fetchMock.mock.calls.map(([u]) => String(u))).not.toContain(
      "/api/clients/c1/duplicate",
    );
  });
});
