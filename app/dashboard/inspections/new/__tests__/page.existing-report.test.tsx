// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const params = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(params.value),
}));
vi.mock("@/components/NIRTechnicianInputForm", () => ({
  default: ({ reportId, initialData }: {
    reportId?: string;
    initialData?: { clientId?: string; propertyAddress?: string };
  }) => (
    <div data-testid="draft-form">
      {reportId}:{initialData?.clientId}:{initialData?.propertyAddress}
    </div>
  ),
}));

import NewInspectionPage from "../page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(reportClientId: string | null) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url.startsWith("/api/reports/")
      ? {
          id: "report-1",
          clientId: reportClientId,
          propertyAddress: "1 Test St",
          propertyPostcode: "4000",
          description: "Source brief",
          technicianAttendanceDate: null,
        }
      : { client: { id: "client-1", name: "Claim client", address: "1 Test St" } },
  })));
}

describe("new inspection from an existing report", () => {
  it("confirms an unlinked report and selected client without cloning the report", async () => {
    params.value = "reportId=report-1&clientId=client-1";
    stubFetch(null);
    render(<NewInspectionPage />);
    expect(await screen.findByTestId("draft-form")).toHaveTextContent("report-1:client-1:1 Test St");
    expect(screen.getByText(/link that report to the selected client/)).toBeInTheDocument();
  });

  it("blocks a different client already linked to the report", async () => {
    params.value = "reportId=report-1&clientId=client-1";
    stubFetch("client-2");
    render(<NewInspectionPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not linked to the selected client");
    expect(screen.queryByTestId("draft-form")).not.toBeInTheDocument();
  });
});

describe("new inspection from a selected client", () => {
  it("waits for delayed client details before mounting editable claim fields", async () => {
    params.value = "clientId=client-1";
    let resolveClient!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => {
      resolveClient = resolve;
    })));

    render(<NewInspectionPage />);
    expect(screen.queryByTestId("draft-form")).not.toBeInTheDocument();
    expect(screen.getByText("Loading draft details...")).toBeInTheDocument();

    resolveClient({ ok: true, json: async () => ({
      client: { id: "client-1", name: "Claim client", address: "2 Verified St" },
    }) });
    expect(await screen.findByTestId("draft-form")).toHaveTextContent(":client-1:2 Verified St");
  });

  it("keeps the claim form unavailable when client verification fails", async () => {
    params.value = "clientId=client-1";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    render(<NewInspectionPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Client not found or unavailable");
    expect(screen.queryByTestId("draft-form")).not.toBeInTheDocument();
  });
});
