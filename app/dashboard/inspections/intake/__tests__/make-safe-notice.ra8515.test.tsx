// @vitest-environment jsdom
/**
 * RA-8515 — a replayed save answers makeSafeSeeded: null when the seeding
 * outcome was not recorded. The page must not read that as "seeded".
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/brand/RAIcon", () => ({ RAIcon: () => null }));

import OfficeIntakePage from "../page";

function stubFetch(makeSafeSeeded: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/settings")) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      expect(init?.method).toBe("POST");
      return {
        ok: true,
        status: 201,
        json: async () => ({ inspection: { id: "insp-1", jobNumber: "DRC-0007" }, makeSafeSeeded }),
      };
    }),
  );
}

async function saveJob() {
  render(<OfficeIntakePage />);
  fireEvent.change(screen.getByLabelText("Job address"), { target: { value: "12 Example Street" } });
  fireEvent.change(screen.getByLabelText("Postcode"), { target: { value: "2750" } });
  fireEvent.change(screen.getByLabelText("Client type"), { target: { value: "CLIENT" } });
  fireEvent.change(screen.getByLabelText("Claim type"), { target: { value: "WATER" } });
  fireEvent.submit(screen.getByLabelText("Job address").closest("form")!);
  await screen.findByText("Job DRC-0007 logged.");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("office intake make-safe notice (RA-8515)", () => {
  it("says nothing extra when the checklist was set up", async () => {
    stubFetch(true);
    await saveJob();
    expect(screen.queryByText(/make-safe checklist/)).not.toBeInTheDocument();
  });

  it("warns when the checklist did not set up", async () => {
    stubFetch(false);
    await saveJob();
    expect(screen.getByText(/The make-safe checklist did not set up/)).toBeInTheDocument();
  });

  it("asks the office to check when a replay cannot say", async () => {
    stubFetch(null);
    await saveJob();
    expect(screen.getByText(/could not confirm the make-safe checklist/)).toBeInTheDocument();
  });
});
