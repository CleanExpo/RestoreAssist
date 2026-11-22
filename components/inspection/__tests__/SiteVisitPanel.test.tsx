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

  // Discovery sweep (Cursor, 6c20e3fbb), same class as the photo picker: the
  // list holds the newest 50 visits, so the next number comes from the
  // highest number shown, never from how many rows came back.
  it("numbers the next visit after the highest visit, even past the 50 listed", async () => {
    const list = Array.from({ length: 50 }, (_, i) => ({
      ...openVisit,
      id: `v${i + 11}`,
      visitNumber: i + 11,
      submittedAt: "2026-11-21T23:00:00.000Z",
    }));
    stubFetch(() => list);
    render(<SiteVisitPanel inspectionId="i1" />);
    expect(await screen.findByRole("button", { name: "Start visit 61" })).toBeInTheDocument();
  });

  // Discovery sweep: a refused change must not stay on screen when the reload
  // after it also fails.
  it("takes back a refused change even when the reload fails", async () => {
    let loads = 0;
    stubFetch(
      () => [openVisit],
      (url, init) => {
        if (url === "/api/inspections/i1/visits/v1" && init?.method === "PATCH") {
          return json({ error: { code: "VALIDATION", message: "Refused" } }, 400);
        }
        if (url.endsWith("/visits") && !init?.method && ++loads > 1) {
          return Promise.reject(new Error("offline"));
        }
        return null;
      },
    );
    render(<SiteVisitPanel inspectionId="i1" />);
    fireEvent.click(await screen.findByLabelText("Tenant"));
    expect(await screen.findByText(/Refused|Could not load/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Tenant")).not.toBeChecked());
  });
  // RA-8522 (RA-8498 known limit 1): the photos API returns 500 at a time.
  // On a larger job the picker follows nextCursor, so an older front of
  // property photo can be chosen, and it stays listed after the save reloads.
  it("loads older photos past the first page and keeps them after a save", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: `ph_${i + 1}`, url: `u${i + 1}`, thumbnailUrl: null }));
    const page2 = [{ id: "ph_501", url: "u501", thumbnailUrl: null }];
    const f = stubFetch(
      () => [openVisit],
      (url) => {
        if (url.endsWith("/photos")) return json({ photos: page1, nextCursor: "ph_500" });
        if (url.endsWith("/photos?cursor=ph_500")) return json({ photos: page2, nextCursor: null });
        return null;
      },
    );
    render(<SiteVisitPanel inspectionId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show 500 newest photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Load older photos" }));
    fireEvent.click(await screen.findByLabelText("Photo 501"));
    await waitFor(() =>
      expect(f).toHaveBeenCalledWith(
        "/api/inspections/i1/visits/v1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ frontPhotoId: "ph_501" }) }),
      ),
    );
    // The reload after the save fetched the newest page again; ph_501 is still offered.
    await waitFor(() => expect(f.mock.calls.filter(([u]) => u === "/api/inspections/i1/photos").length).toBeGreaterThan(1));
    expect(screen.getByLabelText(/^Photo 501/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load older photos" })).not.toBeInTheDocument();
  });

  it("shows the chosen front photo even when it is older than every page loaded", async () => {
    stubFetch(
      () => [
        {
          ...openVisit,
          frontPhotoId: "ph_old",
          frontPhoto: { id: "ph_old", url: "u_old", thumbnailUrl: null },
        },
      ],
      (url) =>
        url.endsWith("/photos")
          ? json({ photos: [{ id: "ph_1", url: "u1", thumbnailUrl: null }], nextCursor: "ph_1" })
          : null,
    );
    render(<SiteVisitPanel inspectionId="i1" />);
    expect(await screen.findByLabelText("Photo 2 (front of property)")).toBeChecked();
  });
});
