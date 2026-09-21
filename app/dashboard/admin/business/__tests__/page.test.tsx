// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("react-hot-toast", () => ({ default: toast }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "user_operator_candidate" } },
    status: "authenticated",
  }),
}));

import BusinessMetricsPage from "../page";

const metrics = {
  generatedAt: "2026-09-21T10:00:00.000Z",
  currency: "AUD",
  mrr: 198,
  payingCustomers: 2,
  planUnmatched: 0,
  newTrialsThisMonth: 4,
  convertedThisMonth: 1,
  churnedThisMonth: 0,
  failedCharges30d: 0,
  subscriptionsDeleted30d: 0,
  last30Days: {
    since: "2026-08-22T10:00:00.000Z",
    trialsStarted: 7,
    activated: 3,
    paid: 1,
  },
};

function mockFetch(status: number, body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

beforeEach(() => {
  toast.error.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Admin Business page (RA-7419)", () => {
  it("explains a 403 and shows the viewer's user id instead of a blank page", async () => {
    mockFetch(403, { error: "Forbidden" });

    render(<BusinessMetricsPage />);

    expect(await screen.findByText(/staff list/i)).toBeInTheDocument();
    expect(screen.getByText(/PLATFORM_SUPPORT_USER_IDS/)).toBeInTheDocument();
    expect(screen.getByText("user_operator_candidate")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows trials started, activated, paid and MRR for the last 30 days", async () => {
    mockFetch(200, metrics);

    render(<BusinessMetricsPage />);

    const section = await screen.findByRole("region", { name: /last 30 days/i });
    const figure = (label: RegExp) =>
      section.querySelector(`[data-metric="${label.source}"]`)?.textContent;
    expect(figure(/trials-started/)).toBe("7");
    expect(figure(/activated/)).toBe("3");
    expect(figure(/paid/)).toBe("1");
    expect(figure(/mrr/)).toMatch(/\$198\.00/);
    expect(section).toHaveTextContent(/Trials started/);
    expect(section).toHaveTextContent(/Activated/);
    expect(section).toHaveTextContent(/Paid/);
    expect(section).toHaveTextContent(/MRR/);
  });
});
