// @vitest-environment jsdom
/**
 * RA-7711 (A2) — a quick-filled Initial Data Entry submit must reach the
 * server marked as a sample, so it never becomes a real client or report.
 *
 * The flag is true only while the form still holds the Quick Fill client and
 * property. Once the user edits either, the submission is theirs and goes
 * through unmarked.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1", role: "ADMIN" } }, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));

import InitialDataEntryForm from "@/components/InitialDataEntryForm";

let entryBodies: Array<Record<string, unknown>> = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  entryBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/user/quick-fill-credits")) {
        return jsonResponse({ hasUnlimited: true, creditsRemaining: 0 });
      }
      if (url === "/api/reports/initial-entry") {
        entryBodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ report: { id: "r1" } });
      }
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function quickFillThenSubmit(edit?: () => void) {
  const { container } = render(<InitialDataEntryForm />);
  const button = await screen.findByRole("button", { name: /Quick Fill Test Data/ });
  await act(async () => {
    fireEvent.click(button);
  });
  const useCase = await screen.findByText("Residential Water Damage");
  await act(async () => {
    fireEvent.click(useCase);
  });
  if (edit) await act(async () => edit());
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    fireEvent.submit(form!);
  });
}

describe("Initial Data Entry Quick Fill submits as a sample (RA-7711)", () => {
  it("marks an unedited quick-filled submit as a sample", async () => {
    await quickFillThenSubmit();
    expect(entryBodies).toHaveLength(1);
    expect(entryBodies[0].clientName).toBe("ABC Co.");
    expect(entryBodies[0].quickFillSample).toBe(true);
  });

  it("does not mark it once the user changes the client name", async () => {
    await quickFillThenSubmit(() => {
      fireEvent.change(screen.getByDisplayValue("ABC Co."), {
        target: { value: "Real Client Pty Ltd" },
      });
    });
    expect(entryBodies).toHaveLength(1);
    expect(entryBodies[0].clientName).toBe("Real Client Pty Ltd");
    expect(entryBodies[0].quickFillSample).not.toBe(true);
  });
});
