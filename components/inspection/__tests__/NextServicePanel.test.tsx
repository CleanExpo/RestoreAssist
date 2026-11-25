// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextServicePanel } from "../NextServicePanel";

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body }));
}

afterEach(() => vi.unstubAllGlobals());

describe("NextServicePanel (RA-8220)", () => {
  it("shows the matched services and the draft to copy", async () => {
    mockFetch({
      hasCatalogue: true,
      services: [{ id: "carpet-cleaning", label: "Carpet cleaning" }],
      businessCardUrl: null,
      draft: { subject: "Harbour: next", body: "Hi Jo,\n\n- Carpet cleaning" },
    });
    render(<NextServicePanel inspectionId="insp1" />);
    expect(await screen.findByText("Carpet cleaning")).toBeTruthy();
    expect((screen.getByLabelText("Follow-up draft") as HTMLTextAreaElement).value).toContain("Hi Jo,");
    expect(screen.getByRole("button", { name: "Copy draft" })).toBeTruthy();
  });

  it("points a business with no catalogue at the profile", async () => {
    mockFetch({ hasCatalogue: false, services: [], businessCardUrl: null, draft: null });
    render(<NextServicePanel inspectionId="insp1" />);
    const link = await screen.findByRole("link", { name: "Set up your services" });
    expect(link.getAttribute("href")).toBe("/dashboard/contractors/profile");
  });

  it("renders nothing when the request fails", async () => {
    mockFetch({}, false);
    const { container } = render(<NextServicePanel inspectionId="insp1" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
  });
});
