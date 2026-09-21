// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/portal-token", () => ({ verifyPortalToken: vi.fn() }));
vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/portal/fetch-portal-content", () => ({
  fetchPublishedPortalContent: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/components/portal/ClientPortalVideos", () => ({
  ClientPortalVideos: () => null,
}));
vi.mock("@/components/portal/PortalContentHub", () => ({
  PortalContentSections: () => null,
}));

import { verifyPortalToken } from "@/lib/portal-token";
import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { prisma } from "@/lib/prisma";
import ClientLearnKioskPage from "../page";

const mVerify = verifyPortalToken as unknown as ReturnType<typeof vi.fn>;
const mLookup = lookupPortalAccount as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const params = Promise.resolve({ token: "tok" });

beforeEach(() => {
  vi.clearAllMocks();
  mLookup.mockResolvedValue(null);
  mVerify.mockReturnValue(null);
  p.inspection.findFirst.mockResolvedValue(null);
  p.inspection.findUnique.mockResolvedValue(null);
});

describe("ClientLearnKioskPage — token honesty (RA-7606)", () => {
  it("shows not-ready, never LinkExpired, for a live account with no inspection", async () => {
    mLookup.mockResolvedValue({ clientId: "c_empty" });

    const jsx = await ClientLearnKioskPage({ params });
    render(jsx);

    expect(screen.getByTestId("portal-not-ready")).toBeInTheDocument();
    expect(
      screen.getByText(/your report is not ready yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("portal-link-expired")).not.toBeInTheDocument();
    expect(screen.queryByText(/job link has expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/expired or invalid/i)).not.toBeInTheDocument();
  });

  it("shows LinkExpired only when neither token type resolves", async () => {
    const jsx = await ClientLearnKioskPage({ params });
    render(jsx);

    expect(screen.getByTestId("portal-link-expired")).toBeInTheDocument();
    expect(screen.getByText(/job link has expired/i)).toBeInTheDocument();
    expect(screen.queryByTestId("portal-not-ready")).not.toBeInTheDocument();
  });
});
