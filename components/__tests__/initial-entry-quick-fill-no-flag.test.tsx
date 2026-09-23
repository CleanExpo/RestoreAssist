// @vitest-environment jsdom
/**
 * RA-7711 — the server no longer accepts a browser-sent sample flag (a
 * client-controlled flag could hide a real job), so the Initial Data Entry
 * form must not send one. Quick Fill only fills the form; an explicit submit
 * is the user's own job.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

async function quickFillThenSubmit(edit?: () => Promise<void>) {
  const { container } = render(<InitialDataEntryForm />);
  const button = await screen.findByRole("button", { name: /Quick Fill Test Data/ });
  // Disabled until the credits check resolves.
  await waitFor(() => expect(button).toBeEnabled());
  await act(async () => {
    fireEvent.click(button);
  });
  const useCase = await screen.findByText("Residential Water Damage");
  await act(async () => {
    fireEvent.click(useCase);
  });
  await screen.findByDisplayValue("ABC Co.");
  if (edit) await act(edit);
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    fireEvent.submit(form!);
  });
}

describe("Initial Data Entry Quick Fill sends no sample flag (RA-7711)", () => {
  it("submits an unedited quick-filled form with no quickFillSample field", async () => {
    await quickFillThenSubmit();
    expect(entryBodies).toHaveLength(1);
    expect(entryBodies[0].clientName).toBe("ABC Co.");
    expect(entryBodies[0]).not.toHaveProperty("quickFillSample");
  });
});
