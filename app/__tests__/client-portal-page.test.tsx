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
vi.mock("@/lib/portal/resolve-portal-inspection-access", () => ({
  resolvePortalInspectionAccess: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
  },
}));
vi.mock("@/components/portal/ClientPortalStatus", () => ({
  ClientPortalStatus: () => <div data-testid="portal-status" />,
}));
vi.mock("@/components/portal/ClientPortalAuthorities", () => ({
  ClientPortalAuthorities: () => <div data-testid="portal-authorities" />,
}));
vi.mock("@/components/portal/ClientPortalUpload", () => ({
  ClientPortalUpload: () => <div data-testid="portal-upload" />,
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

import { resolvePortalInspectionAccess } from "@/lib/portal/resolve-portal-inspection-access";
import { prisma } from "@/lib/prisma";
import ClientPortalPage from "../portal/[token]/page";

const mResolve = resolvePortalInspectionAccess as unknown as ReturnType<
  typeof vi.fn
>;
const p = prisma as unknown as {
  inspection: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mResolve.mockResolvedValue({
    inspectionId: "insp_1",
    clientId: null,
    source: "LEGACY_HMAC",
    accessMode: "READ_ONLY",
  });
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

describe("ClientPortalPage", () => {
  it("never renders a raw NN%-style moisture value anywhere on the page (RA-6995)", async () => {
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

  it("keeps a legacy no-expiry account readable without interactive controls", async () => {
    mResolve.mockResolvedValueOnce({
      inspectionId: "insp_1",
      clientId: "c_legacy",
      source: "ACCOUNT",
      accessMode: "READ_ONLY",
    });

    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(screen.getByText("12 Test St, Brisbane")).toBeInTheDocument();
    expect(screen.getByText("Viewing only")).toBeInTheDocument();
    expect(screen.getByTestId("portal-status")).toBeInTheDocument();
    expect(
      screen.getByText(/Uploads and approvals are unavailable/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("portal-authorities")).not.toBeInTheDocument();
    expect(screen.queryByTestId("portal-upload")).not.toBeInTheDocument();
  });

  it("keeps legacy HMAC inspection links read-only while they expire", async () => {
    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(screen.getByText("Viewing only")).toBeInTheDocument();
    expect(screen.queryByTestId("portal-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("portal-authorities")).not.toBeInTheDocument();
    expect(screen.queryByTestId("portal-upload")).not.toBeInTheDocument();
  });

  it("preserves interactive controls for a current unexpired account", async () => {
    mResolve.mockResolvedValueOnce({
      inspectionId: "insp_1",
      clientId: "c_current",
      source: "ACCOUNT",
      accessMode: "INTERACTIVE",
    });

    const jsx = await ClientPortalPage({ params });
    render(jsx);

    expect(screen.queryByText("Viewing only")).not.toBeInTheDocument();
    expect(screen.getByTestId("portal-status")).toBeInTheDocument();
    expect(screen.getByTestId("portal-authorities")).toBeInTheDocument();
    expect(screen.getByTestId("portal-upload")).toBeInTheDocument();
  });
});
