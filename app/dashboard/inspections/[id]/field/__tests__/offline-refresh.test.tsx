// @vitest-environment jsdom
/**
 * J-08: a reading saved while offline makes the page refresh the job. That
 * refresh fails offline, and it used to replace the whole capture screen
 * with "Could not load this inspection". The last loaded job must stay on
 * screen with an offline notice, and the page refreshes when back online.
 */
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock("@/components/mobile/MobileNav", () => ({ MobileNav: () => null }));
vi.mock("@/components/mobile/QuickMoistureEntry", () => ({
  QuickMoistureEntry: ({ onSaved }: { onSaved?: () => void }) => (
    <button type="button" onClick={() => onSaved?.()}>
      save reading
    </button>
  ),
}));

import FieldModePage from "../page";

const inspection = {
  id: "insp_1",
  inspectionNumber: "INS-1",
  propertyAddress: "1 Synthetic St",
  status: "DRAFT",
  claimType: "WATER",
  photos: [],
  moistureReadings: [],
  classifications: [],
};

function ok(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body } as Response);
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setOnline(true);
  fetchMock = vi.fn((url: string) =>
    url.endsWith("/voice/checklist") ? ok({ items: [] }) : ok({ inspection }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

async function renderLoaded() {
  const params = Promise.resolve({ id: "insp_1" });
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <FieldModePage params={params} />
      </Suspense>,
    );
  });
  await screen.findByText("1 Synthetic St");
}

describe("Field mode when the connection drops (J-08)", () => {
  it("keeps the loaded job on screen and says the reading is on the device", async () => {
    await renderLoaded();

    setOnline(false);
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    fireEvent.click(screen.getByText("save reading"));

    expect(await screen.findByRole("status")).toHaveTextContent(/You're offline/);
    expect(screen.getByText("1 Synthetic St")).toBeInTheDocument();
    expect(screen.getByText("save reading")).toBeInTheDocument();
    expect(screen.queryByText("Could not load this inspection")).not.toBeInTheDocument();
  });

  it("keeps the capture pad mounted while a refresh is in flight", async () => {
    await renderLoaded();

    // A refresh that has not answered yet: a full-page spinner here would
    // unmount the pad and hide its "Saved on this device" message.
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    fireEvent.click(screen.getByText("save reading"));
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(screen.getByText("save reading")).toBeInTheDocument();
    expect(screen.getByText("1 Synthetic St")).toBeInTheDocument();
  });

  it("refreshes the job and clears the notice when the connection returns", async () => {
    await renderLoaded();

    setOnline(false);
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    fireEvent.click(screen.getByText("save reading"));
    await screen.findByRole("status");

    setOnline(true);
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/voice/checklist") ? ok({ items: [] }) : ok({ inspection }),
    );
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByText("1 Synthetic St")).toBeInTheDocument();
  });

  it("does not show the last job under a different job's address", async () => {
    const first = Promise.resolve({ id: "insp_1" });
    let rerender!: ReturnType<typeof render>["rerender"];
    await act(async () => {
      ({ rerender } = render(
        <Suspense fallback={null}>
          <FieldModePage params={first} />
        </Suspense>,
      ));
    });
    await screen.findByText("1 Synthetic St");

    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    const second = Promise.resolve({ id: "insp_2" });
    await act(async () => {
      rerender(
        <Suspense fallback={null}>
          <FieldModePage params={second} />
        </Suspense>,
      );
    });

    expect(await screen.findByText("Could not load this inspection")).toBeInTheDocument();
    expect(screen.queryByText("1 Synthetic St")).not.toBeInTheDocument();
  });

  it("still shows the error page when the first load fails", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    const params = Promise.resolve({ id: "insp_1" });
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <FieldModePage params={params} />
        </Suspense>,
      );
    });

    expect(await screen.findByText("Could not load this inspection")).toBeInTheDocument();
  });
});

function status(code: number) {
  return Promise.resolve({ ok: false, status: code, json: async () => ({}) } as Response);
}

async function saveWith(response: () => Promise<Response>) {
  fetchMock.mockImplementation(response);
  fireEvent.click(screen.getByText("save reading"));
}

/**
 * RA-7765: a refresh that fails because the technician has lost access (the
 * job was reassigned, or they left the team) must not keep the old copy on
 * screen. Offline, network and server errors keep the J-08 behaviour.
 */
describe("Field mode when the technician loses access (RA-7765)", () => {
  it.each([403, 404])("clears the job when a refresh answers %i", async (code) => {
    await renderLoaded();

    await saveWith(() => status(code));

    expect(await screen.findByText("You no longer have access to this job")).toBeInTheDocument();
    expect(screen.queryByText("1 Synthetic St")).not.toBeInTheDocument();
    expect(screen.queryByText("save reading")).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not refresh/)).not.toBeInTheDocument();
  });

  it("keeps the job on screen when the network fails", async () => {
    await renderLoaded();

    await saveWith(() => Promise.reject(new TypeError("Failed to fetch")));

    expect(await screen.findByRole("status")).toHaveTextContent(/Could not refresh/);
    expect(screen.getByText("1 Synthetic St")).toBeInTheDocument();
    expect(screen.queryByText("You no longer have access to this job")).not.toBeInTheDocument();
  });

  it("keeps the job on screen when the server answers 500", async () => {
    await renderLoaded();

    await saveWith(() => status(500));

    expect(await screen.findByRole("status")).toHaveTextContent(/Could not refresh/);
    expect(screen.getByText("1 Synthetic St")).toBeInTheDocument();
    expect(screen.queryByText("You no longer have access to this job")).not.toBeInTheDocument();
  });
});
