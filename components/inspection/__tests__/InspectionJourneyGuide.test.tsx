// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

import { InspectionJourneyGuide } from "../InspectionJourneyGuide";

const fetchMock = vi.fn();

const props = {
  inspectionId: "insp_1",
  status: "DRAFT",
  clientId: "client_1",
  reportId: "rep_1",
  sketchRoomCount: 1,
  photoCount: 1,
  moistureCount: 1,
  hasClassification: true,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("InspectionJourneyGuide comms availability", () => {
  it("clears the unavailable state after a later successful fetch", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            emailServiceConfigured: true,
            completenessBlockerCount: 0,
            reportDeliveredAt: null,
            portalLinkEmailedAt: null,
          },
        }),
      });

    const view = render(<InspectionJourneyGuide {...props} />);
    expect(
      await screen.findByText(/Could not check whether email is set up/),
    ).toBeInTheDocument();

    view.rerender(
      <InspectionJourneyGuide {...props} inspectionId="insp_2" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Send the claim portal link or completed report/),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Could not check whether email is set up/),
    ).not.toBeInTheDocument();
  });
});
