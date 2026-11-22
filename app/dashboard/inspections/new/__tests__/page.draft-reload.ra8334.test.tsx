// @vitest-environment jsdom
// RA-8334: the New Inspection page keeps the created draft id in its URL so a
// reload hands the same inspection back to the form.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const params = vi.hoisted(() => ({ value: "" }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(params.value),
}));
vi.mock("@/components/NIRTechnicianInputForm", () => ({
  default: ({ draftInspectionId, onInspectionCreated }: {
    draftInspectionId?: string;
    onInspectionCreated?: (id: string) => void;
  }) => (
    <div>
      <span data-testid="draft-id">{draftInspectionId ?? "none"}</span>
      <button type="button" onClick={() => onInspectionCreated?.("job-1")}>created</button>
    </div>
  ),
}));

import NewInspectionPage from "../page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("RA-8334 New Inspection page keeps the draft id", () => {
  it("writes the created inspection id into the URL, keeping the other params", async () => {
    params.value = "clientId=client-1";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ client: { id: "client-1", name: "Claim client", address: "1 Test St" } }),
    })));
    render(<NewInspectionPage />);
    expect(await screen.findByTestId("draft-id")).toHaveTextContent("none");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "created" })));
    expect(router.replace).toHaveBeenCalledTimes(1);
    const url = new URL(router.replace.mock.calls[0][0] as string, "https://example.test");
    expect(url.pathname).toBe("/dashboard/inspections/new");
    expect(url.searchParams.get("draft")).toBe("job-1");
    expect(url.searchParams.get("clientId")).toBe("client-1");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("passes the draft id from the URL back to the form after a reload", async () => {
    params.value = "draft=job-1";
    render(<NewInspectionPage />);
    expect(await screen.findByTestId("draft-id")).toHaveTextContent("job-1");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "created" })));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
