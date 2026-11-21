// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteVisitPanel, type SiteVisitRow } from "../SiteVisitPanel";

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

const openVisit: SiteVisitRow = {
  id: "v1",
  visitNumber: 1,
  arrivedAt: "2026-11-21T22:05:00.000Z",
  departedAt: null,
  metOnSite: null,
  frontPhotoId: null,
  frontPhoto: null,
  equipmentOutcome: null,
  equipmentNote: null,
  submittedAt: null,
  minutesOnSite: null,
};

/** Routes the panel's fetches; `visits` is what the list answers each time. */
function stubFetch(visits: () => SiteVisitRow[], extra: (url: string, init?: RequestInit) => unknown = () => null) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const handled = extra(url, init);
    if (handled) return handled;
    if (url.endsWith("/photos")) return json({ photos: [{ id: "ph_1", url: "u1", thumbnailUrl: null }] });
    if (url.endsWith("/visits") && (!init || !init.method)) return json({ data: visits() });
    return json({ data: {} });
  });
  vi.stubGlobal("fetch", f);
  return f;
}

beforeEach(() => vi.restoreAllMocks());

describe("SiteVisitPanel (RA-8498)", () => {
  it("shows the empty state and starts visit 1", async () => {
    let list: SiteVisitRow[] = [];
    const f = stubFetch(
      () => list,
      (url, init) => {
        if (url.endsWith("/visits") && init?.method === "POST") {
          list = [openVisit];
          return json({ data: openVisit }, 201);
        }
        return null;
      },
    );
    render(<SiteVisitPanel inspectionId="i1" />);
    expect(await screen.findByText("No site visit recorded yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start visit" }));
    expect(await screen.findByRole("heading", { name: "Visit 1" })).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith("/api/inspections/i1/visits", expect.objectContaining({ method: "POST" }));
  });

  it("saves who was on site as soon as it is chosen", async () => {
    const f = stubFetch(() => [openVisit]);
    render(<SiteVisitPanel inspectionId="i1" />);
    fireEvent.click(await screen.findByLabelText("Tenant"));
    await waitFor(() =>
      expect(f).toHaveBeenCalledWith(
        "/api/inspections/i1/visits/v1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ metOnSite: "TENANT" }) }),
      ),
    );
  });

  it("lists exactly what the server says is missing when submit is refused", async () => {
    stubFetch(
      () => [openVisit],
      (url, init) =>
        url.endsWith("/submit") && init?.method === "POST"
          ? json(
              {
                error: {
                  code: "VALIDATION",
                  message: "Visit 1 cannot be submitted yet: Departure time, Who was on site.",
                  fields: { departedAt: "Departure time", metOnSite: "Who was on site" },
                },
              },
              422,
            )
          : null,
    );
    render(<SiteVisitPanel inspectionId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Submit visit 1" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("cannot be submitted yet");
    const items = screen.getByRole("list", { name: "Still to record" });
    expect(items).toHaveTextContent("Departure time");
    expect(items).toHaveTextContent("Who was on site");
  });

  it("shows a submitted visit read-only with its time on site, and offers the next visit", async () => {
    stubFetch(() => [
      {
        ...openVisit,
        departedAt: "2026-11-22T00:40:00.000Z",
        metOnSite: "TENANT",
        frontPhotoId: "ph_1",
        equipmentOutcome: "ALL_LEFT",
        submittedAt: "2026-11-22T00:41:00.000Z",
        minutesOnSite: 155,
      },
    ]);
    render(<SiteVisitPanel inspectionId="i1" />);
    const list = await screen.findByRole("list", { name: "Submitted visits" });
    expect(list).toHaveTextContent("2 h 35 min on site");
    expect(list).toHaveTextContent("On site: Tenant");
    expect(list).toHaveTextContent("All equipment left on site");
    expect(screen.getByRole("button", { name: "Start visit 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit visit/ })).not.toBeInTheDocument();
  });

  it("shows the equipment note only when some equipment was removed", async () => {
    stubFetch(() => [{ ...openVisit, equipmentOutcome: "SOME_REMOVED" }]);
    render(<SiteVisitPanel inspectionId="i1" />);
    expect(await screen.findByLabelText("Which equipment was removed")).toBeInTheDocument();
  });

  // Review round 2, P1: the photos list is newest first. On a job with more
  // than 24 photos, an older front of property photo must still be choosable,
  // and the chosen photo must always be shown.
  it("lets the technician reach every photo on a job with more than 24", async () => {
    const photos = Array.from({ length: 30 }, (_, i) => ({ id: `ph_${i + 1}`, url: `u${i + 1}`, thumbnailUrl: null }));
    const f = stubFetch(
      () => [openVisit],
      (url) => (url.endsWith("/photos") ? json({ photos }) : null),
    );
    render(<SiteVisitPanel inspectionId="i1" />);
    await screen.findByLabelText("Photo 1");
    expect(screen.queryByLabelText("Photo 30")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all 30 photos" }));
    fireEvent.click(screen.getByLabelText("Photo 30"));
    await waitFor(() =>
      expect(f).toHaveBeenCalledWith(
        "/api/inspections/i1/visits/v1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ frontPhotoId: "ph_30" }) }),
      ),
    );
  });

  it("always shows the chosen front photo, even when it is not among the newest 24", async () => {
    const photos = Array.from({ length: 30 }, (_, i) => ({ id: `ph_${i + 1}`, url: `u${i + 1}`, thumbnailUrl: null }));
    stubFetch(
      () => [{ ...openVisit, frontPhotoId: "ph_28" }],
      (url) => (url.endsWith("/photos") ? json({ photos }) : null),
    );
    render(<SiteVisitPanel inspectionId="i1" />);
    expect(await screen.findByLabelText("Photo 28 (front of property)")).toBeChecked();
  });
});

