// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HomeownerCapturePanel } from "../HomeownerCapturePanel";

beforeEach(() => vi.restoreAllMocks());

const STATUS_EMPTY = {
  data: {
    pendingFloors: 0,
    pendingRoomCount: 0,
    floorLabels: [],
    activeCaptureLinks: 0,
    roomsNeedingMeasurement: 0,
    measurementRooms: [],
  },
};

const STATUS_PENDING = {
  data: {
    pendingFloors: 1,
    pendingRoomCount: 2,
    floorLabels: ["Ground"],
    activeCaptureLinks: 1,
    roomsNeedingMeasurement: 0,
    measurementRooms: [],
  },
};

function installFetch(
  handler: (url: string, init?: RequestInit) => Promise<{
    ok: boolean;
    json: () => Promise<unknown>;
  }>,
) {
  vi.stubGlobal("fetch", vi.fn(handler));
}

describe("HomeownerCapturePanel", () => {
  it("invites a homeowner and surfaces the capture link", async () => {
    installFetch(async (url, init) => {
      if (url.includes("homeowner-capture-status")) {
        return { ok: true, json: async () => STATUS_EMPTY };
      }
      if (url.includes("capture-invite") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: { url: "https://x/capture/TOK" } }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(<HomeownerCapturePanel inspectionId="i1" />);
    await waitFor(() =>
      expect(screen.getByTestId("homeowner-capture-status")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Invite homeowner to capture" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Capture link")).toHaveValue(
        "https://x/capture/TOK",
      ),
    );
  });

  it("reviews/promotes a submission and reports measurement follow-up", async () => {
    const onPromoted = vi.fn();
    installFetch(async (url, init) => {
      if (url.includes("homeowner-capture-status")) {
        return { ok: true, json: async () => STATUS_PENDING };
      }
      if (url.includes("promote-homeowner")) {
        return {
          ok: true,
          json: async () => ({ data: { promoted: 1, homeownerRooms: 3 } }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(
      <HomeownerCapturePanel inspectionId="i1" onPromoted={onPromoted} />,
    );
    await waitFor(() =>
      expect(screen.getByText(/waiting review/i)).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review homeowner submission" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("homeowner-capture-feedback")).toHaveTextContent(
        /Promoted 1/,
      );
      expect(screen.getByTestId("homeowner-capture-feedback")).toHaveTextContent(
        /on-site measurement/i,
      );
    });
    expect(onPromoted).toHaveBeenCalledTimes(1);
  });

  it("disables review when nothing is pending", async () => {
    installFetch(async (url) => {
      if (url.includes("homeowner-capture-status")) {
        return { ok: true, json: async () => STATUS_EMPTY };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(<HomeownerCapturePanel inspectionId="i1" />);
    await waitFor(() =>
      expect(screen.getByTestId("homeowner-capture-status")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Review homeowner submission" }),
    ).toBeDisabled();
  });

  it("revokes active links", async () => {
    installFetch(async (url, init) => {
      if (url.includes("homeowner-capture-status")) {
        return { ok: true, json: async () => STATUS_EMPTY };
      }
      if (url.includes("capture-invite") && init?.method === "DELETE") {
        return { ok: true, json: async () => ({ data: { revoked: 3 } }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(<HomeownerCapturePanel inspectionId="i1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke capture links" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("homeowner-capture-feedback")).toHaveTextContent(
        /Revoked 3/,
      ),
    );
  });

  it("shows an error message when the invite request fails", async () => {
    installFetch(async (url, init) => {
      if (url.includes("homeowner-capture-status")) {
        return { ok: true, json: async () => STATUS_EMPTY };
      }
      if (url.includes("capture-invite")) {
        return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(<HomeownerCapturePanel inspectionId="i1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Invite homeowner to capture" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Couldn’t create/),
    );
  });
});
