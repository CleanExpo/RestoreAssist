// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RA-8454: switching month quickly must never show the earlier month's cost
// data under the later month. The older reply is resolved LAST here, which is
// the slow-request case the ticket describes.

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { role: "ADMIN" } },
    status: "authenticated",
  }),
}));

import AiUsageDashboardPage from "../page";

function usage(totalCostMtd: number) {
  return {
    totalCostMtd,
    pendingBillingCount: 0,
    billedMtd: 0,
    failedCount: 0,
    byEventType: [],
    byUser: [],
    dailyCosts: [],
  };
}

type Pending = {
  url: string;
  signal?: AbortSignal;
  resolve: (body: unknown) => void;
};
let pending: Pending[];

beforeEach(() => {
  pending = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise((resolve) => {
          pending.push({
            url,
            signal: init?.signal ?? undefined,
            resolve: (body) =>
              resolve({ ok: true, json: async () => body } as Response),
          });
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Admin AI usage, month switch (RA-8454)", () => {
  it("shows the newer month's totals when the older reply lands last", async () => {
    render(<AiUsageDashboardPage />);
    expect(pending).toHaveLength(1);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const secondMonth = select.options[1].value;

    fireEvent.change(select, { target: { value: secondMonth } });
    expect(pending).toHaveLength(2);
    expect(pending[1].url).toContain(`month=${secondMonth}`);

    // Newer month answers first; the older (slower) month answers last.
    await act(async () => pending[1].resolve(usage(7)));
    await act(async () => pending[0].resolve(usage(90)));

    expect(await screen.findByText("$7.00 AUD")).toBeInTheDocument();
    expect(screen.queryByText("$90.00 AUD")).not.toBeInTheDocument();
    expect(pending[0].signal?.aborted).toBe(true);
  });
});
