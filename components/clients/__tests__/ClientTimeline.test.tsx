// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientTimeline } from "../ClientTimeline";

afterEach(() => vi.unstubAllGlobals());

describe("ClientTimeline (RA-8220)", () => {
  it("lists events linking to their job", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ kind: "job_opened", at: "2026-11-01T00:00:00.000Z", title: "Water damage job NIR-1 opened at 1 Harbour St", inspectionId: "i1" }] }),
    }));
    render(<ClientTimeline clientId="c1" />);
    const link = await screen.findByRole("link", { name: /Water damage job NIR-1/ });
    expect(link.getAttribute("href")).toBe("/dashboard/inspections/i1");
  });

  it("says so when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    render(<ClientTimeline clientId="c1" />);
    expect(await screen.findByText("The timeline could not be loaded.")).toBeTruthy();
  });
});
