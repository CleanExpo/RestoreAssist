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
vi.mock("@/components/portal/ClientPortalVideos", () => ({
  ClientPortalVideos: () => null,
}));

import { verifyPortalToken } from "@/lib/portal-token";
import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { prisma } from "@/lib/prisma";
import ClientPortalPage from "../page";

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
});
