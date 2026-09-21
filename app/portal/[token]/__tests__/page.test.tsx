// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression guard for RA-6995: the "Moisture Overview" card used to compute
// and render a raw average of moistureLevel on this zero-login client
// portal — drying logs are legal exhibits and must never surface a raw
// meter reading (Pulse epic rule, RA-6948). The curated per-area drying
// timeline (RA-6950, rendered inside ClientPortalStatus) supersedes it.
// Child client components are stubbed so this test stays focused on the
// server component's own render output.
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/portal-token", () => ({ verifyPortalToken: vi.fn() }));
vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("@/components/portal/ClientPortalStatus", () => ({
  ClientPortalStatus: () => null,
}));
vi.mock("@/components/portal/ClientPortalAuthorities", () => ({
  ClientPortalAuthorities: () => null,
}));
vi.mock("@/components/portal/ClientPortalUpload", () => ({
  ClientPortalUpload: () => null,
}));
vi.mock("@/lib/portal/fetch-portal-content", () => ({
  fetchPublishedPortalContent: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/components/portal/ClientPortalVideos", () => ({
  ClientPortalVideos: () => null,
}));
vi.mock("@/components/portal/PortalContentHub", () => ({
  PortalContentSections: () => null,
  PortalAboutSection: () => null,
}));

import { verifyPortalToken } from "@/lib/portal-token";
import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { prisma } from "@/lib/prisma";
import { MAX_PORTAL_AFFECTED_AREAS } from "@/lib/portal/portal-affected-areas";
import { portalMustShowEveryAffectedArea } from "@/lib/portal/__tests__/portal-affected-areas-bar";
import ClientPortalPage from "../page";
import * as portalPageModule from "../page";

const mVerify = verifyPortalToken as unknown as ReturnType<typeof vi.fn>;
const mLookup = lookupPortalAccount as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mLookup.mockResolvedValue(null);
  mVerify.mockReturnValue({ inspectionId: "insp_1" });
  p.inspection.findFirst.mockResolvedValue(null);
  p.inspection.findUnique.mockResolvedValue({
    id: "insp_1",
    inspectionNumber: "INSP-001",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    propertyAddress: "12 Test St, Brisbane",
    technicianName: "Alex Tech",
    user: { organization: null },
    affectedAreas: [
      {
        id: "area_1",
        roomZoneId: "Master Bedroom",
        category: "2",
        class: "2",
        affectedSquareFootage: 12,
      },
    ],
    scopeItems: [{ id: "scope_1", description: "Extract standing water" }],
    report: { status: "DRAFT", id: "r_1" },
  });
});

const params = Promise.resolve({ token: "tok" });

describe("ClientPortalPage — expired token recovery (RA-7551)", () => {
  it("renders a recovery card instead of a blank 404 when the token does not resolve", async () => {
    mLookup.mockResolvedValue(null);
    mVerify.mockReturnValue(null);

    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(screen.getByTestId("portal-link-expired")).toBeInTheDocument();
    expect(screen.getByText(/job link has expired/i)).toBeInTheDocument();
    const inviteLinks = screen.getAllByRole("link", {
      name: /request a new invite/i,
    });
    expect(inviteLinks.length).toBeGreaterThan(0);
    for (const link of inviteLinks) {
      expect(link).toHaveAttribute("href", "/portal/recovery");
    }
    expect(screen.queryByText("12 Test St, Brisbane")).not.toBeInTheDocument();
  });

  it("uses the same recovery card when the inspection record is gone", async () => {
    p.inspection.findUnique.mockResolvedValueOnce(null);

    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(screen.getByTestId("portal-link-expired")).toBeInTheDocument();
  });
});

describe("ClientPortalPage — no raw moisture exposure (RA-6995)", () => {
  it("never renders a raw NN%-style moisture value anywhere on the page", async () => {
    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(screen.getByText("12 Test St, Brisbane")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+(\.\d+)?%/);
  });

  it("no longer renders the raw Moisture Overview card", async () => {
    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(screen.queryByText("Moisture Overview")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Average current moisture/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Drying complete/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Drying in progress/)).not.toBeInTheDocument();
  });

  it("shows affected rooms in plain language without technical classifications or measurements", async () => {
    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(screen.getByText("Master Bedroom")).toBeInTheDocument();
    expect(
      screen.getByText("Included in the restoration plan"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bCat(?:egory)?\s*2\b/i);
    expect(document.body.textContent).not.toMatch(/\bClass\s*2\b/i);
    expect(document.body.textContent).not.toMatch(/\bm²\b/i);
  });
});

describe("ClientPortalPage — affected areas from the job (RA-7573)", () => {
  // Walkthrough C2: a job with N AffectedArea rows must show N areas, and the
  // section must stay hidden when the job has none. Status is a client fetch
  // (force-dynamic updates route); this page is the one that renders the list.
  it("opts the token page out of the Full Route Cache", () => {
    expect(
      (portalPageModule as { dynamic?: string }).dynamic,
    ).toBe("force-dynamic");
  });

  it("loads affected areas with the same bounded query the public portal API uses", async () => {
    await ClientPortalPage({ params });
    expect(p.inspection.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          affectedAreas: expect.objectContaining({
            select: { id: true, roomZoneId: true },
            orderBy: { createdAt: "asc" },
            take: MAX_PORTAL_AFFECTED_AREAS,
          }),
        }),
      }),
    );
  });

  it("renders one list item per affected area the query returned", async () => {
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "insp_1",
      inspectionNumber: "INSP-001",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      propertyAddress: "12 Test St, Brisbane",
      technicianName: "Alex Tech",
      user: { organization: null },
      affectedAreas: [
        { id: "area_1", roomZoneId: "Kitchen" },
        { id: "area_2", roomZoneId: "Hallway" },
      ],
      scopeItems: [{ id: "scope_1" }],
      report: { status: "DRAFT", id: "r_1" },
    });

    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(
      screen.getByRole("heading", { name: /Affected Areas/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Hallway")).toBeInTheDocument();
    expect(
      screen.getAllByText("Included in the restoration plan"),
    ).toHaveLength(2);
    portalMustShowEveryAffectedArea({
      dbCount: 2,
      renderedCount: screen.getAllByTestId("portal-affected-area").length,
      headingShown: true,
    });
  });

  it("hides the Affected Areas section when the job has none", async () => {
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "insp_1",
      inspectionNumber: "INSP-001",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      propertyAddress: "12 Test St, Brisbane",
      technicianName: "Alex Tech",
      user: { organization: null },
      affectedAreas: [],
      scopeItems: [{ id: "scope_1" }],
      report: { status: "DRAFT", id: "r_1" },
    });

    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(screen.getByText("12 Test St, Brisbane")).toBeInTheDocument();
    expect(screen.getByText("Scope of Works")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Affected Areas/ }),
    ).not.toBeInTheDocument();
    portalMustShowEveryAffectedArea({
      dbCount: 0,
      renderedCount: screen.queryAllByTestId("portal-affected-area").length,
      headingShown: false,
    });
  });

  it("does not invent a room name, and does not drop a blank roomZoneId row", async () => {
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "insp_1",
      inspectionNumber: "INSP-001",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      propertyAddress: "12 Test St, Brisbane",
      technicianName: "Alex Tech",
      user: { organization: null },
      affectedAreas: [
        { id: "area_blank", roomZoneId: "   " },
        { id: "area_named", roomZoneId: "Laundry" },
      ],
      scopeItems: [{ id: "scope_1" }],
      report: { status: "DRAFT", id: "r_1" },
    });

    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(
      screen.getByRole("heading", { name: /Affected Areas/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Laundry")).toBeInTheDocument();
    expect(screen.getAllByTestId("portal-affected-area")).toHaveLength(2);
    expect(
      screen.getAllByText("Included in the restoration plan"),
    ).toHaveLength(2);
    expect(screen.queryByText(/Area 1/i)).not.toBeInTheDocument();
    portalMustShowEveryAffectedArea({
      dbCount: 2,
      renderedCount: screen.getAllByTestId("portal-affected-area").length,
      headingShown: true,
    });
  });

  it("shows the Affected Areas heading when the only DB row has a blank name", async () => {
    p.inspection.findUnique.mockResolvedValueOnce({
      id: "insp_1",
      inspectionNumber: "INSP-001",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      propertyAddress: "12 Test St, Brisbane",
      technicianName: "Alex Tech",
      user: { organization: null },
      affectedAreas: [{ id: "area_blank", roomZoneId: "" }],
      scopeItems: [{ id: "scope_1" }],
      report: { status: "DRAFT", id: "r_1" },
    });

    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(
      screen.getByRole("heading", { name: /Affected Areas/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("portal-affected-area")).toHaveLength(1);
    portalMustShowEveryAffectedArea({
      dbCount: 1,
      renderedCount: 1,
      headingShown: true,
    });
  });
});
